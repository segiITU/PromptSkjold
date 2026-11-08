use crate::checksum;
use crate::context;
use crate::merger;
use crate::ner;
use crate::regex_recognizers;
use crate::types::{DetectionSource, PiiSpan, PipelineConfig};

/// Run the full PII detection pipeline on the input text.
///
/// Stages:
/// 1. Regex recognizers — structured pattern matching
/// 2. NER (ML) — transformer-based entity recognition (when enabled)
/// 3. Checksum validation — verify structured matches (Luhn, IBAN, SSN)
/// 4. Context word scoring — boost confidence from nearby keywords
/// 5. Span merging — deduplicate overlapping detections
///
/// Returns the final list of PII spans, filtered by the minimum confidence threshold.
pub fn detect(text: &str, config: &PipelineConfig) -> Vec<PiiSpan> {
    detect_with_external_spans(text, config, Vec::new())
}

pub fn detect_with_external_spans(
    text: &str,
    config: &PipelineConfig,
    external_ner_spans: Vec<PiiSpan>,
) -> Vec<PiiSpan> {
    if text.is_empty() {
        return Vec::new();
    }

    // Stage 1: Regex recognizers
    let mut regex_spans = regex_recognizers::detect_regex(text);

    // Stage 2: NER (if enabled and model is loaded)
    let mut ner_spans = if config.ner_enabled && ner::is_model_loaded() {
        ner::detect_ner(text)
    } else {
        Vec::new()
    };
    ner_spans.extend(valid_external_ner_spans(text, external_ner_spans));
    // Model guesses on checksummed types are verified the same way as regex
    // matches: a 13-digit EAN is not a card number just because a model said so.
    ner_spans.retain(|span| match span.entity_type {
        crate::types::EntityType::CreditCard
        | crate::types::EntityType::Iban
        | crate::types::EntityType::Cpr
        | crate::types::EntityType::Ssn => checksum::validate(span),
        _ => true,
    });

    // Stage 3: Checksum validation (filter out invalid regex matches)
    regex_spans.retain(|span| checksum::validate(span));

    // A phone-shaped fragment inside a validated card/IBAN/CPR is not a phone.
    let strong: Vec<(usize, usize)> = regex_spans
        .iter()
        .filter(|s| {
            matches!(
                s.entity_type,
                crate::types::EntityType::CreditCard | crate::types::EntityType::Iban | crate::types::EntityType::Cpr
            )
        })
        .map(|s| (s.start, s.end))
        .collect();
    regex_spans.retain(|s| {
        s.entity_type != crate::types::EntityType::Phone || !strong.iter().any(|&(a, b)| s.start < b && a < s.end)
    });

    // Combine regex and NER spans
    let mut all_spans = regex_spans;
    all_spans.extend(ner_spans);

    // Stage 4: Context word scoring
    context::apply_context_boost(
        &mut all_spans,
        text,
        config.context_window,
        config.context_boost,
    );

    // Stage 5: Span merging (resolve overlaps)
    let merged = merger::merge_spans(all_spans);

    // Filter by source/type-aware confidence threshold
    merged
        .into_iter()
        .filter(|span| span.score >= confidence_threshold_for(span, config))
        .collect()
}

fn valid_external_ner_spans(text: &str, spans: Vec<PiiSpan>) -> Vec<PiiSpan> {
    spans
        .into_iter()
        .filter_map(|mut span| {
            if span.source != DetectionSource::Ner
                || span.start >= span.end
                || span.end > text.len()
                || !text.is_char_boundary(span.start)
                || !text.is_char_boundary(span.end)
                || !span.score.is_finite()
                || !(0.0..=1.0).contains(&span.score)
            {
                return None;
            }

            span.text = text[span.start..span.end].to_string();
            Some(span)
        })
        .collect()
}

fn confidence_threshold_for(span: &PiiSpan, config: &PipelineConfig) -> f64 {
    match span.source {
        DetectionSource::Ner => config.min_confidence.max(ner_min_confidence(span.entity_type)),
        DetectionSource::Regex | DetectionSource::Manual => config.min_confidence,
    }
}

