import { isNerNoise } from '../../src/offscreen/ner-noise-filter';
import { applySpanPostFilters } from '../../src/offscreen/span-post-filter';
import type { EntityType, PiiSpan } from '../../src/shared/message-types';

/** Span offsets in the pipeline are UTF-8 byte offsets. */
function find(text: string, needle: string, entity_type: EntityType, source: PiiSpan['source'] = 'ner'): PiiSpan {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" not in text`);
  const start = Buffer.byteLength(text.slice(0, index));
  return { start, end: start + Buffer.byteLength(needle), entity_type, score: 0.9, text: needle, source };
}

function sliceBytes(text: string, s: PiiSpan): string {
  return Buffer.from(text).subarray(s.start, s.end).toString();
}

describe('placeholder data', () => {
  it('drops example.com addresses and obvious placeholder phone numbers', () => {
    const text = 'Email: navn@example.com Tlf: 12345678 og 00 00 00 00 samt +45 12 34 56 78';
    const spans = [
      find(text, 'navn@example.com', 'EMAIL', 'regex'),
      find(text, '12345678', 'PHONE', 'regex'),
      find(text, '00 00 00 00', 'PHONE', 'regex'),
      find(text, '+45 12 34 56 78', 'PHONE', 'regex'),
    ];
    expect(applySpanPostFilters(text, spans)).toEqual([]);
  });

  it('keeps a real address and a real phone number', () => {
    const text = 'lars@firma.dk ringer fra +45 20 31 44 55';
    const spans = [find(text, 'lars@firma.dk', 'EMAIL', 'regex'), find(text, '+45 20 31 44 55', 'PHONE', 'regex')];
    expect(applySpanPostFilters(text, spans)).toHaveLength(2);
  });
});

describe('model-guessed bank accounts', () => {
  it('drops product, EAN and SKU guesses', () => {
    const text = 'Lampe LED-30 EAN 5701234567893 og SKU KB-0310 samt varenr 10442';
    const spans = [
      find(text, 'EAN 5701234567893', 'BANK_ACCOUNT'),
      find(text, 'SKU', 'BANK_ACCOUNT'),
      find(text, '10442', 'BANK_ACCOUNT'),
    ];
    expect(applySpanPostFilters(text, spans)).toEqual([]);
  });

  it('keeps reg/konto numbers, also with words between the parts', () => {
    const text = 'Overfør til reg 3409 konto 0012345678 og kontonr 1234567890';
    const spans = [find(text, '3409 konto 0012345678', 'BANK_ACCOUNT'), find(text, '1234567890', 'BANK_ACCOUNT')];
    expect(applySpanPostFilters(text, spans)).toHaveLength(2);
  });

  it('drops a bare 13-digit number and one following "EAN"', () => {
    const text = 'EAN 5701234567893';
    expect(applySpanPostFilters(text, [find(text, '5701234567893', 'BANK_ACCOUNT')])).toEqual([]);
  });

  it('ignores the generic account the extension itself writes, but not a real-looking number', () => {
    const own = 'Overfør til reg. 1234 konto 1234567891 tak';
    expect(applySpanPostFilters(own, [find(own, '1234567891', 'BANK_ACCOUNT')])).toHaveLength(0);
    const bare = 'Overfør til konto 1234 1234567893 tak';
    expect(applySpanPostFilters(bare, [find(bare, '1234 1234567893', 'BANK_ACCOUNT')])).toHaveLength(0);
    const whole = 'Overfør til reg. 1234 konto 1234567892 tak';
    expect(applySpanPostFilters(whole, [find(whole, '1234 konto 1234567892', 'BANK_ACCOUNT')])).toHaveLength(0);
    const real = 'Overfør til kontonr 1234567890 tak';
    expect(applySpanPostFilters(real, [find(real, '1234567890', 'BANK_ACCOUNT')])).toHaveLength(1);
  });

  it('never touches an account found by the patterns', () => {
    const text = 'sku 1234567890';
    expect(applySpanPostFilters(text, [find(text, '1234567890', 'BANK_ACCOUNT', 'regex')])).toHaveLength(1);
  });
});

