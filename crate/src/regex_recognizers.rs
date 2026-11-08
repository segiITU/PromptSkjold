use regex::Regex;
use std::sync::LazyLock;

use crate::types::{DetectionSource, EntityType, PiiSpan};

/// A compiled regex recognizer for a specific PII type.
struct Recognizer {
    pattern: &'static LazyLock<Regex>,
    entity_type: EntityType,
    base_score: f64,
}

// --- Compiled regex patterns (compiled once, reused across calls) ---

// Letters are Unicode so Danish local parts and domains ("søren@firma.dk",
// "mads@æble.dk") are found; the old ASCII-only classes missed them completely
// because \b never holds between "ø" and the next letter.
static EMAIL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.\p{L}{2,}\b").unwrap()
});

static PHONE_RE: LazyLock<Regex> = LazyLock::new(|| {
    // Phones need structural cues so bare digit runs (years, IDs) don't match.
    // Separators never include newlines, so digits on adjacent lines don't pair up.
    Regex::new(concat!(
        r"(?:",
        // International with leading +: +49 30 12 34 56 78, +1-212-555-1234, +442012345678,
        // (+45) 12 34 56 78. Up to six digit groups; `trim_international` then enforces the
        // digit count (7-15, exactly 8 national digits for +45) so a trailing "2024" is not
        // swallowed and "+1000" is not a phone.
        r"(?:\(\+\d{1,3}\)|\+\d{1,3})[ \t\x{a0}\-.]?\(?\d{1,4}\)?(?:[ \t\x{a0}\-.]?\d{1,4}){1,5}\b",
        // Parenthesized area code: (212) 555-1234, (030) 1234567
        r"|\(\d{2,5}\)[ \t\x{a0}\-.]?\d{2,4}[ \t\x{a0}\-.]?\d{2,9}",
        // Danish layout, four pairs separated by spaces: 20 34 56 78 (first digit 2-9 like the
        // Danish rules; listed before the three-group rule so all four pairs are taken).
        r"|\b[2-9]\d(?:[ \t\x{a0}]\d{2}){3}\b",
        // Three groups separated by space/dash/dot: 212-555-1234
        r"|\b\d{2,4}[ \t\x{a0}\-.]\d{2,4}[ \t\x{a0}\-.]\d{2,9}\b",
        // Two groups, second one long: 030 12345678
        r"|\b\d{2,5}[ \t\x{a0}\-.]\d{6,12}\b",
        r")"
    ))
    .unwrap()
});

static SSN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap());

// Danish CPR (DDMMYY-SSSS): separator required; the bare form needs context.
static CPR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}[ \t\x{a0}\-]\d{4}\b").unwrap()
});

static CPR_BARE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{6}\b").unwrap()
});

// Danish phone: 8 digits starting 2-9 (Danish subscriber numbers never start with 0 or 1),
// optional +45 / 0045 prefix. A number like "+45 12 34 56 78" is therefore not a Danish
// number; the generic international rule (PHONE_RE) still reports it at its lower score.
static DK_PHONE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?:",
        r"(?:\+|\b00)45[ \t\x{a0}.\-]?[2-9]\d(?:[ \t\x{a0}.\-]?\d{2}){3}\b",
        r"|\b[2-9]\d(?:[ \t\x{a0}.\-]\d{2}){3}\b",
        r")"
    ))
    .unwrap()
});

// Bare 8-digit Danish phone (2-9 first digit). The base score (BARE_PHONE_SCORE = 0.36) must stay
// below both the Rust threshold (0.5) AND the extension's PHONE threshold at the default slider
// (0.40, sensitivity-resolver.ts), otherwise an order number would be flagged without any
// keyword. With a phone keyword on the same line within the window (context.rs adds 0.15) it
// reaches 0.51 and is kept.
const BARE_PHONE_SCORE: f64 = 0.36;
static DK_PHONE_BARE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b[2-9]\d{7}\b").unwrap());

// Danish bank account: 4-digit registration number + 6-10 digit account.
static DK_BANK_ACCOUNT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d{4}[ \t\x{a0}\-]\d{6,10}\b").unwrap());

static CREDIT_CARD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:\d{4}[ \t\x{a0}\-]?){3}\d{4}\b").unwrap());

static IP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b")
        .unwrap()
});

static IBAN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[A-Z]{2}\d{2}[ \t\x{a0}]?[\dA-Z]{4}[ \t\x{a0}]?(?:[\dA-Z]{4}[ \t\x{a0}]?){1,7}[\dA-Z]{1,4}\b")
        .unwrap()
});

static DATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?:",
        // DD/MM/YYYY or MM/DD/YYYY or YYYY-MM-DD
        r"\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b",
        r"|\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b",
        // Month DD, YYYY
        r"|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[ \t]+\d{1,2},?[ \t]+\d{4}\b",
        r")"
    ))
    .unwrap()
});

// --- Secrets / credentials (reported as PASSWORD) ---
//
// Prefix-based provider tokens are near-certain; keyword assignments and
// credentials embedded in URLs report only the secret value (capture group).

struct SecretRecognizer {
    pattern: &'static LazyLock<Regex>,
    base_score: f64,
    /// Capture group holding the secret (0 = whole match).
    group: usize,
}

static SECRET_TOKEN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\b(?:",
        // AWS access key ids
        r"(?:AKIA|ASIA)[0-9A-Z]{16}",
        // GitHub tokens
        r"|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}",
        // OpenAI / Anthropic style keys
        r"|sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_\-]{20,}",
        // Stripe
        r"|[spr]k_(?:live|test)_[A-Za-z0-9]{16,}",
        // Slack
        r"|xox[abprs]-[A-Za-z0-9\-]{10,}",
        // Google API keys
        r"|AIza[0-9A-Za-z_\-]{35}",
        // JSON web tokens
        r"|eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}",
        r")\b"
    ))
    .unwrap()
});

static PRIVATE_KEY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----").unwrap()
});

// scheme://user:PASSWORD@host
static URL_CREDENTIAL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"://[^\s:@/]+:([^\s@/]{3,})@").unwrap());

// password = x | "password": "x" | adgangskode er x | my password for the system is x
static SECRET_KEYWORD_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r#"(?i)(?:^|[^A-Za-z0-9])(?:password(?:et)?|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|adgangskode(?:n)?|kodeord(?:et)?|pinkode(?:n)?|sikkerhedstoken(?:et)?|sikkerhedskode(?:n)?|wifi-?kode(?:n)?)["']?"#,
        r#"(?:[ \t]*[:=][ \t]*|(?:[ \t]+[^\s"':=]+){0,3}?[ \t]+(?:er|is|var|was)[ \t]+)"#,
        r#"["']?([^\s"',;)\]]{4,})"#
    ))
    .unwrap()
});

// kodeord til X | adgangskoden som X: connector words that are not an assignment.
// A plain word after "til" ("kodeord til systemet") is rejected by validate_secret_value.
static SECRET_CONNECTOR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r#"(?i)(?:^|[^A-Za-z0-9])(?:password(?:et)?|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|adgangskode(?:n)?|kodeord(?:et)?|pinkode(?:n)?|sikkerhedstoken(?:et)?|sikkerhedskode(?:n)?|wifi-?kode(?:n)?)["']?"#,
        r#"[ \t]+(?:til|som)[ \t]+["']?([^\s"',;)\]]{4,})"#
    ))
    .unwrap()
});

// adgangskoden "X" | og brugte "X" | password 'X': a quoted single-token value shortly after the keyword.
static SECRET_QUOTED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r#"(?i)(?:^|[^A-Za-z0-9])(?:password(?:et)?|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|adgangskode(?:n)?|kodeord(?:et)?|pinkode(?:n)?|sikkerhedstoken(?:et)?|sikkerhedskode(?:n)?|wifi-?kode(?:n)?)"#,
        r#"(?:[ \t]+[^\s"':=]+){0,3}?[ \t]+["']([^\s"',;)\]]{4,})["']"#
    ))
    .unwrap()
});

