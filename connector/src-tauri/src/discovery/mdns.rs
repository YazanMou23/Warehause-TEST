use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::Duration;
use socket2::{Domain, Protocol, Socket, Type};

const MDNS_ADDR: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 251);
const MDNS_PORT: u16 = 5353;
const WAIT_MS: u64 = 2200;

/// Send mDNS PTR queries for printer/scanner service types and collect responding IPs.
pub async fn discover_via_mdns() -> Vec<String> {
    tokio::task::spawn_blocking(|| {
        let mut discovered = std::collections::HashSet::new();

        let services = [
            "_uscan._tcp.local",
            "_uscans._tcp.local",
            "_scanner._tcp.local",
            "_ipp._tcp.local",
            "_ipps._tcp.local",
            "_pdl-datastream._tcp.local",
            "_printer._tcp.local",
        ];

        let packet = build_dns_query(&services);

        let socket = match Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP)) {
            Ok(s) => s,
            Err(e) => { log::warn!("mDNS socket error: {}", e); return vec![]; }
        };

        let _ = socket.set_reuse_address(true);
        let _ = socket.set_broadcast(true);
        let _ = socket.set_multicast_ttl_v4(255);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(WAIT_MS)));

        let bind_addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0);
        if let Err(e) = socket.bind(&bind_addr.into()) {
            log::warn!("mDNS bind error: {}", e);
            return vec![];
        }

        let dest = SocketAddrV4::new(MDNS_ADDR, MDNS_PORT);
        let _ = socket.send_to(&packet, &dest.into());

        let mut buf = [0u8; 4096];
        let deadline = std::time::Instant::now() + Duration::from_millis(WAIT_MS);

        loop {
            if std::time::Instant::now() >= deadline { break; }
            match socket.recv_from(&mut buf) {
                Ok((len, addr)) => {
                    if let SocketAddr::V4(v4) = addr.as_socket().unwrap_or(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))) {
                        let ip = v4.ip().to_string();
                        if !ip.starts_with("127.") {
                            discovered.insert(ip);
                        }
                    }
                }
                Err(_) => break,
            }
        }

        discovered.into_iter().collect()
    }).await.unwrap_or_default()
}

fn build_dns_query(services: &[&str]) -> Vec<u8> {
    let mut buf = Vec::new();
    // Header: ID=0, FLAGS=0, QDCOUNT=services.len()
    buf.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
    let qcount = services.len() as u16;
    buf.extend_from_slice(&qcount.to_be_bytes());
    buf.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    for svc in services {
        for label in svc.split('.') {
            let lb = label.as_bytes();
            buf.push(lb.len() as u8);
            buf.extend_from_slice(lb);
        }
        buf.push(0x00);      // end of name
        buf.extend_from_slice(&[0x00, 0x0C]); // PTR
        buf.extend_from_slice(&[0x00, 0x01]); // IN
    }
    buf
}
