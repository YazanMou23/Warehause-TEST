#[cfg(target_os = "windows")]
use std::net::{Ipv4Addr, SocketAddrV4};
#[cfg(target_os = "windows")]
use std::time::Duration;
#[cfg(target_os = "windows")]
use socket2::{Domain, Protocol, Socket, Type};

const WSD_ADDR: &str = "239.255.255.250";
const WSD_PORT: u16 = 3702;
const WAIT_MS: u64 = 2200;

pub async fn discover_via_wsd() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(|| {
            let mut discovered = std::collections::HashSet::new();
            let uuid = uuid::Uuid::new_v4();
            let probe = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
               xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <soap:Header>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:{}</wsa:MessageID>
  </soap:Header>
  <soap:Body>
    <wsd:Probe><wsd:Types>wsd:Device</wsd:Types></wsd:Probe>
  </soap:Body>
</soap:Envelope>"#, uuid);

            let socket = match Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP)) {
                Ok(s) => s,
                Err(_) => return vec![],
            };
            let _ = socket.set_reuse_address(true);
            let _ = socket.set_read_timeout(Some(Duration::from_millis(WAIT_MS)));
            let _ = socket.bind(&SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0).into());

            let dest: std::net::SocketAddr = format!("{}:{}", WSD_ADDR, WSD_PORT).parse().unwrap();
            let _ = socket.send_to(probe.as_bytes(), &dest.into());

            let mut buf = [0u8; 8192];
            let deadline = std::time::Instant::now() + Duration::from_millis(WAIT_MS);
            loop {
                if std::time::Instant::now() >= deadline { break; }
                match socket.recv_from(&mut buf) {
                    Ok((len, addr)) => {
                        if let Some(sa) = addr.as_socket() {
                            let ip = sa.ip().to_string();
                            if !ip.starts_with("127.") { discovered.insert(ip); }
                        }
                    }
                    Err(_) => break,
                }
            }
            discovered.into_iter().collect()
        }).await.unwrap_or_default()
    }

    #[cfg(not(target_os = "windows"))]
    { vec![] }
}