// Adgangskoden Køkkenhave#82 stod på en post-it | password Summer2024! was reused: the value follows the
// keyword directly, with no "er"/":" in between. Only the definite or plain keyword (no "token"/"secret",
// which are common nouns) and only values that pass validate_secret_value (length, digit or symbol).
static SECRET_BARE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r#"(?i)(?:^|[^A-Za-z0-9_-])(?:password(?:et)?|passwd|adgangskode(?:n)?|kodeord(?:et)?|pinkode(?:n)?|wifi-?kode(?:n)?)"#,
        r#"[ \t]+([^\s"',;)\]=]{5,}[^\s"',;)\].=])"#
    ))
    .unwrap()
});

const SECRET_RECOGNIZERS: &[SecretRecognizer] = &[
    SecretRecognizer { pattern: &SECRET_TOKEN_RE, base_score: 0.95, group: 0 },
    SecretRecognizer { pattern: &PRIVATE_KEY_RE, base_score: 0.98, group: 0 },
    SecretRecognizer { pattern: &URL_CREDENTIAL_RE, base_score: 0.99, group: 1 },
    SecretRecognizer { pattern: &SECRET_KEYWORD_RE, base_score: 0.85, group: 1 },
    SecretRecognizer { pattern: &SECRET_CONNECTOR_RE, base_score: 0.8, group: 1 },
    SecretRecognizer { pattern: &SECRET_QUOTED_RE, base_score: 0.8, group: 1 },
    SecretRecognizer { pattern: &SECRET_BARE_RE, base_score: 0.75, group: 1 },
];

// --- Keyword-anchored identifiers (only the value after the keyword is reported) ---
//
// These have no checksum and look like ordinary words/numbers on their own, so
// each needs its label ("pasnummer", "født", "løn") next to the value.

struct ContextualRecognizer {
    pattern: &'static LazyLock<Regex>,
    entity_type: EntityType,
    base_score: f64,
    /// Rejects values that follow the keyword in ordinary prose.
    validate: fn(&str) -> bool,
}

// pasnummer: 123456789 | passport no. X1234567 | kørekortnummer 12345678
static ID_DOCUMENT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:pasnummer|pasnr\.?|pas[ \t]*\([ \t]*nr\.?|pas|passport(?:[ \t_]+(?:no\.?|number|nr\.?))?|kørekortnummer|kørekortnr\.?|kørekort(?:[ \t]+nr\.?)?|(?:driver'?s?|driving)[ \t_]+licen[sc]e(?:[ \t_]+(?:no\.?|number|nr\.?))?))",
        r#"["']?(?:[ \t]*[:=#][ \t]*["']?|[ \t]+(?:er|is)[ \t]+|[ \t]+)"#,
        // 6-12 letters/digits, or digits in groups ("21 04 56 789", "1234 5678")
        r"\b([A-Z0-9]{6,12}|\d{2,4}(?:[ \t]\d{2,4}){1,4})\b"
    ))
    .unwrap()
});

// født 14. maj 1982 | fødselsdato: 14/05/1982 | date of birth: 1982-05-14 | DOB 05/14/82
static BIRTH_DATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b(?:fødselsdato(?:en)?|fødselsdag(?:en)?|sin[ \t]+fødsel|født(?:[ \t]+(?:den|d\.))?|f\.|date[ \t_]+of[ \t_]+birth|birth[ \t_]*date|born(?:[ \t]+on)?|dob|d\.o\.b)",
        r#"["']?(?:[ \t]*[:=][ \t]*["']?|(?:[ \t]+(?:er|var|som|is|was))?(?:[ \t]+(?:den|d\.))?[ \t]+)"#,
        r"(",
        r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}",
        r"|\d{4}-\d{2}-\d{2}",
        r"|\d{1,2}\.?[ \t]+(?:jan(?:uar|uary)?|feb(?:ruar|ruary)?|mar(?:ts|ch)?|apr(?:il)?|ma[jy]|jun[ie]?|jul[iy]?|aug(?:ust)?|sep(?:t(?:ember)?)?|o[ck]t(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?[ \t]+\d{4}",
        r"|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun[e]?|jul[y]?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[ \t]+\d{1,2}(?:st|nd|rd|th)?,?[ \t]+\d{4}",
        r")"
    ))
    .unwrap()
});

// fødested: Aarhus | født i Odense | born in Aalborg | place of birth: Viborg
static BIRTHPLACE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:fødested|født[ \t]+i|born[ \t]+in|place[ \t]+of[ \t]+birth|birthplace))",
        r"(?:[ \t]*[:=][ \t]*|[ \t]+)",
        r"(\p{Lu}[\p{L}\-]+(?:[ \t]+\p{Lu}[\p{L}\-]+)?)"
    ))
    .unwrap()
});

// Role words shared by the job-title recognizers (suffix match, so Danish
// compounds like "webudvikler" and "afdelingsleder" hit).
macro_rules! role_words {
    () => {
        concat!(
            r"manager|director|engineer|developer|programmer|nurse|teacher|doctor|physician|surgeon|lawyer|attorney|accountant|consultant|analyst|specialist|administrator|officer|assistant|designer|architect|scientist|technician|electrician|mechanic|plumber|carpenter|cashier|clerk|secretary|therapist|psychologist|pharmacist|dentist|paramedic|ceo|cfo|cto|coo|president|founder|",
            r"leder|direktør|ingeniør|udvikler|programmør|sygeplejerske|lærer|læge|kirurg|advokat|jurist|revisor|bogholder|konsulent|analytiker|specialist|administrator|medarbejder|sekretær|rådgiver|pædagog|psykolog|apotekeren|tandlæge|tømrer|elektriker|murer|smed|mekaniker|kasserer|sælger|politibetjent|chef|direktion|formand|partner",
        )
    };
}

// Job title after a label or "works as": the title must end in a known role
// word, otherwise "works as expected" would be a title.
static JOB_TITLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b(?:stilling|jobtitel|titel|title|job[ \t_]*title|position|occupation|profession|works[ \t]+as(?:[ \t]+an?)?|worked[ \t]+as(?:[ \t]+an?)?|employed[ \t]+as(?:[ \t]+an?)?|arbejder[ \t]+som|ansat[ \t]+som|er[ \t]+ansat[ \t]+som|som[ \t]+er|who[ \t]+is(?:[ \t]+an?)?)",
        r#"["']?(?:[ \t]*[:=][ \t]*["']?|[ \t]+)"#,
        r"((?:[\p{L}\-/&]+[ \t]+){0,3}[\p{L}\-]*(?:",
        role_words!(),
        r")\b)"
    ))
    .unwrap()
});

// løn: 45.000 kr | min årsløn er 600.000 DKK | gæld på 2 millioner kr | salary: $85,000
static FINANCIAL_INFO_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b(?:månedsløn|årsløn|bruttoløn|nettoløn|løn|indkomst|årsindkomst|gæld|formue|restskat|salary|annual[ \t]+salary|income|net[ \t]+worth|debt)",
        r"(?:[ \t]+\d{4})?",
        r#"(?:["']?[ \t]*[:=][ \t]*["']?|(?:[ \t]+\p{L}+){0,3}?[ \t]+(?:er|på|is|of|was|at|about)[ \t]+|[ \t]+)"#,
        r"(?:(?:ca\.?|approx\.?|around|about|omkring)[ \t]+)?",
        r"((?:kr\.?|dkk|usd|eur|gbp|nok|sek|chf|€|\$|£)?[ \t]*(?:\d{1,3}(?:[., \x{a0}]\d{3})+|\d+)(?:[.,]\d{1,2})?(?:[ \t]*(?:mio\.?|millioner|million|k)\b)?(?:[ \t]*(?:kr\.?|dkk|usd|eur|gbp|nok|sek|chf|€|\$|£|,-))?)"
    ))
    .unwrap()
});

// "Aviaja Petersen er webudvikler i DI" | "Lars is a senior nurse at Rigshospitalet":
// a capitalised word, "is", then a known role word, optionally "at <Workplace>".
static IS_ROLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\b(\p{Lu}[\p{L}\-]+)[ \t]+(?i:er|var|is|was)[ \t]+(?i:(?:en|et|a|an)[ \t]+)?",
        r"((?i:(?:[\p{L}\-]+[ \t]+){0,2}[\p{L}\-]*(?:",
        role_words!(),
        r")\b))",
        r"(?:[ \t]+(?i:hos|i|ved|på|at|for|in)[ \t]+(\p{Lu}[\p{L}&\-]*(?:[ \t]+\p{Lu}[\p{L}&\-]*){0,3}))?"
    ))
    .unwrap()
});

