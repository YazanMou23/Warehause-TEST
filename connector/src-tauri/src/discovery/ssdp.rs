use std::net::{Ipv4Addr, SocketAddrV4};
use std::time::Duration;
use socket2::{Domain, Protocol, Socket, Type};

const SSDP_ADDR: &str = "239.255.255.250";
const SSDP_PORT: u16 = 1900;
const WAIT_MS: u64 = 2200;

const M_SEARCH: &[u8] = b"M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: \"ssdp:discover\"
MX: 2
ST: ssdp:all

";

pub async fn discover_via_ssdp() -> Vec<String> {
    tokio::task::spawn_blocking(|| {
        let mut discovered = std::collections::HashSet::new();

        let socket = match Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP)) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let _ = socket.set_reuse_address(true);
        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(WAIT_MS)));
        let _ = socket.bind(&SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0).into());

        let dest: std::net::SocketAddr = format!("{}:{}", SSDP_ADDR, SSDP_PORT).parse().unwrap();
        let _ = socket.send_to(M_SEARCH, &dest.into());

        let mut buf = vec![std::mem::MaybeUninit::<u8>::uninit(); 4096];
        let deadline = std::time::Instant::now() + Duration::from_millis(WAIT_MS);

        loop {
            if std::time::Instant::now() >= deadline { break; }
            match socket.recv_from(&mut buf) {
                Ok((len, addr)) => {
                    let data = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, len) };
                    let text = String::from_utf8_lossy(data);
                    if text.to_lowercase().contains("printer")
                        || text.to_lowercase().contains("scanner")
                        || text.to_lowercase().contains("escl")
                        || text.to_lowercase().contains("mfp")
                    {
                        if let Some(sa) = addr.as_socket() {
                            let ip = sa.ip().to_string();
                            if !ip.starts_with("127.") {
                                discovered.insert(ip);
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        discovered.into_iter().collect()
    }).await.unwrap_or_default()
}