// Per-type NER confidence thresholds. MUST stay in sync with the TS-side
// `NER_THRESHOLD_BY_ENTITY_TYPE` in `src/offscreen/ner-provider.ts`. The TS
// gate filters spans before they cross the WASM boundary; this gate is the
// authoritative final filter the PRD assigns to the Rust pipeline. Lower the
// values together when tuning, or detections passing the TS gate will silently
// drop here (real bug seen with LOCATION "Boston" @ 0.65 dropped by Rust 0.82).
fn ner_min_confidence(entity_type: crate::types::EntityType) -> f64 {
    match entity_type {
        crate::types::EntityType::Person
        | crate::types::EntityType::Location
        | crate::types::EntityType::Address => 0.55,
        // Organization stays at the regex baseline (0.5). PRD user story 17
        // requires NER >= regex baseline; lower would be silently capped by
        // `max(config.min_confidence, ...)` below anyway.
        crate::types::EntityType::Organization => 0.50,
        crate::types::EntityType::Url
        | crate::types::EntityType::Username
        | crate::types::EntityType::Password => 0.60,
        // Account-number model scores are softer in the prototype corpus, but
        // still useful when above the regex baseline.
        crate::types::EntityType::BankAccount => 0.50,
        crate::types::EntityType::Email
        | crate::types::EntityType::Phone
        | crate::types::EntityType::CreditCard
        | crate::types::EntityType::Ssn
        | crate::types::EntityType::Cpr
        | crate::types::EntityType::Iban
        | crate::types::EntityType::IpAddress
        | crate::types::EntityType::Date
        | crate::types::EntityType::IdDocument
        | crate::types::EntityType::BirthDate
        | crate::types::EntityType::JobTitle
        | crate::types::EntityType::FinancialInfo => 0.80,
        // Keep Rust's authoritative cap permissive enough for model-specific
        // TS threshold profiles. AI4Privacy still filters MISC at 0.90 before
        // this boundary; BardsAI maps explicit sensitive labels to MISC at 0.70.
        crate::types::EntityType::Misc => 0.70,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DetectionSource, EntityType};

    struct DetectionCase {
        language: &'static str,
        entity_type: EntityType,
        text: &'static str,
        matched_text: &'static str,
    }

    fn default_config() -> PipelineConfig {
        PipelineConfig::default()
    }

    fn assert_detects(language: &str, text: &str, entity_type: EntityType, matched_text: &str) {
        let result = detect(text, &default_config());
        assert!(
            result
                .iter()
                .any(|span| span.entity_type == entity_type && span.text == matched_text),
            "expected {} {:?} {:?} in {:?}, got {:?}",
            language,
            entity_type,
            matched_text,
            text,
            result
        );
    }

    #[test]
    fn cpr_in_running_text_is_found_end_to_end() {
        // Evaluator miss: the neural model hides PERSON_IDENTIFIER, so patterns own the CPR.
        assert_detects("Danish", "Pia bad om hjælp. Hendes cpr er 230189-6382, og hun bor alene.", EntityType::Cpr, "230189-6382");
        assert_detects("Danish", "Kunde 230189-6382 ringede i dag", EntityType::Cpr, "230189-6382");
        assert_detects("English", "Her national ID, 230189-6382, was on the form.", EntityType::Cpr, "230189-6382");
    }

    fn assert_detects_cases(cases: &[DetectionCase]) {
        for case in cases {
            assert_detects(
                case.language,
                case.text,
                case.entity_type,
                case.matched_text,
            );
        }
    }

    fn external_span(
        text: &str,
        matched_text: &str,
        entity_type: EntityType,
        score: f64,
    ) -> PiiSpan {
        let start = text.find(matched_text).unwrap();
        let end = start + matched_text.len();
        PiiSpan::new(
            start,
            end,
            entity_type,
            score,
            matched_text.to_string(),
            DetectionSource::Ner,
        )
    }

    fn assert_structured_regex_wins_over_same_range_ner(
        text: &str,
        matched_text: &str,
        regex_entity_type: EntityType,
    ) {
        let spans = vec![external_span(text, matched_text, EntityType::Misc, 0.99)];

        let result = detect_with_external_spans(text, &default_config(), spans);

        assert!(
            result.iter().any(|span| {
                span.entity_type == regex_entity_type
                    && span.text == matched_text
                    && span.source == DetectionSource::Regex
            }),
            "expected regex {:?} {:?} to win in {:?}, got {:?}",
            regex_entity_type,
            matched_text,
            text,
            result
        );
        assert!(
            !result.iter().any(|span| {
                span.source == DetectionSource::Ner
                    && span.start == text.find(matched_text).unwrap()
                    && span.end == text.find(matched_text).unwrap() + matched_text.len()
            }),
            "expected same-range NER span to be removed, got {:?}",
            result
        );
    }

    const ENGLISH_STRUCTURED_PII_CASES: &[DetectionCase] = &[
        DetectionCase {
            language: "English",
            entity_type: EntityType::Email,
            text: "Please email david.smith@example.com about the ticket.",
            matched_text: "david.smith@example.com",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::Phone,
            text: "Call me at +1 212-555-1234 tomorrow.",
            matched_text: "+1 212-555-1234",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::CreditCard,
            text: "The payment card is 4111-1111-1111-1111.",
            matched_text: "4111-1111-1111-1111",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::Ssn,
            text: "The employee SSN is 123-45-6789.",
            matched_text: "123-45-6789",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::Iban,
            text: "Transfer funds to IBAN GB29NWBK60161331926819.",
            matched_text: "GB29NWBK60161331926819",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::IpAddress,
            text: "The server IP address is 192.168.1.1.",
            matched_text: "192.168.1.1",
        },
        DetectionCase {
            language: "English",
            entity_type: EntityType::BirthDate,
            text: "The customer was born on January 15, 2024.",
            matched_text: "January 15, 2024",
        },
    ];

    const GERMAN_STRUCTURED_PII_CASES: &[DetectionCase] = &[
        DetectionCase {
            language: "German",
            entity_type: EntityType::Email,
            text: "Bitte senden Sie die Rechnung an anna.mueller@example.de.",
            matched_text: "anna.mueller@example.de",
        },
        DetectionCase {
            language: "German",
            entity_type: EntityType::Phone,
            text: "Telefonnummer des Kunden: +49 30 12345678.",
            matched_text: "+49 30 12345678",
        },
        DetectionCase {
            language: "German",
            entity_type: EntityType::CreditCard,
            text: "Die Kreditkarte lautet 5500 0000 0000 0004.",
            matched_text: "5500 0000 0000 0004",
        },
        DetectionCase {
            language: "German",
            entity_type: EntityType::Iban,
            text: "Die IBAN ist DE89 3704 0044 0532 0130 00.",
            matched_text: "DE89 3704 0044 0532 0130 00",
        },
        DetectionCase {
            language: "German",
            entity_type: EntityType::IpAddress,
            text: "Der interne Server hat die IP 10.0.0.5.",
            matched_text: "10.0.0.5",
        },
        DetectionCase {
            language: "German",
            entity_type: EntityType::Date,
            text: "Das Geburtsdatum ist 15.01.1990.",
            matched_text: "15.01.1990",
        },
    ];

    #[test]
    fn test_empty_text() {
        let result = detect("", &default_config());
        assert!(result.is_empty());
    }

    #[test]
    fn test_no_pii() {
        let result = detect("What is the weather today?", &default_config());
        assert!(result.is_empty());
    }

    #[test]
    fn test_email_detection() {
        let result = detect("Contact john@example.com for details", &default_config());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].entity_type, EntityType::Email);
        assert_eq!(result[0].text, "john@example.com");
    }

    #[test]
    fn test_phone_with_context() {
        let result = detect("call me at 212-555-1234 tomorrow", &default_config());
        let phones: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert!(phones.len() >= 1);
        // "call" is a context keyword, so score should be boosted
        assert!(phones[0].score > 0.70);
    }

    #[test]
    fn test_invalid_cc_filtered_by_checksum() {
        let result = detect("Card number 1234-5678-9012-3456", &default_config());
        let ccs: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::CreditCard)
            .collect();
        // Luhn check should filter this out
        assert!(ccs.is_empty());
    }

    #[test]
    fn test_valid_cc_passes_checksum() {
        let result = detect("Card number 4111-1111-1111-1111", &default_config());
        let ccs: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::CreditCard)
            .collect();
        assert_eq!(ccs.len(), 1);
    }

    #[test]
    fn test_mixed_pii_types() {
        let text = "Email david@corp.com, call 212-555-1234, SSN 123-45-6789";
        let result = detect(text, &default_config());
        let types: Vec<_> = result.iter().map(|s| s.entity_type).collect();
        assert!(types.contains(&EntityType::Email));
        assert!(types.contains(&EntityType::Ssn));
    }

    #[test]
    fn test_high_confidence_threshold() {
        let config = PipelineConfig {
            min_confidence: 0.95,
            ..default_config()
        };
        let result = detect("call 212-555-1234", &config);
        // Phone base score is 0.70 + context boost ~0.85, below 0.95 threshold
        let phones: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert!(phones.is_empty());
    }

    #[test]
    fn test_iban_with_valid_checksum() {
        let result = detect("Transfer to IBAN DE89370400440532013000", &default_config());
        let ibans: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::Iban)
            .collect();
        assert_eq!(ibans.len(), 1);
    }

    #[test]
    fn test_context_boost_applied() {
        let text = "my email address is test@example.com";
        let result = detect(text, &default_config());
        let emails: Vec<_> = result
            .iter()
            .filter(|s| s.entity_type == EntityType::Email)
            .collect();
        assert_eq!(emails.len(), 1);
        // Base email score is 0.95, context boost should push it towards 1.0
        assert!(emails[0].score > 0.95);
    }

    #[test]
    fn test_presidio_example() {
        let text = "Hi, my name is David and my number is 212 555 1234";
        let result = detect(text, &default_config());
        // Should detect at least the phone number
        assert!(!result.is_empty());
    }

    #[test]
    fn test_detects_english_structured_pii_examples() {
        assert_detects_cases(ENGLISH_STRUCTURED_PII_CASES);
    }

    #[test]
    fn test_detects_german_structured_pii_examples() {
        assert_detects_cases(GERMAN_STRUCTURED_PII_CASES);
    }

    #[test]
    fn test_detects_multiple_structured_pii_items_in_english_message() {
        let text = "Email david.smith@example.com, call 212-555-1234, use card 4111-1111-1111-1111, SSN 123-45-6789, IBAN GB29NWBK60161331926819, IP 192.168.1.1, date 1990-01-15.";

        assert_detects(
            "English",
            text,
            EntityType::Email,
            "david.smith@example.com",
        );
        assert_detects("English", text, EntityType::Phone, "212-555-1234");
        assert_detects(
            "English",
            text,
            EntityType::CreditCard,
            "4111-1111-1111-1111",
        );
        assert_detects("English", text, EntityType::Ssn, "123-45-6789");
        assert_detects("English", text, EntityType::Iban, "GB29NWBK60161331926819");
        assert_detects("English", text, EntityType::IpAddress, "192.168.1.1");
        assert_detects("English", text, EntityType::Date, "1990-01-15");
    }

    #[test]
    fn external_ner_span_becomes_final_detection() {
        let text = "My name is Ada Lovelace and I work at Acme Corp.";
        let spans = vec![
            external_span(text, "Ada Lovelace", EntityType::Person, 0.90),
            external_span(text, "Acme Corp", EntityType::Organization, 0.88),
        ];

        let result = detect_with_external_spans(text, &default_config(), spans);

        assert!(result.iter().any(|span| {
            span.entity_type == EntityType::Person
                && span.text == "Ada Lovelace"
                && span.source == DetectionSource::Ner
        }));
        assert!(result.iter().any(|span| {
            span.entity_type == EntityType::Organization
                && span.text == "Acme Corp"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn invalid_external_ner_spans_are_ignored() {
        let text = "My name is Ada Lovelace.";
        let spans = vec![
            PiiSpan::new(
                20,
                10,
                EntityType::Person,
                0.99,
                String::new(),
                DetectionSource::Ner,
            ),
            PiiSpan::new(
                11,
                23,
                EntityType::Person,
                0.99,
                "Ada Lovelace".to_string(),
                DetectionSource::Regex,
            ),
        ];

        let result = detect_with_external_spans(text, &default_config(), spans);

        assert!(result.is_empty());
    }

    #[test]
    fn external_ner_spans_use_stricter_type_thresholds_than_regex_spans() {
        let text = "Ada Lovelace";

        // PERSON threshold = 0.55 (see ner_min_confidence and the matching TS
        // table). 0.54 < threshold; 0.55 == threshold.
        let below_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "Ada Lovelace", EntityType::Person, 0.54)],
        );
        let at_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "Ada Lovelace", EntityType::Person, 0.55)],
        );

        assert!(below_threshold.is_empty());
        assert!(at_threshold.iter().any(|span| {
            span.entity_type == EntityType::Person
                && span.text == "Ada Lovelace"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn organization_ner_spans_match_regex_baseline_threshold() {
        let text = "Acme Corp";

        // ORGANIZATION threshold = 0.50 — pinned to the regex baseline so
        // PRD user story 17 (NER no laxer than regex) holds. Default config
        // min_confidence is also 0.50, so a span at 0.49 fails and 0.50
        // passes.
        let below_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "Acme Corp", EntityType::Organization, 0.49)],
        );
        let at_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "Acme Corp", EntityType::Organization, 0.50)],
        );

        assert!(below_threshold.is_empty());
        assert!(at_threshold.iter().any(|span| {
            span.entity_type == EntityType::Organization
                && span.text == "Acme Corp"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn bank_account_ner_spans_match_regex_baseline_threshold() {
        let text = "Identifier ACCTXYZ";
        let config = PipelineConfig {
            context_boost: 0.0,
            ..default_config()
        };

        // BANK_ACCOUNT stays at the regex baseline for the prototype model:
        // account-number labels are useful but score lower than person,
        // address, and password labels in the curated local corpus.
        let below_threshold = detect_with_external_spans(
            text,
            &config,
            vec![external_span(text, "ACCTXYZ", EntityType::BankAccount, 0.49)],
        );
        let at_threshold = detect_with_external_spans(
            text,
            &config,
            vec![external_span(text, "ACCTXYZ", EntityType::BankAccount, 0.50)],
        );

        assert!(!below_threshold.iter().any(|span| {
            span.entity_type == EntityType::BankAccount && span.source == DetectionSource::Ner
        }));
        assert!(at_threshold.iter().any(|span| {
            span.entity_type == EntityType::BankAccount
                && span.text == "ACCTXYZ"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn misc_ner_spans_require_conservative_confidence() {
        let text = "Reference X123";

        // Rust stays permissive enough for model-specific TS threshold profiles;
        // the AI4Privacy provider keeps its own MISC gate at 0.90.
        let below_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "X123", EntityType::Misc, 0.69)],
        );
        let at_threshold = detect_with_external_spans(
            text,
            &default_config(),
            vec![external_span(text, "X123", EntityType::Misc, 0.70)],
        );

        assert!(below_threshold.is_empty());
        assert!(at_threshold.iter().any(|span| {
            span.entity_type == EntityType::Misc
                && span.text == "X123"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn global_confidence_threshold_still_applies_to_ner_spans() {
        let text = "Ada Lovelace";
        let config = PipelineConfig {
            min_confidence: 0.95,
            ..default_config()
        };

        let result = detect_with_external_spans(
            text,
            &config,
            vec![external_span(text, "Ada Lovelace", EntityType::Person, 0.90)],
        );

        assert!(result.is_empty());
    }

    #[test]
    fn invalid_external_ner_scores_are_ignored() {
        let text = "Ada Lovelace";
        let spans = vec![PiiSpan::new(
            0,
            text.len(),
            EntityType::Person,
            1.01,
            "Ada Lovelace".to_string(),
            DetectionSource::Ner,
        )];

        let result = detect_with_external_spans(text, &default_config(), spans);

        assert!(result.is_empty());
    }

    #[test]
    fn structured_regex_detections_remain_authoritative_over_same_range_ner() {
        let cases = [
            (
                "Email david.smith@example.com about the ticket.",
                "david.smith@example.com",
                EntityType::Email,
            ),
            (
                "Call me at +1 212-555-1234 tomorrow.",
                "+1 212-555-1234",
                EntityType::Phone,
            ),
            (
                "The payment card is 4111-1111-1111-1111.",
                "4111-1111-1111-1111",
                EntityType::CreditCard,
            ),
            (
                "The employee SSN is 123-45-6789.",
                "123-45-6789",
                EntityType::Ssn,
            ),
            (
                "Transfer funds to IBAN GB29NWBK60161331926819.",
                "GB29NWBK60161331926819",
                EntityType::Iban,
            ),
            (
                "The server IP address is 192.168.1.1.",
                "192.168.1.1",
                EntityType::IpAddress,
            ),
            (
                "The customer was born on January 15, 2024.",
                "January 15, 2024",
                EntityType::BirthDate,
            ),
        ];

        for (text, matched_text, entity_type) in cases {
            assert_structured_regex_wins_over_same_range_ner(text, matched_text, entity_type);
        }
    }

    #[test]
    fn test_detects_danish_structured_pii() {
        let text = "CPR-nr. 010190-1234, tlf +45 20 12 34 56, mail anna@example.dk, IBAN DK50 0040 0440 1162 43, konto 1234-1234567890.";

        assert_detects("Danish", text, EntityType::Cpr, "010190-1234");
        assert_detects("Danish", text, EntityType::Phone, "+45 20 12 34 56");
        assert_detects("Danish", text, EntityType::Email, "anna@example.dk");
        assert_detects("Danish", text, EntityType::Iban, "DK50 0040 0440 1162 43");
        assert_detects("Danish", text, EntityType::BankAccount, "1234-1234567890");
    }

    #[test]
    fn test_danish_bare_phone_needs_context() {
        assert_detects("Danish", "Ring til mig på 20123456 i morgen.", EntityType::Phone, "20123456");
        let spans = detect_with_external_spans("Ordrenummer 20123456 er afsendt.", &default_config(), vec![]);
        assert!(!spans.iter().any(|s| s.entity_type == EntityType::Phone));
    }

    #[test]
    fn test_invalid_cpr_dates_are_not_flagged() {
        let spans = detect_with_external_spans("Reference 300290-1234 fra systemet.", &default_config(), vec![]);
        assert!(!spans.iter().any(|s| s.entity_type == EntityType::Cpr));
    }

    #[test]
    fn test_digit_runs_on_adjacent_lines_are_not_a_phone_number() {
        let text = "status=200\n2025-03-01 12:30:45 job finished\n500\n1234 5678";
        let spans = detect_with_external_spans(text, &default_config(), vec![]);
        assert!(
            !spans.iter().any(|s| s.entity_type == EntityType::Phone && s.text.contains('\n')),
            "phone span crossed a newline: {:?}",
            spans
        );
    }

    #[test]
    fn test_bare_cpr_needs_context_but_separated_cpr_does_not() {
        assert_detects("Danish", "Mit CPR-nummer er 0101901234 tak.", EntityType::Cpr, "0101901234");
        assert_detects("Danish", "Fødselsnummer: 010190 1234.", EntityType::Cpr, "010190 1234");
        let spans = detect_with_external_spans("Reference 0101901234 fra systemet.", &default_config(), vec![]);
        assert!(!spans.iter().any(|s| s.entity_type == EntityType::Cpr));
    }

    #[test]
    fn test_detects_provider_tokens_and_credentials() {
        let aws = concat!("AKIA", "IOSFODNN7EXAMPLE");
        let ghp = concat!("gh", "p_abcdefghijklmnopqrstuvwxyz0123456789");
        let sk = concat!("sk-", "proj-abcdefghijklmnopqrstuvwxyzABCDEFGH");
        let stripe = concat!("sk_", "live_abcdefghijklmnop1234");
        let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        for token in [aws, ghp, sk, stripe, jwt] {
            let text = format!("Brug denne nøgle {} i scriptet.", token);
            assert_detects("secrets", &text, EntityType::Password, token);
        }
    }

    #[test]
    fn test_detects_password_after_keyword_in_both_languages() {
        assert_detects("Danish", "Min adgangskode til systemet er Sommer2024! – er den stærk nok?", EntityType::Password, "Sommer2024!");
        assert_detects("English", "My password for the system is Hunter2024# okay?", EntityType::Password, "Hunter2024#");
        assert_detects("env", "DB_PASSWORD=abc123XYZ789\nPORT=80", EntityType::Password, "abc123XYZ789");
        assert_detects("json", "{\"password\": \"s3cr3t-Value\"}", EntityType::Password, "s3cr3t-Value");
        assert_detects("url", "postgres://app:Pa55w0rd@db.internal:5432/app", EntityType::Password, "Pa55w0rd");
    }

    #[test]
    fn test_password_keyword_followed_by_ordinary_words_is_not_a_secret() {
        for text in [
            "The password reset email is required before login.",
            "Token is required for this endpoint.",
            "Din adgangskode er udløbet, så vælg en ny.",
            "password: <your_password>",
            "api_key = ${API_KEY}",
        ] {
            let spans = detect_with_external_spans(text, &default_config(), vec![]);
            assert!(!spans.iter().any(|s| s.entity_type == EntityType::Password), "false secret in {:?}: {:?}", text, spans);
        }
    }

    #[test]
    fn test_ner_card_guess_must_pass_luhn() {
        let text = "EAN 5637353830736 på varen";
        let spans = vec![external_span(text, "5637353830736", EntityType::CreditCard, 0.95)];
        let result = detect_with_external_spans(text, &default_config(), spans);
        assert!(!result.iter().any(|s| s.entity_type == EntityType::CreditCard), "{:?}", result);
    }

    #[test]
    fn non_overlapping_ner_spans_are_preserved_with_regex_detections() {
        let text = "Email ada@example.com after meeting Ada Lovelace.";
        let spans = vec![external_span(
            text,
            "Ada Lovelace",
            EntityType::Person,
            0.90,
        )];

        let result = detect_with_external_spans(text, &default_config(), spans);

        assert!(result.iter().any(|span| {
            span.entity_type == EntityType::Email
                && span.text == "ada@example.com"
                && span.source == DetectionSource::Regex
        }));
        assert!(result.iter().any(|span| {
            span.entity_type == EntityType::Person
                && span.text == "Ada Lovelace"
                && span.source == DetectionSource::Ner
        }));
    }

    #[test]
    fn test_detects_multiple_structured_pii_items_in_german_message() {
        let text = "E-Mail anna.mueller@example.de, Telefon +49 30 12345678, Kreditkarte 5500 0000 0000 0004, IBAN DE89 3704 0044 0532 0130 00, IP 10.0.0.5, Datum 15.01.1990.";

        assert_detects("German", text, EntityType::Email, "anna.mueller@example.de");
        assert_detects("German", text, EntityType::Phone, "+49 30 12345678");
        assert_detects(
            "German",
            text,
            EntityType::CreditCard,
            "5500 0000 0000 0004",
        );
        assert_detects(
            "German",
            text,
            EntityType::Iban,
            "DE89 3704 0044 0532 0130 00",
        );
        assert_detects("German", text, EntityType::IpAddress, "10.0.0.5");
        assert_detects("German", text, EntityType::Date, "15.01.1990");
    }

    #[test]
    fn test_ui_sample_text_is_fully_covered_by_patterns() {
        // The popup's sample text: the whole phone number (with "+" and every digit) must be
        // one span, otherwise the part left in the text still leaks the number.
        let text = "Hej, jeg hedder Sebastian Gilson, og jeg er AI-udvikler hos ermias.ai. Jeg kan kontaktes på kontakt@ermias.ai eller +45 50930610. Mit CPR-nummer er i øvrigt 111111-1111.";
        assert_detects("Danish", text, EntityType::Email, "kontakt@ermias.ai");
        assert_detects("Danish", text, EntityType::Phone, "+45 50930610");
        assert_detects("Danish", text, EntityType::Cpr, "111111-1111");
    }

    #[test]
    fn test_prefixed_phone_wins_over_its_own_fragments() {
        // "30 12 34 56" (2-9 start) used to outscore the real "+49 ..." span in the merge.
        assert_detects("German", "Ring på +49 30 12 34 56 78 nu", EntityType::Phone, "+49 30 12 34 56 78");
        assert_detects("Danish", "Ring på +45 28 71 40 93 nu", EntityType::Phone, "+45 28 71 40 93");
        assert_detects("Danish", "tlf 0045 50930610 tak", EntityType::Phone, "0045 50930610");
        assert_detects("Danish", "tlf +45 50930610 tak", EntityType::Phone, "+45 50930610");
    }

    #[test]
    fn test_plus_45_with_a_one_first_digit_is_reported_in_full_by_the_generic_rule() {
        // Not a valid Danish number (so no 0.80 Danish match), but one well-formed international span.
        let text = "tlf +45 12 34 56 78 tak";
        let spans: Vec<_> = detect(text, &default_config())
            .into_iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert_eq!(spans.len(), 1, "{spans:?}");
        assert_eq!(spans[0].text, "+45 12 34 56 78");
        assert_eq!(spans[0].source, DetectionSource::Regex);
    }

    #[test]
    fn test_danish_email_with_non_ascii_letters() {
        assert_detects("Danish", "Skriv til søren@firma.dk i dag", EntityType::Email, "søren@firma.dk");
        assert_detects("Danish", "Mail Bjørn.Æble@firma.dk tak", EntityType::Email, "Bjørn.Æble@firma.dk");
        assert_detects("Danish", "Mail mads@æble.dk tak", EntityType::Email, "mads@æble.dk");
    }

    fn final_phones(text: &str) -> Vec<String> {
        detect(text, &default_config())
            .into_iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .map(|s| s.text)
            .collect()
    }

    #[test]
    fn test_bare_and_spaced_danish_phone_with_keyword() {
        let cases = [
            ("tlf. 50930610", "50930610"),
            ("Tlf: 20 34 56 78", "20 34 56 78"),
            ("tlf. 20 34 56 78", "20 34 56 78"),
            ("mobil nr. 50930610", "50930610"),
            ("Mobil nr 20 34 56 78", "20 34 56 78"),
            ("telefon 50930610", "50930610"),
            ("Mobilnr.: 20 34 56 78", "20 34 56 78"),
            ("mobilnr. 28714093", "28714093"),
            ("TLF NR 50930610", "50930610"),
            ("Tlf. nr. 50930610", "50930610"),
            ("tlfnr 50930610", "50930610"),
            ("tlf-nr: 50930610", "50930610"),
            ("telefonnr 50930610", "50930610"),
            ("Telefon nr. 50930610", "50930610"),
            ("telefonnummer 50930610", "50930610"),
            ("Ring til mig på 50930610 i morgen", "50930610"),
            ("+45 28 71 40 93", "+45 28 71 40 93"),
            ("+45 50930610", "+45 50930610"),
        ];
        for (text, expected) in cases {
            assert_detects("Danish", text, EntityType::Phone, expected);
        }
    }

    #[test]
    fn test_bare_eight_digits_starting_0_or_1_are_not_a_danish_phone() {
        // The Danish rules need a 2-9 first digit, with or without a phone keyword.
        for text in [
            "tlf. 12345678",
            "tlf. 02345678",
            "mobil nr. 12345678",
            "telefon 12345678",
        ] {
            assert!(final_phones(text).is_empty(), "{text:?}: {:?}", final_phones(text));
        }
    }

    #[test]
    fn test_bare_eight_digits_without_keyword_are_not_a_phone() {
        for text in [
            "Ordrenummer 20481937 er afsendt.",
            "Ordrenummer 12345678 er afsendt.",
            "Faktura 20240115 betalt",
            "Reference 02345678 fra systemet",
            "Varenr 98765432, antal 2",
        ] {
            assert!(final_phones(text).is_empty(), "{text:?}: {:?}", final_phones(text));
        }
    }

    #[test]
    fn test_generic_number_words_are_not_phone_keywords() {
        for text in [
            "order number 50930610",
            "Order number: 50930610 shipped",
            "Ordrenummer 50930610",
            "nummer 50930610",
            "Reference no. 50930610",
            "num 50930610",
            "nr. 50930610",
        ] {
            assert!(final_phones(text).is_empty(), "{text:?}: {:?}", final_phones(text));
        }
        // Phone-specific words still work, also when followed by a generic one.
        for (text, expected) in [
            ("tlf. 50930610", "50930610"),
            ("mobil nr. 50930610", "50930610"),
            ("telefon nummer 50930610", "50930610"),
            ("Tlf. nr. 50930610", "50930610"),
            ("phone number 50930610", "50930610"),
        ] {
            assert_detects("Danish", text, EntityType::Phone, expected);
        }
    }

    #[test]
    fn test_phone_keyword_must_be_on_the_same_line() {
        // "Tlf" labels the first number only; the order number on the next line is not a phone.
        assert_eq!(final_phones("Tlf: 50930610\nOrdrenummer: 20481937"), vec!["50930610"]);
        assert_eq!(final_phones("Tlf: 50930610\r\nOrdrenummer: 20481937"), vec!["50930610"]);
        // Alone, or with a keyword that is not near it on the same line: no phone.
        assert!(final_phones("Ordrenummer 20481937").is_empty());
        assert!(final_phones("Ordrenummer: 20481937\nTlf: ").is_empty());
        assert!(final_phones("tlf\n50930610").is_empty());
        // The real use: several lines, each judged by its own line.
        let text = "tlf. 50930610\nOrdrenummer: 20481937\nMobilnr.: 20 34 56 78";
        assert_eq!(final_phones(text), vec!["50930610", "20 34 56 78"]);
    }

    #[test]
    fn test_bare_number_without_keyword_is_not_a_phone_at_the_extensions_threshold() {
        // The extension runs the pipeline with min_confidence = the lowest per-category threshold
        // (0.40 at the default slider, sensitivity-resolver.ts) and then keeps PHONE spans >= 0.40.
        // A bare 8-digit number without a keyword must stay below that.
        let config = PipelineConfig { min_confidence: 0.40, ..default_config() };
        let phones = |text: &str| -> Vec<String> {
            detect(text, &config)
                .into_iter()
                .filter(|s| s.entity_type == EntityType::Phone && s.score >= 0.40)
                .map(|s| s.text)
                .collect()
        };
        assert!(phones("Ordrenummer: 20481937").is_empty(), "{:?}", phones("Ordrenummer: 20481937"));
        assert!(phones("Reference 50930610 fra systemet").is_empty());
        assert_eq!(phones("tlf. 50930610"), vec!["50930610"]);
        assert_eq!(phones("Tlf: 50930610
Ordrenummer: 20481937"), vec!["50930610"]);
        assert_eq!(phones("Mobilnr.: 20 34 56 78"), vec!["20 34 56 78"]);
        assert_eq!(phones("+45 50930610"), vec!["+45 50930610"]);
    }

    #[test]
    fn test_keyword_too_far_away_does_not_make_a_phone() {
        // The context window is five tokens; "tlf" sits eight tokens before the number.
        let text = "tlf er noget helt andet end det her 50930610";
        assert!(final_phones(text).is_empty(), "{:?}", final_phones(text));
        // ... and after the number.
        let text = "50930610 er noget helt andet end det her tlf";
        assert!(final_phones(text).is_empty(), "{:?}", final_phones(text));
    }

    #[test]
    fn test_years_and_cpr_near_a_phone_keyword_are_not_phones() {
        for text in ["tlf i 2024", "tlf. 2023 og 2024", "Mobil: 1990"] {
            assert!(final_phones(text).is_empty(), "{text:?}: {:?}", final_phones(text));
        }
        // A separated CPR next to a phone keyword stays a CPR.
        let spans = detect("tlf. og cpr 010170-1234", &default_config());
        assert!(spans.iter().any(|s| s.entity_type == EntityType::Cpr && s.text == "010170-1234"));
        assert!(!spans.iter().any(|s| s.entity_type == EntityType::Phone), "{spans:?}");
        // A bare 10-digit CPR is not an 8-digit phone either.
        let spans = detect("tlf. cpr 0101701234", &default_config());
        assert!(!spans.iter().any(|s| s.entity_type == EntityType::Phone), "{spans:?}");
    }

    #[test]
    fn test_labelled_reg_konto_account_passes_the_extensions_real_thresholds() {
        // The extension runs the pipeline at the lowest per-category threshold (0.40) and keeps
        // BANK_ACCOUNT spans >= 0.50 (sensitivity-resolver.ts, default slider).
        let config = PipelineConfig { min_confidence: 0.40, ..default_config() };
        let accounts = |text: &str| -> Vec<String> {
            detect(text, &config)
                .into_iter()
                .filter(|s| s.entity_type == EntityType::BankAccount && s.score >= 0.50)
                .map(|s| s.text)
                .collect()
        };
        assert_eq!(accounts("Bankkonto: Reg. 5678 konto 9876543210"), vec!["5678 konto 9876543210"]);
        assert_eq!(accounts("konto 9876543210 reg 5678"), vec!["9876543210 reg 5678"]);
        // not accounts: a year and an amount in two spreadsheet cells, an order number, a lone konto
        assert!(accounts("Budget 2026	125000").is_empty());
        assert!(accounts("Ordrenummer 12345678").is_empty());
        assert!(accounts("konto 9876543210").is_empty());
        // the extension's own replacement account is ignored
        assert!(accounts("Reg. 1234 konto 1234567890").is_empty());
    }

    #[test]
    fn test_url_credential_with_plain_word_password_is_reported() {
        let spans = detect("https://user:secretpass@host.dk/x", &default_config());
        assert!(
            spans.iter().any(|s| s.entity_type == EntityType::Password && s.text == "secretpass"),
            "got {spans:?}"
        );
    }
}