// "arbejder hos Novo Nordisk" | "works at Maersk" | "ansat i DI"
static WORKPLACE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:arbejder|ansat|beskæftiget)[ \t]+(?:hos|for|i|ved|på)|(?:works|worked|employed)[ \t]+(?:at|for|by))",
        r"[ \t]+(\p{Lu}[\p{L}&\-]*(?:[ \t]+\p{Lu}[\p{L}&\-]*){0,3})"
    ))
    .unwrap()
});

// Arbejdsgiver: LEGO A/S | "employer": "Danske Bank" | Firma: Nordlys Consulting ApS
static LABELLED_WORKPLACE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:arbejdsgiver|employer|arbejdssted|workplace|firma|company))",
        r#"["']?[ \t]*[:=][ \t]*["']?"#,
        r"(\p{Lu}[\p{L}&/\-]*(?:[ \t]+\p{Lu}[\p{L}&/\-]*){0,3})"
    ))
    .unwrap()
});

// "tjener ca. 40.000 kr/md" | "earned $85,000": the currency is mandatory so
// "earned 5000 points" is left alone.
static EARNINGS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:tjener|tjente|earns|earned))[ \t]+(?i:(?:ca\.?|approx\.?|around|about|omkring)[ \t]+)?",
        r"((?:(?i:kr\.?|dkk|usd|eur)[ \t]*|[€$£])(?:\d{1,3}(?:[., \x{a0}]\d{3})+|\d+)(?:[.,]\d{1,2})?(?i:[ \t]*(?:mio\.?|millioner|million|k)\b)?",
        r"|(?:\d{1,3}(?:[., \x{a0}]\d{3})+|\d+)(?:[.,]\d{1,2})?(?i:[ \t]*(?:mio\.?|millioner|million|k)\b)?[ \t]*(?i:kr\.?|dkk|usd|eur)\b|(?:\d{1,3}(?:[., \x{a0}]\d{3})+|\d+)[ \t]*[€$£])"
    ))
    .unwrap()
});

// "Lars Nielsen, afdelingsleder ..." | "Sofie Madsen — psykolog" | "Mette S. | CFO |":
// a name, a separator, then a role word ending at a delimiter.
static APPOSITIVE_ROLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\b\p{Lu}[\p{L}\-]*\.?[ \t]*(?:,|—|–|\||[ \t]-[ \t])[ \t]*",
        r"((?i:(?:[\p{L}\-]+[ \t]+){0,2}[\p{L}\-]*(?:",
        role_words!(),
        r")))(?:[ \t]*(?:,|\||\.|—|–|;)|[ \t]+(?i:hos|i|ved|på|at|for|in)[ \t]|[ \t]*(?:\r?\n|$))"
    ))
    .unwrap()
});

// "Our CTO Anna Lund" | "direktør Peter Holm": a title in front of a full name.
static ROLE_BEFORE_NAME_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"\b(CEO|CTO|CFO|COO|CIO|CMO|[Dd]irektør|[Dd]irector|[Cc]hef|[Mm]anager)[ \t]+\p{Lu}[\p{L}\-]+[ \t]+\p{Lu}[\p{L}\-]+",
    )
    .unwrap()
});

/// Words that open sentences and questions: "Hvad er en udvikler?" is not a person.
const NOT_A_NAME: &[&str] = &[
    "hvad", "hvem", "hvilken", "hvilke", "hvor", "hvordan", "hvorfor", "det", "dette", "der", "den",
    "her", "han", "hun", "de", "vi", "jeg", "du", "man", "what", "who", "which", "how", "it", "this",
    "that", "there", "he", "she", "they", "i", "we", "you",
];

// user=karenb | bruger: hj_nielsen | login = tpedersen | uid: mads.k92
static USERNAME_ASSIGNED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:user(?:name)?|user[ _]?id|uid|login(?:[ _]?name)?|logon|brugernavn|loginnavn|bruger(?:id|navn)?)",
        r#"["']?[ \t]*[:=][ \t]*["']?)"#,
        r"([A-Za-z0-9][A-Za-z0-9._-]{2,39})\b"
    ))
    .unwrap()
});

// brugernavn hj_nielsen | username is mlarsen | som brugernavn karenb
static USERNAME_WORDED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i:\b(?:brugernavn|loginnavn|user[ _]?name|login[ _]?name)(?:[ \t]+(?:er|is|=))?[ \t]+)",
        r"([A-Za-z0-9][A-Za-z0-9._-]{2,39})\b"
    ))
    .unwrap()
});

// C:\Users\mlarsen_dev\work | /home/karenb/ | /Users/lene/
static USERNAME_HOME_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i:(?:[A-Z]:\\Users\\|/Users/|/home/))([A-Za-z0-9][A-Za-z0-9._-]{2,39})[\\/]").unwrap()
});

// "tilføj mig @lone_h" | "@lenelund_dk" (a handle needs an underscore or digit, so @Override, @media and
// @app.route are left alone); the whole handle including the @ is reported.
static USERNAME_HANDLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[^\w@./\\-])(@[A-Za-z][A-Za-z0-9_]{2,29})\b").unwrap()
});

// Danish bank account written with its labels: "Reg. 5678 konto 9876543210",
// "reg.nr. 5678, kontonr. 9876543210", "Regnr: 5678 og konto nr. 9876543210". Both keywords are
// required, so a plain digit pair, a tab pair, a CPR or an order number never matches. The whole
// "5678 konto 9876543210" is reported as one BANK_ACCOUNT span.
static BANK_REG_KONTO_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b(?:registreringsnummer|reg\.?[ \t]*nr\.?|regnr\.?|reg\.?)[ \t:.\-]*",
        r"(\d{4}(?:[ \t,;:.\-]*(?:og[ \t]+)?)(?:konto(?:[ \t]*nr\.?|nummer)?)[ \t:.\-]*\d{6,10})\b"
    ))
    .unwrap()
});

// The reversed order: "konto 9876543210 reg 5678" (again both keywords are required).
static BANK_KONTO_REG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\bkonto(?:[ \t]*nr\.?|nummer)?[ \t:.\-]*",
        r"(\d{6,10}[ \t,;]*(?:og[ \t]+)?(?:registreringsnummer|reg\.?[ \t]*nr\.?|regnr\.?|reg\.?)[ \t:.\-]*\d{4})\b"
    ))
    .unwrap()
});

/// The account number the extension itself writes when it replaces an account ("reg 1234 konto
/// 1234567xxx") must not be reported again when replaced text goes back through the check.
fn not_the_extensions_own_account(value: &str) -> bool {
    let compact: String = value.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_lowercase();
    let own = |s: &str| {
        let s = s.strip_prefix("reg.").or_else(|| s.strip_prefix("reg")).unwrap_or(s);
        let rest = match s.strip_prefix("1234") {
            Some(r) => r,
            None => return false,
        };
        // "konto", "kontonr.", "konto nr.:" ... : skip the label, keep the digits.
        let rest = rest.trim_start_matches(|c: char| !c.is_ascii_digit());
        rest.len() == 10 && rest.starts_with("1234567") && rest.chars().all(|c| c.is_ascii_digit())
    };
    !own(&compact)
}

