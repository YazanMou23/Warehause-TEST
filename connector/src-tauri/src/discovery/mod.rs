pub mod types;
pub mod mdns;
pub mod escl;
pub mod ssdp;

#[cfg(target_os = "windows")]
pub mod wsd;
#[cfg(target_os = "windows")]
pub mod wia;

use std::collections::{HashMap, HashSet};
use types::DiscoveredDevice;

/// Orchestrate all discovery methods in parallel and return deduplicated devices.
pub async fn run_discovery() -> Vec<DiscoveredDevice> {
    log::info!("Starting unified device discovery...");

    let mut ip_set: HashSet<String>           = HashSet::new();
    let mut meta:   HashMap<String, String>   = HashMap::new();
    let mut devices: Vec<DiscoveredDevice>    = Vec::new();
    let mut seen_ids: HashSet<String>         = HashSet::new();

    // 1. Run multicast protocols in parallel
    let (mdns_ips, ssdp_ips) = tokio::join!(
        mdns::discover_via_mdns(),
        ssdp::discover_via_ssdp(),
    );

    #[cfg(target_os = "windows")]
    let wsd_ips = wsd::discover_via_wsd().await;
    #[cfg(target_os = "windows")]
    wsd_ips.iter().for_each(|ip| { ip_set.insert(ip.clone()); });

    mdns_ips.iter().for_each(|ip| { ip_set.insert(ip.clone()); });
    ssdp_ips.iter().for_each(|ip| { ip_set.insert(ip.clone()); });

    // 2. Windows PnP/WIA/Spooler
    #[cfg(target_os = "windows")]
    {
        let pnp_devices = wia::discover_via_windows_pnp(&mut seen_ids).await;
        devices.extend(pnp_devices);
    }

    // 3. eSCL probe all candidates
    let ip_list: Vec<String> = ip_set.into_iter().collect();
    log::info!("eSCL probing {} candidate IPs...", ip_list.len());

    let mut seen_serials: HashSet<String> = HashSet::new();
    const CHUNK: usize = 25;
    for chunk in ip_list.chunks(CHUNK) {
        let tasks: Vec<_> = chunk.iter().map(|ip| {
            let ip = ip.clone();
            let meta_name = meta.get(&ip).cloned();
            tokio::spawn(async move {
                escl::probe_escl_device(&ip, meta_name, &mut HashSet::new()).await
            })
        }).collect();

        for task in tasks {
            if let Ok(Some(device)) = task.await {
                let key = device.id.clone();
                if !seen_ids.contains(&key) {
                    seen_ids.insert(key);
                    devices.push(device);
                }
            }
        }
    }

    // 4. Always include simulator for demo/testing
    if !seen_ids.contains("SIMULATOR") {
        devices.push(DiscoveredDevice::simulator());
    }

    log::info!("Discovery complete: {} device(s) found.", devices.len());
    devices
}