describe('attributes need an identifiable person', () => {
  it('drops a job title, town and birth date with nobody near them', () => {
    const text = 'Jeg er jurist i Aarhus og min far er født 31.05.1952.';
    const spans = [
      find(text, 'jurist', 'JOB_TITLE'),
      find(text, 'Aarhus', 'LOCATION'),
      find(text, '31.05.1952', 'BIRTH_DATE'),
    ];
    expect(applySpanPostFilters(text, spans)).toEqual([]);
  });

  it('keeps them next to a name, and keeps the name', () => {
    const text = 'Mvh Mette Hansen, sygeplejerske i Aarhus, født 31.05.1952.';
    const spans = [
      find(text, 'Mette Hansen', 'PERSON'),
      find(text, 'sygeplejerske', 'JOB_TITLE'),
      find(text, 'Aarhus', 'LOCATION'),
      find(text, '31.05.1952', 'BIRTH_DATE'),
    ];
    expect(applySpanPostFilters(text, spans)).toHaveLength(4);
  });

  it('a name more than 1000 characters away does not anchor', () => {
    const filler = 'x '.repeat(700);
    const text = `Lars Hansen ${filler}jeg arbejder som tømrer`;
    const spans = [find(text, 'Lars Hansen', 'PERSON'), find(text, 'tømrer', 'JOB_TITLE')];
    const kept = applySpanPostFilters(text, spans);
    expect(kept.map((s) => s.entity_type)).toEqual(['PERSON']);
  });

  it('a private IP or a plain date does not anchor', () => {
    const text = 'Server 10.0.0.12 i Odense, den 3. maj 2024';
    const spans = [
      find(text, '10.0.0.12', 'IP_ADDRESS', 'regex'),
      find(text, 'Odense', 'LOCATION'),
      find(text, '3. maj 2024', 'DATE'),
    ];
    expect(applySpanPostFilters(text, spans).map((s) => s.entity_type).sort()).toEqual(['DATE', 'IP_ADDRESS']);
  });

  it('can be switched off', () => {
    const text = 'jeg er jurist';
    const spans = [find(text, 'jurist', 'JOB_TITLE')];
    expect(applySpanPostFilters(text, spans, { anchorAttributes: false })).toHaveLength(1);
  });
});

describe('names mentioned again', () => {
  it('flags a bare first name or surname after the full name, also with genitive s', () => {
    const text = 'Rikke Hansen er ansat hos firmaet. Rikke mener at hun er fyret. Rikkes bekymringer. Hr. Hansen ringer.';
    const kept = applySpanPostFilters(text, [find(text, 'Rikke Hansen', 'PERSON')]);
    expect(kept.map((s) => s.text)).toEqual(['Rikke Hansen', 'Rikke', 'Rikke', 'Hansen']);
    for (const s of kept) expect(sliceBytes(text, s)).toBe(s.text);
  });

  it('does not touch longer words, short tokens, stopwords or lowercase text', () => {
    const text = 'Lars Hansen. Larsen og Hansens bil, lars og mark samt Mark.';
    const kept = applySpanPostFilters(text, [find(text, 'Lars Hansen', 'PERSON')]);
    // "Hansens" is a genitive of Hansen and is flagged; "Larsen", "lars" and "Mark" are not.
    expect(kept.map((s) => s.text)).toEqual(['Lars Hansen', 'Hansen']);
  });

  it('keeps offsets right after Danish letters', () => {
    const text = 'Æbleskiver hos Søren Møller. Møller sagde ja.';
    const kept = applySpanPostFilters(text, [find(text, 'Søren Møller', 'PERSON')]);
    expect(kept.map((s) => sliceBytes(text, s))).toEqual(['Søren Møller', 'Møller']);
  });

  it('uses byte offsets for the bank-account context check after Danish letters', () => {
    const text = 'Æblegrød og røde grønne pærer: EAN 5701234567893';
    const span = find(text, '5701234567893', 'BANK_ACCOUNT');
    expect(applySpanPostFilters(text, [span])).toEqual([]);
  });

  it('can be switched off', () => {
    const text = 'Rikke Hansen. Rikke ringer.';
    expect(applySpanPostFilters(text, [find(text, 'Rikke Hansen', 'PERSON')], { propagateNames: false })).toHaveLength(1);
  });
});