const CONTEXTUAL_RECOGNIZERS: &[ContextualRecognizer] = &[
    ContextualRecognizer {
        pattern: &BANK_REG_KONTO_RE,
        entity_type: EntityType::BankAccount,
        base_score: 0.85,
        validate: not_the_extensions_own_account,
    },
    ContextualRecognizer {
        pattern: &BANK_KONTO_REG_RE,
        entity_type: EntityType::BankAccount,
        base_score: 0.85,
        validate: not_the_extensions_own_account,
    },
    ContextualRecognizer {
        pattern: &USERNAME_ASSIGNED_RE,
        entity_type: EntityType::Username,
        base_score: 0.80,
        validate: crate::checksum::validate_username_value,
    },
    ContextualRecognizer {
        pattern: &USERNAME_WORDED_RE,
        entity_type: EntityType::Username,
        base_score: 0.80,
        validate: crate::checksum::validate_username_value,
    },
    ContextualRecognizer {
        pattern: &USERNAME_HOME_PATH_RE,
        entity_type: EntityType::Username,
        base_score: 0.75,
        validate: crate::checksum::validate_username_value,
    },
    ContextualRecognizer {
        pattern: &USERNAME_HANDLE_RE,
        entity_type: EntityType::Username,
        base_score: 0.75,
        validate: crate::checksum::validate_handle_value,
    },
    ContextualRecognizer {
        pattern: &ID_DOCUMENT_RE,
        entity_type: EntityType::IdDocument,
        base_score: 0.90,
        validate: crate::checksum::validate_id_document_value,
    },
    ContextualRecognizer {
        pattern: &BIRTH_DATE_RE,
        entity_type: EntityType::BirthDate,
        base_score: 0.85,
        validate: |_| true,
    },
    ContextualRecognizer {
        pattern: &BIRTHPLACE_RE,
        entity_type: EntityType::Location,
        base_score: 0.75,
        validate: crate::checksum::validate_birthplace_value,
    },
    ContextualRecognizer {
        pattern: &JOB_TITLE_RE,
        entity_type: EntityType::JobTitle,
        base_score: 0.70,
        validate: |_| true,
    },
    ContextualRecognizer {
        pattern: &WORKPLACE_RE,
        entity_type: EntityType::Organization,
        base_score: 0.75,
        validate: crate::checksum::validate_birthplace_value,
    },
    ContextualRecognizer {
        pattern: &LABELLED_WORKPLACE_RE,
        entity_type: EntityType::Organization,
        base_score: 0.75,
        validate: |_| true,
    },
    ContextualRecognizer {
        pattern: &APPOSITIVE_ROLE_RE,
        entity_type: EntityType::JobTitle,
        base_score: 0.65,
        // "Lars, leder du efter ..." uses the verb "leder", not the title.
        validate: |role| !role.eq_ignore_ascii_case("leder"),
    },
    ContextualRecognizer {
        pattern: &ROLE_BEFORE_NAME_RE,
        entity_type: EntityType::JobTitle,
        base_score: 0.70,
        validate: |_| true,
    },
    ContextualRecognizer {
        pattern: &EARNINGS_RE,
        entity_type: EntityType::FinancialInfo,
        base_score: 0.70,
        validate: crate::checksum::validate_amount_value,
    },
    ContextualRecognizer {
        pattern: &FINANCIAL_INFO_RE,
        entity_type: EntityType::FinancialInfo,
        base_score: 0.70,
        validate: crate::checksum::validate_amount_value,
    },
];

const RECOGNIZERS: &[Recognizer] = &[
    Recognizer {
        pattern: &EMAIL_RE,
        entity_type: EntityType::Email,
        base_score: 0.95,
    },
    Recognizer {
        pattern: &PHONE_RE,
        entity_type: EntityType::Phone,
        base_score: 0.70,
    },
    Recognizer {
        pattern: &SSN_RE,
        entity_type: EntityType::Ssn,
        base_score: 0.80,
    },
    Recognizer {
        pattern: &CPR_RE,
        entity_type: EntityType::Cpr,
        base_score: 0.85,
    },
    Recognizer {
        pattern: &CPR_BARE_RE,
        entity_type: EntityType::Cpr,
        base_score: 0.40,
    },
    Recognizer {
        pattern: &DK_PHONE_RE,
        entity_type: EntityType::Phone,
        base_score: 0.80,
    },
    Recognizer {
        pattern: &DK_PHONE_BARE_RE,
        entity_type: EntityType::Phone,
        base_score: BARE_PHONE_SCORE,
    },
    Recognizer {
        pattern: &DK_BANK_ACCOUNT_RE,
        entity_type: EntityType::BankAccount,
        base_score: 0.40,
    },
    Recognizer {
        pattern: &CREDIT_CARD_RE,
        entity_type: EntityType::CreditCard,
        base_score: 0.75,
    },
    Recognizer {
        pattern: &IP_RE,
        entity_type: EntityType::IpAddress,
        base_score: 0.85,
    },
    Recognizer {
        pattern: &IBAN_RE,
        entity_type: EntityType::Iban,
        base_score: 0.80,
    },
    Recognizer {
        pattern: &DATE_RE,
        entity_type: EntityType::Date,
        base_score: 0.60,
    },
];

fn is_full_match(pattern: &Regex, text: &str) -> bool {
    pattern
        .find(text)
        .is_some_and(|mat| mat.start() == 0 && mat.end() == text.len())
}

/// A phone match carrying an explicit international prefix ("+45 ...", "(+49) ...",
/// "0045 ..."): the prefix is a strong cue, so it outranks unprefixed fragments of
/// the same number ("45 12 34 56" inside "+45 12 34 56 78").
fn is_explicit_international(text: &str) -> bool {
    text.starts_with('+') || text.starts_with("(+") || text.starts_with("0045")
}

/// Bounds a "+<country code> ..." match to a plausible phone number and returns how many
/// bytes of `text` to keep (None = not a phone number).
///
/// The regex may swallow a neighbouring number ("+45 12 34 56 78 2024"), so digits are
/// capped at 15 (E.164) and, for +45, at 2 + 8 digits; the match is cut back to the last
/// group boundary. Fewer than 7 digits ("+1000", "+2024") is not a phone number.
fn trim_international(text: &str) -> Option<usize> {
    let after_plus = text.strip_prefix("(+").or_else(|| text.strip_prefix('+'))?;
    let limit = if after_plus.starts_with("45") { 10 } else { 15 };
    let mut digits = 0usize;
    let mut last_boundary: Option<usize> = None;
    let mut keep = text.len();
    for (i, c) in text.char_indices() {
        if c.is_ascii_digit() {
            digits += 1;
            if digits > limit {
                // Over-long: cut at the separator before the offending group; a single
                // over-long digit run has no such separator and is rejected.
                keep = last_boundary?;
                break;
            }
        } else {
            last_boundary = Some(i);
        }
    }
    let kept = text[..keep].trim_end_matches(|c: char| !c.is_ascii_digit());
    let kept_digits = kept.chars().filter(|c| c.is_ascii_digit()).count();
    if kept_digits < 7 {
        return None;
    }
    Some(kept.len())
}

