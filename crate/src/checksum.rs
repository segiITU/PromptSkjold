use crate::types::{EntityType, PiiSpan};

/// Validate a PII span using checksum algorithms where applicable.
/// Returns true if the span passes validation (or if no validation applies).
pub fn validate(span: &PiiSpan) -> bool {
    match span.entity_type {
        EntityType::CreditCard => validate_luhn(&span.text),
        EntityType::Iban => validate_iban(&span.text),
        EntityType::Ssn => validate_ssn_format(&span.text),
        EntityType::Cpr => validate_cpr(&span.text),
        // No checksum for other types — pass through
        _ => true,
    }
}

/// Luhn algorithm for credit card number validation.
/// Strips non-digit characters before validation.
fn validate_luhn(text: &str) -> bool {
    let digits: Vec<u32> = text.chars().filter_map(|c| c.to_digit(10)).collect();

    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;

    for &digit in digits.iter().rev() {
        let mut d = digit;
        if double {
            d *= 2;
            if d > 9 {
                d -= 9;
            }
        }
        sum += d;
        double = !double;
    }

    sum % 10 == 0
}

/// IBAN check digit validation (ISO 13616).
/// Rearranges the IBAN and computes mod 97.
fn validate_iban(text: &str) -> bool {
    let cleaned: String = text.chars().filter(|c| !c.is_whitespace()).collect();

    if cleaned.len() < 5 || cleaned.len() > 34 {
        return false;
    }

    // First two must be letters, next two must be digits
    let chars: Vec<char> = cleaned.chars().collect();
    if !chars[0].is_ascii_uppercase()
        || !chars[1].is_ascii_uppercase()
        || !chars[2].is_ascii_digit()
        || !chars[3].is_ascii_digit()
    {
        return false;
    }

    // Move first 4 chars to end
    let rearranged = format!("{}{}", &cleaned[4..], &cleaned[..4]);

    // Convert letters to numbers (A=10, B=11, ..., Z=35)
    let mut numeric = String::new();
    for c in rearranged.chars() {
        if c.is_ascii_digit() {
            numeric.push(c);
        } else if c.is_ascii_uppercase() {
            let val = (c as u32) - ('A' as u32) + 10;
            numeric.push_str(&val.to_string());
        } else {
            return false;
        }
    }

    // Compute mod 97 using chunked arithmetic to avoid overflow
    mod97(&numeric) == 1
}

/// Compute number mod 97 from a decimal string, using chunked processing.
fn mod97(s: &str) -> u64 {
    let mut remainder: u64 = 0;
    for chunk in s.as_bytes().chunks(9) {
        let chunk_str = std::str::from_utf8(chunk).unwrap_or("0");
        let combined = format!("{}{}", remainder, chunk_str);
        remainder = combined.parse::<u64>().unwrap_or(0) % 97;
    }
    remainder
}

/// A value assigned to a password/secret keyword must look like a credential:
/// at least 6 characters, containing a digit or symbol, and not a placeholder.
/// Plain words ("required", "sent") follow the keyword in ordinary prose.
pub fn validate_secret_value(text: &str) -> bool {
    let value = text.trim_matches(|c: char| c == '.' || c == '"' || c == '\'');
    if value.chars().count() < 6 {
        return false;
    }
    let lower = value.to_lowercase();
    const PLACEHOLDERS: &[&str] = &[
        "your_password", "yourpassword", "your-password", "your_api_key", "your-api-key",
        "xxxxxxxx", "********", "password", "changeme", "<password>", "undefined", "required",
    ];
    if PLACEHOLDERS.contains(&lower.as_str())
        || value.starts_with(['<', '{', '$', '%', '['])
        || lower.contains("xxxx")
        || lower.contains("****")
    {
        return false;
    }
    value.chars().any(|c| c.is_ascii_digit() || (!c.is_alphanumeric() && c != '_' && c != '-'))
}

/// Passport / driving-licence numbers always contain a digit; this rejects
/// plain uppercase words that follow the keyword in prose ("PASSPORT CONTROL").
pub fn validate_id_document_value(text: &str) -> bool {
    text.chars().filter(|c| c.is_ascii_digit()).count() >= 5
}

