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
    let meta:   HashMap<String, String>   = HashMap::new();
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

    // 4. Correlate WIA-listed eSCL-class devices (e.g. `SWD\ESCL...`) with
    //    eSCL devices discovered over the network. If we found the matching
    //    eSCL endpoint, wire its IP/port into the WIA entry and mark it
    //    WIA-usable=false / ESCL backend so the scan router uses eSCL.
    let escl_entries: Vec<DiscoveredDevice> = devices
        .iter()
        .filter(|d| d.protocol.to_uppercase().contains("ESCL") && d.ip.is_some())
        .cloned()
        .collect();

    for dev in devices.iter_mut() {
        // Only enrich devices that still lack a network address but are
        // eSCL-capable/yet-unresolved (typically WIA-listed WSD/eSCL scanners
        // like the Brother MFC with protocol "WIA/ESCL" and ip=None).
        if dev.ip.is_some() { continue; }
        let is_escl_capable = dev.backends.iter().any(|b| b == "ESCL")
            || dev.protocol.to_uppercase().contains("ESCL");
        if !is_escl_capable { continue; }

        for e in &escl_entries {
            let match_model = dev.model.to_lowercase().replace("series", "").trim().to_string();
            let e_model = e.model.to_lowercase().trim().to_string();
            if !match_model.is_empty()
                && (e_model.contains(&match_model) || match_model.contains(&e_model))
            {
                dev.ip = e.ip.clone();
                dev.port = e.port;
                dev.connection_type = "WIFI".into();
                dev.protocol = "ESCL".into();
                dev.backend = Some("ESCL".into());
                if !dev.backends.iter().any(|b| b == "ESCL") {
                    dev.backends.insert(0, "ESCL".into());
                }
                dev.capabilities = e.capabilities.clone();
                if dev.status == "network_only" {
                    dev.status = "available".into();
                    dev.status_details = format!("eSCL AirScan ({}:{})", e.ip.as_deref().unwrap_or(""), e.port.unwrap_or(0));
                }
                log::info!("Correlated eSCL-class WIA device '{}' with network eSCL at {}:{} (backend=ESCL)", dev.name, e.ip.as_deref().unwrap_or(""), e.port.unwrap_or(0));
                break;
            }
        }
    }

    // 4b. Wire the resolved network IP from the Windows port (e.g. Canon's
    // `CNBJNP_<MAC>` port) into the matching WIA bridge device so it shows as
    // a network scanner and scans via WIA with a known address. eSCL-class
    // devices are skipped here — they are handled by the eSCL correlation above.
    let spooler_ip_devices: Vec<DiscoveredDevice> = devices
        .iter()
        .filter(|d| d.ip.is_some() && d.id.starts_with("WIN_"))
        .cloned()
        .collect();

    for dev in devices.iter_mut() {
        if dev.ip.is_some() { continue; }
        if dev.backends.iter().any(|b| b == "ESCL") { continue; }
        if !dev.backends.iter().any(|b| b == "WIA") { continue; }
        if dev.wia_id.is_none() { continue; }

        let match_model = dev.model.to_lowercase().replace("series", "").replace("(kopie", "").trim().to_string();
        if match_model.is_empty() { continue; }

        for sp in &spooler_ip_devices {
            let sp_model = sp.model.to_lowercase().trim().to_string();
            if sp_model.is_empty() { continue; }
            let sp_name = sp.name.to_lowercase().trim().to_string();
            let dev_name = dev.name.to_lowercase().replace("(kopie 1)", "").trim().to_string();
            let name_match = (!sp_name.is_empty() && !dev_name.is_empty())
                && (sp_name.contains(&dev_name) || dev_name.contains(&sp_name));

            if name_match || (!match_model.is_empty()
                && (sp_model.contains(&match_model) || match_model.contains(&sp_model)))
            {
                if let Some(ip) = &sp.ip {
                    dev.ip = Some(ip.clone());
                    dev.port = sp.port.or(Some(80));
                    dev.connection_type = "WIFI".into();
                    dev.protocol = "WIA".into();
                    if !dev.backends.iter().any(|b| b == "WIA") { dev.backends.push("WIA".into()); }
                    if dev.status == "available" {
                        dev.status_details = format!("WIA-Netzwerk-Scanner ({})", ip);
                    }
                    log::info!("Wired network IP {} into WIA device '{}' (backend=WIA)", ip, dev.name);
                }
                break;
            }
        }
    }

    // 5. Always include simulator for demo/testing
    if !seen_ids.contains("SIMULATOR") {
        devices.push(DiscoveredDevice::simulator());
    }

    log::info!("Discovery complete: {} device(s) found.", devices.len());
    devices
}
