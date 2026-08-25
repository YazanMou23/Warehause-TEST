/// Validates the Origin header against the configured allowed origins.
/// Returns true if the origin is permitted.
pub fn is_origin_allowed(origin: Option<&str>, allowed_origins: &[String]) -> bool {
    match origin {
        None => {
            // Allow requests with no Origin (e.g. direct curl from localhost)
            true
        }
        Some(o) => allowed_origins.iter().any(|allowed| allowed == o),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allowed_origin() {
        let allowed = vec!["https://app.logiflow.de".to_string()];
        assert!(is_origin_allowed(Some("https://app.logiflow.de"), &allowed));
        assert!(!is_origin_allowed(Some("https://evil.com"), &allowed));
        assert!(is_origin_allowed(None, &allowed));
    }
}