/// A salary/debt figure needs at least four digits ("45.000 kr") or a
/// magnitude word ("2 millioner"); "løn 12" is not a disclosure.
pub fn validate_amount_value(text: &str) -> bool {
    let lower = text.to_lowercase();
    let digits = lower.chars().filter(|c| c.is_ascii_digit()).count();
    digits >= 4
        || (digits >= 2 && lower.trim_end().ends_with('k'))
        || lower.contains("mio")
        || lower.contains("million")
}

/// A value after "user=", "brugernavn" or inside a home-folder path. System and role accounts, words
/// and pure numbers are not a person's username.
pub fn validate_username_value(text: &str) -> bool {
    const NOT_A_USERNAME: &[&str] = &[
        "admin", "administrator", "root", "user", "users", "guest", "test", "testuser", "tester", "system",
        "null", "none", "nil", "true", "false", "undefined", "default", "anonymous", "unknown", "example",
        "demo", "bruger", "brugernavn", "username", "name", "navn", "public", "shared", "all", "ubuntu",
        "runner", "vagrant", "deploy", "node", "app", "docker", "git", "www-data", "service", "daemon",
        "og", "er", "is", "the", "and", "or", "for", "med", "til", "kan", "skal", "har", "bliver", "must",
        "should", "will", "can", "not", "required", "missing", "invalid", "wrong", "forkert", "mangler",
        "field", "felt", "password", "adgangskode", "kodeord", "pw", "pass", "login", "email", "mail",
        "xxx", "xxxx", "your", "din", "dit", "min", "mit", "her", "here", "dig", "mig",
    ];
    let lower = text.to_lowercase();
    if text.chars().count() < 3 || NOT_A_USERNAME.contains(&lower.as_str()) {
        return false;
    }
    // Numbers, IP addresses and versions are not usernames.
    if text.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '-') {
        return false;
    }
    // Bare letters of 3-4 characters are mostly ordinary words; real handles are longer or mixed.
    let has_mixed = text.chars().any(|c| c.is_ascii_digit() || matches!(c, '_' | '.' | '-'));
    has_mixed || text.chars().count() >= 5
}

/// "@lenelund_dk": needs an underscore or a digit after the first letter and must not be a file name.
pub fn validate_handle_value(text: &str) -> bool {
    let body = text.trim_start_matches('@');
    let lower = body.to_lowercase();
    if lower.ends_with("_png") || lower.ends_with("_jpg") || lower.ends_with("_css") {
        return false;
    }
    body.chars().any(|c| c == '_' || c.is_ascii_digit()) && validate_username_value(body)
}

/// "Født i Danmark" names a country, not a birthplace worth flagging.
pub fn validate_birthplace_value(text: &str) -> bool {
    const COUNTRIES: &[&str] = &[
        "danmark", "denmark", "sverige", "sweden", "norge", "norway", "tyskland", "germany",
        "england", "usa", "uk", "grønland", "island", "finland", "polen", "poland",
    ];
    !COUNTRIES.contains(&text.trim().to_lowercase().as_str())
}

/// Validate a Danish CPR number: the DDMMYY prefix must be a real calendar
/// date. The modulus-11 check is deliberately not enforced because CPR numbers
/// issued since 2007 no longer satisfy it. Feb 29 is accepted for any year
/// divisible by 4 since the century is not known.
fn validate_cpr(text: &str) -> bool {
    let digits: Vec<u32> = text.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() != 10 {
        return false;
    }
    let day = digits[0] * 10 + digits[1];
    let month = digits[2] * 10 + digits[3];
    let year = digits[4] * 10 + digits[5];
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if year % 4 == 0 {
                29
            } else {
                28
            }
        }
        _ => return false,
    };
    day >= 1 && day <= max_day
}