/// Run all regex recognizers against the input text.
/// Returns candidate PII spans with their type and base confidence score.
pub fn detect_regex(text: &str) -> Vec<PiiSpan> {
    let mut spans = Vec::new();

    for recognizer in RECOGNIZERS {
        for mat in recognizer.pattern.find_iter(text) {
            if recognizer.entity_type == EntityType::Phone && is_full_match(&DATE_RE, mat.as_str())
            {
                continue;
            }

            // "1234-1234567890" is a Danish reg+account number, not a phone. An explicit
            // "0045 12345678" has the same digit layout but the 0045 prefix says phone.
            if recognizer.entity_type == EntityType::Phone
                && !mat.as_str().starts_with("0045")
                && is_full_match(&DK_BANK_ACCOUNT_RE, mat.as_str())
            {
                continue;
            }

            let mut end = mat.end();
            if recognizer.entity_type == EntityType::Phone
                && (mat.as_str().starts_with('+') || mat.as_str().starts_with("(+"))
            {
                match trim_international(mat.as_str()) {
                    Some(len) => end = mat.start() + len,
                    None => continue,
                }
            }

            spans.push(PiiSpan::new(
                mat.start(),
                end,
                recognizer.entity_type,
                recognizer.base_score,
                text[mat.start()..end].to_string(),
                DetectionSource::Regex,
            ));
        }
    }

    // Unprefixed phone fragments inside an explicit "+45 ..." / "0045 ..." number are
    // pieces of it, not separate phones; without this the higher-scoring fragment wins
    // the merge and the "+" and trailing digits stay in the text.
    let explicit: Vec<(usize, usize)> = spans
        .iter()
        .filter(|s| s.entity_type == EntityType::Phone && is_explicit_international(&s.text))
        .map(|s| (s.start, s.end))
        .collect();
    if !explicit.is_empty() {
        spans.retain(|s| {
            s.entity_type != EntityType::Phone
                || is_explicit_international(&s.text)
                || !explicit.iter().any(|&(a, b)| s.start < b && a < s.end)
        });
    }

    for recognizer in SECRET_RECOGNIZERS {
        for caps in recognizer.pattern.captures_iter(text) {
            let Some(mat) = caps.get(recognizer.group) else {
                continue;
            };
            let span = PiiSpan::new(
                mat.start(),
                mat.end(),
                EntityType::Password,
                recognizer.base_score,
                mat.as_str().to_string(),
                DetectionSource::Regex,
            );
            // Values assigned to a keyword must look like a secret, not a word.
            // Credentials embedded in a URL (scheme://user:PASSWORD@host) are certain
            // by position, so a plain-letter password is still reported.
            if recognizer.group != 0
                && !std::ptr::eq(recognizer.pattern, &URL_CREDENTIAL_RE)
                && !crate::checksum::validate_secret_value(&span.text)
            {
                continue;
            }
            spans.push(span);
        }
    }

    for recognizer in CONTEXTUAL_RECOGNIZERS {
        for caps in recognizer.pattern.captures_iter(text) {
            let Some(mat) = caps.get(1) else {
                continue;
            };
            if !(recognizer.validate)(mat.as_str()) {
                continue;
            }
            spans.push(PiiSpan::new(
                mat.start(),
                mat.end(),
                recognizer.entity_type,
                recognizer.base_score,
                mat.as_str().to_string(),
                DetectionSource::Regex,
            ));
        }
    }

    for caps in IS_ROLE_RE.captures_iter(text) {
        let name = caps.get(1).map_or("", |m| m.as_str());
        if NOT_A_NAME.contains(&name.to_lowercase().as_str()) {
            continue;
        }
        if let Some(role) = caps.get(2) {
            spans.push(PiiSpan::new(
                role.start(),
                role.end(),
                EntityType::JobTitle,
                0.70,
                role.as_str().to_string(),
                DetectionSource::Regex,
            ));
        }
        if let Some(place) = caps.get(3) {
            if crate::checksum::validate_birthplace_value(place.as_str()) {
                spans.push(PiiSpan::new(
                    place.start(),
                    place.end(),
                    EntityType::Organization,
                    0.75,
                    place.as_str().to_string(),
                    DetectionSource::Regex,
                ));
            }
        }
    }

    spans
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_detection() {
        let spans = detect_regex("Contact me at john.doe@example.com please");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].entity_type, EntityType::Email);
        assert_eq!(spans[0].text, "john.doe@example.com");
    }

    #[test]
    fn test_multiple_emails() {
        let spans = detect_regex("Send to a@b.com and c@d.org");
        let emails: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Email)
            .collect();
        assert_eq!(emails.len(), 2);
    }

    #[test]
    fn test_phone_us_format() {
        let spans = detect_regex("Call 212-555-1234");
        let phones: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert!(phones.len() >= 1);
        assert!(phones[0].text.contains("212"));
    }

    #[test]
    fn test_phone_international() {
        let spans = detect_regex("Call +49 30 12345678");
        let phones: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert!(phones.len() >= 1);
    }

    #[test]
    fn test_german_numeric_date_is_not_phone() {
        let spans = detect_regex("Geburtsdatum 15.01.1990");
        let phones: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        let dates: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Date)
            .collect();

        assert!(phones.is_empty());
        assert_eq!(dates.len(), 1);
        assert_eq!(dates[0].text, "15.01.1990");
    }

    #[test]
    fn test_year_numbers_are_not_phones() {
        let texts = [
            "Born in 1990",
            "Released in 2023",
            "between 2020 and 2024",
            "page 12345",
            "order 1234567",
        ];
        for text in texts {
            let phones: Vec<_> = detect_regex(text)
                .into_iter()
                .filter(|s| s.entity_type == EntityType::Phone)
                .collect();
            assert!(phones.is_empty(), "expected no phones in {text:?}, got {phones:?}");
        }
    }

    #[test]
    fn test_ssn() {
        let spans = detect_regex("SSN: 123-45-6789");
        let ssns: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Ssn)
            .collect();
        assert_eq!(ssns.len(), 1);
        assert_eq!(ssns[0].text, "123-45-6789");
    }

    #[test]
    fn test_credit_card() {
        let spans = detect_regex("Card: 4111-1111-1111-1111");
        let ccs: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::CreditCard)
            .collect();
        assert_eq!(ccs.len(), 1);
    }

    #[test]
    fn test_credit_card_spaces() {
        let spans = detect_regex("Card: 4111 1111 1111 1111");
        let ccs: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::CreditCard)
            .collect();
        assert_eq!(ccs.len(), 1);
    }

    #[test]
    fn test_ip_address() {
        let spans = detect_regex("Server at 192.168.1.1 is down");
        let ips: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::IpAddress)
            .collect();
        assert_eq!(ips.len(), 1);
        assert_eq!(ips[0].text, "192.168.1.1");
    }

    #[test]
    fn test_ip_address_invalid_octets() {
        // 999.999.999.999 should not match the IP pattern
        let spans = detect_regex("Address 999.999.999.999");
        let ips: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::IpAddress)
            .collect();
        assert_eq!(ips.len(), 0);
    }

    #[test]
    fn test_iban() {
        let spans = detect_regex("IBAN: DE89370400440532013000");
        let ibans: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Iban)
            .collect();
        assert_eq!(ibans.len(), 1);
    }

    #[test]
    fn test_date_iso() {
        let spans = detect_regex("Born on 1990-01-15");
        let dates: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Date)
            .collect();
        assert!(dates.len() >= 1);
    }

    #[test]
    fn test_date_written() {
        let spans = detect_regex("Born on January 15, 2024");
        let dates: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Date)
            .collect();
        assert!(dates.len() >= 1);
    }

    #[test]
    fn test_no_pii() {
        let spans = detect_regex("What is the weather today?");
        assert!(spans.is_empty());
    }

    #[test]
    fn test_empty_input() {
        let spans = detect_regex("");
        assert!(spans.is_empty());
    }

    #[test]
    fn test_mixed_pii() {
        let text = "Hi, my name is David and my email is david@corp.com. Call me at 212-555-1234.";
        let spans = detect_regex(text);
        let types: Vec<_> = spans.iter().map(|s| s.entity_type).collect();
        assert!(types.contains(&EntityType::Email));
        assert!(types.contains(&EntityType::Phone));
    }

    #[test]
    fn test_partial_email_no_match() {
        let spans = detect_regex("not-an-email@");
        let emails: Vec<_> = spans
            .iter()
            .filter(|s| s.entity_type == EntityType::Email)
            .collect();
        assert_eq!(emails.len(), 0);
    }
}
#[cfg(test)]
mod contextual_tests {
    use super::*;

    fn find(text: &str, ty: EntityType) -> Vec<String> {
        detect_regex(text)
            .into_iter()
            .filter(|s| s.entity_type == ty)
            .map(|s| s.text)
            .collect()
    }

    #[test]
    fn id_documents_need_keyword_and_a_digit() {
        assert_eq!(find("Mit pasnummer er 123456789 tak", EntityType::IdDocument), vec!["123456789"]);
        assert_eq!(find("Passport no: X1234567", EntityType::IdDocument), vec!["X1234567"]);
        assert_eq!(find("Kørekortnummer: 12345678", EntityType::IdDocument), vec!["12345678"]);
        assert_eq!(find("driver's license number D1234567", EntityType::IdDocument), vec!["D1234567"]);
        assert!(find("Passport CONTROL is closed", EntityType::IdDocument).is_empty());
        assert!(find("123456789 alone", EntityType::IdDocument).is_empty());
    }

    #[test]
    fn birth_dates_and_places() {
        assert_eq!(find("Jeg er født 14. maj 1982 i Aarhus", EntityType::BirthDate), vec!["14. maj 1982"]);
        assert_eq!(find("Fødselsdato: 14/05/1982", EntityType::BirthDate), vec!["14/05/1982"]);
        assert_eq!(find("Date of birth: 1982-05-14", EntityType::BirthDate), vec!["1982-05-14"]);
        assert_eq!(find("DOB May 14, 1982", EntityType::BirthDate), vec!["May 14, 1982"]);
        assert!(find("Mødet er den 14/05/1982", EntityType::BirthDate).is_empty());
        assert_eq!(find("Min fødselsdato er 22-11-1979", EntityType::BirthDate), vec!["22-11-1979"]);
        assert_eq!(find("hans fødselsdato var 1979-11-05", EntityType::BirthDate), vec!["1979-11-05"]);
        assert_eq!(find("Hendes fødselsdag er den 3. marts 1985", EntityType::BirthDate), vec!["3. marts 1985"]);
        assert_eq!(find("Han gav sin fødselsdato som 15.03.1980", EntityType::BirthDate), vec!["15.03.1980"]);
        assert!(find("firmaets fødselsdag er snart", EntityType::BirthDate).is_empty());
        assert!(find("fødselsdato er ukendt", EntityType::BirthDate).is_empty());
        assert_eq!(find("Jeg er født i Aarhus", EntityType::Location), vec!["Aarhus"]);
        assert_eq!(find("Fødested: Odense", EntityType::Location), vec!["Odense"]);
        assert!(find("Hun er født i Danmark", EntityType::Location).is_empty());
    }