describe('geography and form placeholders', () => {
  it('does not flag straits, seas, islands and regions', () => {
    for (const text of ['Øresund', 'Storebælt', 'Roskilde Fjord', 'Sjælland', 'Skåne', 'Bornholm', 'Jylland']) {
      expect(isNerNoise({ entity_type: 'LOCATION', text })).toBe(true);
    }
  });

  it('still flags a town', () => {
    expect(isNerNoise({ entity_type: 'LOCATION', text: 'Tårnby' })).toBe(false);
  });

  it('drops form placeholders', () => {
    for (const text of ['[Navn]', 'Fornavn Efternavn', 'John Doe', 'Vejnavn']) {
      expect(isNerNoise({ entity_type: 'PERSON', text })).toBe(true);
    }
  });
});

describe('labels the extension wrote itself', () => {
  it('drops a person span on [PERSON_11] and on the bare word inside it', () => {
    const text = 'Hej [PERSON_11], dit CPR er [CPR_2]. Æblegade 5.';
    const spans = [
      find(text, '[PERSON_11]', 'PERSON'),
      find(text, 'PERSON_11', 'PERSON'),
      find(text, '[CPR_2]', 'CPR', 'regex'),
    ];
    expect(applySpanPostFilters(text, spans)).toEqual([]);
  });

  it('keeps real text next to a label, and look-alike labels that are not entity types', () => {
    const text = 'Lars Hansen skrev til [PERSON_1] om [A_1] og Anna Jensen';
    const spans = [find(text, 'Lars Hansen', 'PERSON'), find(text, '[A_1]', 'MISC'), find(text, 'Anna Jensen', 'PERSON')];
    expect(applySpanPostFilters(text, spans, { propagateNames: false })).toHaveLength(3);
  });

  it('maps byte offsets right when non-ASCII text comes before the label', () => {
    const text = 'Århus Ærø [PERSON_3] og Rikke Hansen';
    const spans = [find(text, '[PERSON_3]', 'PERSON'), find(text, 'Rikke Hansen', 'PERSON')];
    const kept = applySpanPostFilters(text, spans, { propagateNames: false });
    expect(kept.map((s) => s.text)).toEqual(['Rikke Hansen']);
  });
});

describe('bank accounts that contain a tab (spreadsheet cells)', () => {
  const kept = (text: string, needle: string, source: PiiSpan['source'] = 'regex') =>
    applySpanPostFilters(text, [find(text, needle, 'BANK_ACCOUNT', source)]).length === 1;

  it('drops a year and an amount in two cells', () => {
    expect(kept('Budget 2026\t125000\t98250.5', '2026\t125000')).toBe(false);
    expect(kept('Budget 2026\t125000\t98250.5', '2026\t125000', 'ner')).toBe(false);
  });

  it('keeps a tab layout that has a bank label right before it', () => {
    expect(kept('Reg.nr.\t5678\t9876543210', '5678\t9876543210')).toBe(true);
    expect(kept('Konto\t5678\t9876543210', '5678\t9876543210')).toBe(true);
    expect(kept('KONTONR.: 5678\t9876543210', '5678\t9876543210')).toBe(true);
    expect(kept('Bankkonto\tReg 5678\t9876543210', '5678\t9876543210')).toBe(true);
    // a label at the start of the span itself counts too
    expect(kept('Bankkonto\tReg 5678\t9876543210', 'Reg 5678\t9876543210')).toBe(true);
  });

  it('does not change the rules for space-separated accounts', () => {
    expect(kept('Overfør til 5678 9876543210 tak', '5678 9876543210')).toBe(true);
    expect(kept('konto 5678-9876543210', '5678-9876543210')).toBe(true);
  });

  it('still drops the extension’s own generic account in a tab layout', () => {
    expect(kept('Reg.nr.\t1234\t1234567890', '1234\t1234567890')).toBe(false);
  });
});