/// Validate SSN format: XXX-XX-XXXX with additional rules.
/// Area number (first 3) cannot be 000, 666, or 900-999.
/// Group number (middle 2) cannot be 00.
/// Serial number (last 4) cannot be 0000.
fn validate_ssn_format(text: &str) -> bool {
    let parts: Vec<&str> = text.split('-').collect();
    if parts.len() != 3 {
        return false;
    }

    let area: u32 = match parts[0].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };
    let group: u32 = match parts[1].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };
    let serial: u32 = match parts[2].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    if area == 0 || area == 666 || area >= 900 {
        return false;
    }
    if group == 0 {
        return false;
    }
    if serial == 0 {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::DetectionSource;

    #[test]
    fn cpr_accepts_real_dates_and_rejects_impossible_ones() {
        let ok = |t: &str| validate_cpr(t);
        assert!(ok("010190-1234"));
        assert!(ok("0101901234"));
        assert!(ok("290200-1234")); // leap year
        assert!(!ok("300290-1234")); // 30 Feb
        assert!(!ok("290291-1234")); // 29 Feb non-leap
        assert!(!ok("311190-1234")); // 31 Nov
    }

    fn make_span(text: &str, entity_type: EntityType) -> PiiSpan {
        PiiSpan::new(
            0,
            text.len(),
            entity_type,
            0.9,
            text.to_string(),
            DetectionSource::Regex,
        )
    }

    // --- Luhn tests ---

    #[test]
    fn test_luhn_valid_visa() {
        assert!(validate_luhn("4111111111111111"));
    }

    #[test]
    fn test_luhn_valid_with_separators() {
        assert!(validate_luhn("4111-1111-1111-1111"));
    }

    #[test]
    fn test_luhn_valid_with_spaces() {
        assert!(validate_luhn("4111 1111 1111 1111"));
    }

    #[test]
    fn test_luhn_invalid() {
        assert!(!validate_luhn("4111111111111112"));
    }

    #[test]
    fn test_luhn_too_short() {
        assert!(!validate_luhn("411111"));
    }

    #[test]
    fn test_luhn_valid_mastercard() {
        assert!(validate_luhn("5500000000000004"));
    }

    // --- IBAN tests ---

    #[test]
    fn test_iban_valid_german() {
        assert!(validate_iban("DE89370400440532013000"));
    }

    #[test]
    fn test_iban_valid_with_spaces() {
        assert!(validate_iban("DE89 3704 0044 0532 0130 00"));
    }

    #[test]
    fn test_iban_valid_british() {
        assert!(validate_iban("GB29NWBK60161331926819"));
    }

    #[test]
    fn test_iban_invalid_checksum() {
        assert!(!validate_iban("DE00370400440532013000"));
    }

    #[test]
    fn test_iban_too_short() {
        assert!(!validate_iban("DE89"));
    }

    // --- SSN tests ---

    #[test]
    fn test_ssn_valid() {
        assert!(validate_ssn_format("123-45-6789"));
    }

    #[test]
    fn test_ssn_invalid_area_000() {
        assert!(!validate_ssn_format("000-45-6789"));
    }

    #[test]
    fn test_ssn_invalid_area_666() {
        assert!(!validate_ssn_format("666-45-6789"));
    }

    #[test]
    fn test_ssn_invalid_area_900plus() {
        assert!(!validate_ssn_format("900-45-6789"));
    }

    #[test]
    fn test_ssn_invalid_group_00() {
        assert!(!validate_ssn_format("123-00-6789"));
    }

    #[test]
    fn test_ssn_invalid_serial_0000() {
        assert!(!validate_ssn_format("123-45-0000"));
    }

    // --- Integration via validate() ---

    #[test]
    fn test_validate_cc_valid() {
        let span = make_span("4111-1111-1111-1111", EntityType::CreditCard);
        assert!(validate(&span));
    }

    #[test]
    fn test_validate_cc_invalid() {
        let span = make_span("1234-5678-9012-3456", EntityType::CreditCard);
        assert!(!validate(&span));
    }

    #[test]
    fn test_validate_email_passthrough() {
        let span = make_span("test@example.com", EntityType::Email);
        assert!(validate(&span)); // no checksum for email
    }

    #[test]
    fn test_validate_iban_valid() {
        let span = make_span("DE89370400440532013000", EntityType::Iban);
        assert!(validate(&span));
    }

    #[test]
    fn test_validate_ssn_valid() {
        let span = make_span("123-45-6789", EntityType::Ssn);
        assert!(validate(&span));
    }
}