    #[test]
    fn job_titles_need_a_role_word() {
        assert_eq!(find("Titel: Senior Software Engineer", EntityType::JobTitle), vec!["Senior Software Engineer"]);
        assert_eq!(find("Jeg arbejder som sygeplejerske på afdeling 4", EntityType::JobTitle), vec!["sygeplejerske"]);
        assert_eq!(find("She works as a project manager", EntityType::JobTitle), vec!["project manager"]);
        assert!(find("The script works as expected", EntityType::JobTitle).is_empty());
    }

    #[test]
    fn json_labels_and_loose_formats() {
        assert_eq!(find(r#"{"dob": "1979-02-28", "passport": "X9876543"}"#, EntityType::BirthDate), vec!["1979-02-28"]);
        assert_eq!(find(r#"{"dob": "1979-02-28", "passport": "X9876543"}"#, EntityType::IdDocument), vec!["X9876543"]);
        assert_eq!(find(r#""job_title": "Data Engineer""#, EntityType::JobTitle), vec!["Data Engineer"]);
        assert_eq!(find(r#""salary": 720000"#, EntityType::FinancialInfo), vec!["720000"]);
        assert_eq!(find("Arbejdsgiver: LEGO A/S", EntityType::Organization), vec!["LEGO A/S"]);
        assert_eq!(find("Pas: 210456789", EntityType::IdDocument), vec!["210456789"]);
        assert_eq!(find("Ledsagerens pas (nr. 345678901) blev stjålet", EntityType::IdDocument), vec!["345678901"]);
        assert_eq!(find("passport no 21 04 56 789", EntityType::IdDocument), vec!["21 04 56 789"]);
        assert_eq!(find("Kørekort nr: 1234 5678", EntityType::IdDocument), vec!["1234 5678"]);
        assert_eq!(find("born May 14th, 1982", EntityType::BirthDate), vec!["May 14th, 1982"]);
        assert_eq!(find("f. 14-05-1982", EntityType::BirthDate), vec!["14-05-1982"]);
        assert_eq!(find("My income last year was 78 500 EUR.", EntityType::FinancialInfo), vec!["78 500 EUR"]);
        assert_eq!(find("Indkomst 2023: 489.000 kr, formue", EntityType::FinancialInfo), vec!["489.000 kr"]);
        assert_eq!(find("Bruttoløn 52500", EntityType::FinancialInfo), vec!["52500"]);
        assert_eq!(find("salary of around 120k", EntityType::FinancialInfo), vec!["120k"]);
        assert_eq!(find("Hun tjener ca. 40.000 kr/md", EntityType::FinancialInfo), vec!["40.000 kr"]);
        assert!(find("He earned 5000 points", EntityType::FinancialInfo).is_empty());
        assert!(find("passport no 21 04", EntityType::IdDocument).is_empty());
    }

    #[test]
    fn appositive_and_prefixed_roles() {
        assert_eq!(find("Lars Nielsen, afdelingsleder hos Novo Nordisk, har sagt op.", EntityType::JobTitle), vec!["afdelingsleder"]);
        assert_eq!(find("Sofie Madsen — psykolog, Region Hovedstaden", EntityType::JobTitle), vec!["psykolog"]);
        assert_eq!(find("Mette S. | CFO | Carlsberg", EntityType::JobTitle), vec!["CFO"]);
        assert_eq!(find("Peter Holm, direktør i Nordlys Consulting ApS", EntityType::JobTitle), vec!["direktør"]);
        assert_eq!(find("Our CTO Anna Lund joined", EntityType::JobTitle), vec!["CTO"]);
        assert_eq!(find("Hun er sygeplejerske, som er softwareudvikler hos Netcompany", EntityType::JobTitle), vec!["softwareudvikler"]);
        assert!(find("Hej Lars, leder du efter noget?", EntityType::JobTitle).is_empty());
    }

    #[test]
    fn plain_sentences_with_role_and_workplace() {
        let text = "Aviaja Petersen er webudvikler i DI.";
        assert_eq!(find(text, EntityType::JobTitle), vec!["webudvikler"]);
        assert_eq!(find(text, EntityType::Organization), vec!["DI"]);
        let en = "Emily Walker is a senior nurse at Rigshospitalet";
        assert_eq!(find(en, EntityType::JobTitle), vec!["senior nurse"]);
        assert_eq!(find(en, EntityType::Organization), vec!["Rigshospitalet"]);
        assert_eq!(find("Hun arbejder hos Novo Nordisk", EntityType::Organization), vec!["Novo Nordisk"]);
        assert_eq!(find("He works at Maersk", EntityType::Organization), vec!["Maersk"]);
        assert!(find("Hvad er en udvikler?", EntityType::JobTitle).is_empty());
        assert!(find("Jeg er læge", EntityType::JobTitle).is_empty());
        assert!(find("Han arbejder i Danmark", EntityType::Organization).is_empty());
    }

    #[test]
    fn salary_and_debt_amounts() {
        assert_eq!(find("Min løn er 45.000 kr om måneden", EntityType::FinancialInfo), vec!["45.000 kr"]);
        assert_eq!(find("Salary: $85,000", EntityType::FinancialInfo), vec!["$85,000"]);
        assert_eq!(find("Jeg har en gæld på 2 millioner kr", EntityType::FinancialInfo), vec!["2 millioner kr"]);
        assert!(find("Løn 12 timer", EntityType::FinancialInfo).is_empty());
    }

    #[test]
    fn usernames_after_a_keyword() {
        assert_eq!(find("auth: login failed user=karenb ip=1.2.3.4", EntityType::Username), vec!["karenb"]);
        assert_eq!(find("bruger: hj_nielsen kan ikke logge ind", EntityType::Username), vec!["hj_nielsen"]);
        assert_eq!(find("Adgang til intra og brugernavn hj_nielsen", EntityType::Username), vec!["hj_nielsen"]);
        assert_eq!(find("username is mads.k92 and", EntityType::Username), vec!["mads.k92"]);
        assert_eq!(find("File \"C:\\Users\\mlarsen_dev\\work\\main.py\"", EntityType::Username), vec!["mlarsen_dev"]);
        assert_eq!(find("cd /home/karenb/projects", EntityType::Username), vec!["karenb"]);
        // system accounts, words and numbers are not usernames
        assert!(find("user=admin and user=root", EntityType::Username).is_empty());
        assert!(find("user=12345 uid: 1000", EntityType::Username).is_empty());
        assert!(find("brugernavn og password skal udfyldes", EntityType::Username).is_empty());
        assert!(find("C:\\Users\\Public\\Documents\\x", EntityType::Username).is_empty());
    }

    #[test]
    fn handles_need_an_underscore_or_digit() {
        assert_eq!(find("følg mig på @lenelund_dk i dag", EntityType::Username), vec!["@lenelund_dk"]);
        assert_eq!(find("@mads92 skrev det", EntityType::Username), vec!["@mads92"]);
        assert!(find("@Override public void run()", EntityType::Username).is_empty());
        assert!(find("@media (max-width: 600px)", EntityType::Username).is_empty());
        assert!(find("@app.route('/x') og lars@firma.dk", EntityType::Username).is_empty());
        assert!(find("icon@2x.png", EntityType::Username).is_empty());
    }
}

#[cfg(test)]
mod phone_tests {
    use super::*;

    fn phones(text: &str) -> Vec<String> {
        detect_regex(text)
            .into_iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .map(|s| s.text)
            .collect()
    }

    /// Every phone span the recognizers emit for `text` is exactly `expected`
    /// (duplicates from the generic and the Danish rule are fine).
    fn assert_one_phone(text: &str, expected: &str) {
        let found = phones(text);
        assert!(!found.is_empty(), "no phone in {text:?}");
        for f in &found {
            assert_eq!(f, expected, "in {text:?}, all phones: {found:?}");
        }
    }

    #[test]
    fn danish_prefixed_numbers_need_a_2_to_9_first_digit() {
        // Real Danish subscriber numbers start with 2-9; the Danish rules say so.
        assert_one_phone("Jeg kan kontaktes på +45 50930610.", "+45 50930610");
        assert_one_phone("tlf +45 28 71 40 93 tak", "+45 28 71 40 93");
        assert_one_phone("tlf +4550930610 tak", "+4550930610");
        assert_one_phone("tlf +45-50-93-06-10 tak", "+45-50-93-06-10");
        assert_one_phone("tlf +45 5093 0610 tak", "+45 5093 0610");
        assert_one_phone("tlf +45.50.93.06.10 tak", "+45.50.93.06.10");
        assert_one_phone("tlf 0045 50930610 tak", "0045 50930610");
        assert_one_phone("tlf (+45) 50 93 06 10 tak", "(+45) 50 93 06 10");
        assert_one_phone("Ring +45 28 71 40 93 nu", "+45 28 71 40 93");
        // The Danish rule itself does not accept a 0/1 first digit, with or without prefix.
        // (An unprefixed fragment such as "45 12 34 56" inside "+45 12 34 56 78" may match; it is
        // removed in detect_regex, so only a match starting at the prefix would be a real hit.)
        for text in ["+45 12 34 56 78", "+4512345678", "0045 12345678", "+45 02 34 56 78", "12 34 56 78", "02 34 56 78"] {
            assert!(DK_PHONE_RE.find(text).map_or(true, |m| m.start() > 0), "DK rule matched {text:?}");
        }
        assert!(DK_PHONE_RE.is_match("+45 50930610"));
    }

    #[test]
    fn plus_45_with_a_1_first_digit_is_only_a_generic_international_match() {
        // Not a valid Danish number, but a well-formed "+<cc> ..." one: the generic rule reports the
        // whole number (all four pairs, with the "+") at its lower score 0.70, nothing from the
        // Danish rules (0.80). The TS placeholder filter then decides about "12 34 56 78".
        let spans: Vec<_> = detect_regex("tlf +45 12 34 56 78 tak")
            .into_iter()
            .filter(|s| s.entity_type == EntityType::Phone)
            .collect();
        assert!(!spans.is_empty());
        for s in &spans {
            assert_eq!(s.text, "+45 12 34 56 78");
            assert!((s.score - 0.70).abs() < 1e-9, "{s:?}");
        }
    }

    #[test]
    fn danish_grouped_numbers_without_prefix() {
        assert_one_phone("tlf 20 12 34 56 tak", "20 12 34 56");
        assert_one_phone("Mobilnr.: 20 34 56 78", "20 34 56 78");
        // A 1/0 first digit is not a Danish number: the Danish rules ignore it.
        assert!(DK_PHONE_RE.find("12 34 56 78").is_none());
    }

    #[test]
    fn bare_eight_digit_runs_are_low_score_candidates_with_a_2_to_9_first_digit() {
        // The recognizer emits a bare 8-digit run starting 2-9 at 0.36; the pipeline only keeps it
        // when a phone keyword is on the same line within the window (see pipeline tests).
        for text in ["tlf 20123456 tak", "tlf 50930610 tak", "ordre 50930610"] {
            let spans: Vec<_> = detect_regex(text)
                .into_iter()
                .filter(|s| s.entity_type == EntityType::Phone)
                .collect();
            assert_eq!(spans.len(), 1, "{text:?}: {spans:?}");
            assert!((spans[0].score - BARE_PHONE_SCORE).abs() < 1e-9, "{text:?}: {spans:?}");
        }
        // First digit 0 or 1, or not eight digits: no bare candidate.
        assert!(phones("tlf 12345678 tak").is_empty());
        assert!(phones("tlf 02345678 tak").is_empty());
        assert!(phones("tlf 1234567 tak").is_empty());
        assert!(phones("tlf 123456789 tak").is_empty());
    }

    #[test]
    fn international_numbers_match_in_full() {
        assert_one_phone("Call +49 30 12 34 56 78 now", "+49 30 12 34 56 78");
        assert_one_phone("Call +49 30 12345678 now", "+49 30 12345678");
        assert_one_phone("Call +1 212 555 1234 now", "+1 212 555 1234");
        assert_one_phone("Call +1-212-555-1234 now", "+1-212-555-1234");
        assert_one_phone("Call +44 20 7946 0958 now", "+44 20 7946 0958");
        assert_one_phone("Call +442079460958.", "+442079460958");
    }

    #[test]
    fn international_match_does_not_swallow_neighbours() {
        // +45 numbers have exactly 8 national digits.
        assert_one_phone("+45 12 34 56 78 2024", "+45 12 34 56 78");
        assert_one_phone("tlf +4512345678 90 tak", "+4512345678");
        // Other numbers are capped at 15 digits (E.164).
        let found = phones("+49 30 12 34 56 78 90 12 34 56");
        assert!(!found.is_empty());
        for f in &found {
            assert!(f.chars().filter(|c| c.is_ascii_digit()).count() <= 15, "{f:?}");
        }
    }

    #[test]
    fn plus_followed_by_few_digits_is_not_a_phone() {
        assert!(phones("Score: +1000 points").is_empty());
        assert!(phones("Temperatur +2024 grader").is_empty());
        assert!(phones("Ændring +45 12 34").is_empty());
    }

    #[test]
    fn leading_plus_is_part_of_the_span() {
        let spans = detect_regex("ring +45 12 34 56 78");
        let start = "ring ".len();
        assert!(
            spans
                .iter()
                .filter(|s| s.entity_type == EntityType::Phone)
                .all(|s| s.start == start && s.end == "ring +45 12 34 56 78".len()),
            "{spans:?}"
        );
    }

    #[test]
    fn non_phone_digit_patterns_stay_clean() {
        for text in [
            "Born 1990-01-15 and 2024",
            "Released 12/05/2023",
            "CPR 010170-1234 tak",
            "cpr 0101701234 tak",
            "Reference 300290-1234",
            "konto 1234-1234567890",
            "IBAN DK50 0040 0440 1162 43",
            "order 1234567 shipped",
            "page 12345 of 99999",
            "year 2023 and 2024",
            "ip 192.168.100.1",
            "Kort 4111 1111 1111 1111",
        ] {
            let found: Vec<_> = detect_regex(text)
                .into_iter()
                .filter(|s| s.entity_type == EntityType::Phone)
                .collect();
            // Fragments of IP/IBAN/card/CPR numbers are removed later in the pipeline; here
            // we only assert that nothing phone-shaped carries a "+" or the 0045 prefix.
            assert!(
                found.iter().all(|s| !is_explicit_international(&s.text)),
                "unexpected explicit phone in {text:?}: {found:?}"
            );
        }
    }

    #[test]
    fn trim_international_bounds() {
        assert_eq!(trim_international("+45 12 34 56 78 2024"), Some("+45 12 34 56 78".len()));
        assert_eq!(trim_international("+1000"), None);
        assert_eq!(trim_international("+45123456789"), None);
        assert_eq!(trim_international("(+45) 12 34 56 78"), Some("(+45) 12 34 56 78".len()));
    }
}

#[cfg(test)]
mod email_and_secret_tests {
    use super::*;

    fn find(text: &str, ty: EntityType) -> Vec<String> {
        detect_regex(text)
            .into_iter()
            .filter(|s| s.entity_type == ty)
            .map(|s| s.text)
            .collect()
    }

    #[test]
    fn password_directly_after_keyword() {
        assert_eq!(find("Adgangskoden Køkkenhave#82 stod på en post-it", EntityType::Password), vec!["Køkkenhave#82"]);
        assert_eq!(find("The password Summer2024! was reused", EntityType::Password), vec!["Summer2024!"]);
        assert_eq!(find("Kodeordet Fjord7Bro blev delt", EntityType::Password), vec!["Fjord7Bro"]);
        // The sentence's full stop is not part of the password; a closing "!" is.
        assert_eq!(find("Hun fik adgangskoden ApricotRiver!63.", EntityType::Password), vec!["ApricotRiver!63"]);
        assert_eq!(find("Han skrev adgangskoden Sommer2024!", EntityType::Password), vec!["Sommer2024!"]);
        // Ordinary prose after the keyword has no digit or symbol, or is too short.
        assert!(find("Adgangskoden skal ændres hver sjette måned", EntityType::Password).is_empty());
        assert!(find("password policy was revised in March", EntityType::Password).is_empty());
        assert!(find("Kodeordet udløber snart", EntityType::Password).is_empty());
        assert!(find("pinkode 1234 virker ikke", EntityType::Password).is_empty());
        assert!(find("password reset-link sendt", EntityType::Password).is_empty());
        // Log lines: the keyword inside an identifier, and key=value pairs, are not a password.
        assert!(find("action=login result=bad_password attempt=3", EntityType::Password).is_empty());
        assert!(find("auth failed, password attempt=3 of 5", EntityType::Password).is_empty());
        assert!(find("wrong-password retry4x", EntityType::Password).is_empty());
    }

    #[test]
    fn salary_and_debt_in_more_currencies() {
        assert_eq!(find("Annual salary GBP 47,850 before tax", EntityType::FinancialInfo), vec!["GBP 47,850"]);
        assert_eq!(find("Min gæld er NOK 120.000", EntityType::FinancialInfo), vec!["NOK 120.000"]);
        assert_eq!(find("Månedsløn: 52.000 SEK", EntityType::FinancialInfo), vec!["52.000 SEK"]);
        // A price without a salary/debt keyword stays unflagged.
        assert!(find("The laptop costs GBP 1,299 at Currys", EntityType::FinancialInfo).is_empty());
    }

    #[test]
    fn emails_with_danish_letters() {
        assert_eq!(find("mail søren@firma.dk tak", EntityType::Email), vec!["søren@firma.dk"]);
        assert_eq!(find("mail Bjørn.Æble@firma.dk.", EntityType::Email), vec!["Bjørn.Æble@firma.dk"]);
        assert_eq!(find("mail mads@æble.dk tak", EntityType::Email), vec!["mads@æble.dk"]);
        assert_eq!(find("mail jürgen@münchen.de", EntityType::Email), vec!["jürgen@münchen.de"]);
        // unchanged behaviour
        assert_eq!(find("<a.b@c.dk>, (x@y.dk)", EntityType::Email), vec!["a.b@c.dk", "x@y.dk"]);
        assert!(find("not-an-email@", EntityType::Email).is_empty());
        assert!(find("a@@b.dk og @ gmail.com", EntityType::Email).is_empty());
    }

    #[test]
    fn danish_secret_keywords_with_connectors_and_quotes() {
        assert_eq!(find("Hun ændrede sit kodeord til Sommer2024!", EntityType::Password), vec!["Sommer2024!"]);
        assert_eq!(find("Kunden har oplyst, at hans adgangskode \"Sikker2024!\" er udløbet", EntityType::Password), vec!["Sikker2024!"]);
        assert_eq!(find("Min sikkerhedstoken er Abc123XyZ789", EntityType::Password), vec!["Abc123XyZ789"]);
        assert_eq!(find("Han fik udstedt en sikkerhedskode: AKJ983ZXL72", EntityType::Password), vec!["AKJ983ZXL72"]);
        assert_eq!(find("jeg har glemt min adgangskode og brugte \"Sommer2023!\" sidst", EntityType::Password), vec!["Sommer2023!"]);
        assert_eq!(find("skal opdatere passwordet \"Sikker123!\"", EntityType::Password), vec!["Sikker123!"]);
        assert_eq!(find("adgangskoden til systemet er Kd9#pQr7x", EntityType::Password), vec!["Kd9#pQr7x"]);
        // plain words are not secrets
        assert!(find("kodeord til systemet bliver skiftet i morgen", EntityType::Password).is_empty());
        assert!(find("Husk at skifte adgangskoden hver sjette måned", EntityType::Password).is_empty());
        assert!(find("vi bruger et token som identifikation", EntityType::Password).is_empty());
        assert!(find("password was \"changeme\"", EntityType::Password).is_empty());
    }

    #[test]
    fn url_credentials_are_reported_even_when_the_password_is_a_word() {
        assert_eq!(find("https://user:secretpass@host.dk/x", EntityType::Password), vec!["secretpass"]);
        assert_eq!(find("postgres://app:hunter2@db:5432/x", EntityType::Password), vec!["hunter2"]);
        // keyword assignments still need a secret-looking value
        assert!(find("password: required", EntityType::Password).is_empty());
    }
}

#[cfg(test)]
mod bank_label_tests {
    use super::*;

    /// BANK_ACCOUNT spans at the keyword-anchored score (the old digit-pair rule is 0.40).
    fn labelled_accounts(text: &str) -> Vec<String> {
        detect_regex(text)
            .into_iter()
            .filter(|s| s.entity_type == EntityType::BankAccount && s.score >= 0.85)
            .map(|s| s.text)
            .collect()
    }

    #[test]
    fn written_reg_and_konto_layouts() {
        assert_eq!(labelled_accounts("Reg. 5678 konto 9876543210"), vec!["5678 konto 9876543210"]);
        assert_eq!(labelled_accounts("reg 5678 konto 9876543210 tak"), vec!["5678 konto 9876543210"]);
        assert_eq!(labelled_accounts("Reg.nr. 5678, kontonr. 9876543210."), vec!["5678, kontonr. 9876543210"]);
        assert_eq!(labelled_accounts("Regnr: 5678 og konto nr. 9876543210"), vec!["5678 og konto nr. 9876543210"]);
        assert_eq!(
            labelled_accounts("REGISTRERINGSNUMMER 5678 KONTONUMMER: 9876543210"),
            vec!["5678 KONTONUMMER: 9876543210"]
        );
        assert_eq!(labelled_accounts("Reg. 5678 konto 98765432"), vec!["5678 konto 98765432"]);
        assert_eq!(labelled_accounts("Reg. 5678 konto 987654"), vec!["5678 konto 987654"]);
        assert_eq!(labelled_accounts("Bankkonto\tReg. 5678 konto 9876543210"), vec!["5678 konto 9876543210"]);
    }

    #[test]
    fn reversed_layout_needs_both_keywords() {
        assert_eq!(labelled_accounts("konto 9876543210 reg 5678"), vec!["9876543210 reg 5678"]);
        assert_eq!(labelled_accounts("Kontonr. 9876543210 og reg.nr. 5678"), vec!["9876543210 og reg.nr. 5678"]);
        assert!(labelled_accounts("konto 9876543210").is_empty());
    }

    #[test]
    fn needs_both_keywords_and_the_right_digit_counts() {
        for text in [
            "5678 9876543210",
            "Budget 2026\t125000\t98250.5",
            "5678\t9876543210",
            "CPR 010170-1234",
            "Ordrenummer 12345678",
            "konto 9876543210",
            "reg 5678",
            "Reg. 5678 og noget andet 9876543210",
            "registrering 5678 konto 9876543210",
            "bankreg 5678 konto 9876543210",
            "Reg. 5678 konto 12345",
            "Reg. 5678 konto 12345678901",
            "reg 56789 konto 9876543210",
            "reg 567 konto 9876543210",
        ] {
            assert!(labelled_accounts(text).is_empty(), "{text:?}: {:?}", labelled_accounts(text));
        }
    }

    #[test]
    fn the_extensions_own_generated_account_is_not_reported_again() {
        // "reg 1234 konto 1234567xxx" is what the extension writes when it replaces an account.
        for text in ["Reg. 1234 konto 1234567890", "reg 1234 konto 1234567891", "Reg.nr. 1234 kontonr. 1234567000"] {
            assert!(labelled_accounts(text).is_empty(), "{text:?}: {:?}", labelled_accounts(text));
        }
        assert_eq!(labelled_accounts("Reg. 1234 konto 7654321098"), vec!["1234 konto 7654321098"]);
    }

    #[test]
    fn not_the_extensions_own_account_helper() {
        assert!(!not_the_extensions_own_account("1234 konto 1234567890"));
        assert!(!not_the_extensions_own_account("1234konto1234567999"));
        assert!(not_the_extensions_own_account("5678 konto 9876543210"));
        assert!(not_the_extensions_own_account("1234 konto 7654321098"));
    }
}
