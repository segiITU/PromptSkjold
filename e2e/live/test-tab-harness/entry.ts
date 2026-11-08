/**
 * Visual-test entry for the popup Test tab: mounts the real TestTab with fake stores and a fixed outcome, so the
 * highlighted "checked text" can be screenshotted without building the whole extension. Never shipped.
 */
import { mount } from 'svelte';
import { writable } from 'svelte/store';
import '../../../src/shared/styles/tokens.css';
import { __resetLanguageForTests } from '../../../src/shared/i18n/core';
import { da } from '../../../src/shared/i18n/da';
import { en } from '../../../src/shared/i18n/en';
import type { PiiSpan } from '../../../src/shared/message-types';
import TestTab from '../../../src/popup/components/TestTab.svelte';
import DetectionRulesCard from '../../../src/popup/components/DetectionRulesCard.svelte';
import { ReviewOverlay } from '../../../src/ui/overlay/overlay';
import { GROUP_NAMES, GROUP_DEFAULT_ON } from '../../../src/shared/category-groups';

const enc = new TextEncoder();
function span(text: string, value: string, type: PiiSpan['entity_type'], score: number, from = 0): PiiSpan {
  const idx = text.indexOf(value, from);
  const start = enc.encode(text.slice(0, idx)).length;
  return { start, end: start + enc.encode(value).length, entity_type: type, score, text: value, source: 'regex' };
}

(window as unknown as { show: (lang: 'da' | 'en', mode: 'ideal' | 'real') => void }).show = (lang, mode) => {
  __resetLanguageForTests(lang);
  document.documentElement.lang = lang;
  const text = (lang === 'da' ? da : en)['test.sample'];
  const at = (v: string, from = 0) => text.indexOf(v, from);
  const spans: PiiSpan[] =
    mode === 'ideal'
      ? [
          span(text, 'Sebastian Gilson', 'PERSON', 1),
          span(text, lang === 'da' ? 'AI-udvikler' : 'AI developer', 'JOB_TITLE', 0.97),
          span(text, 'ermias.ai', 'ORGANIZATION', 0.93),
          span(text, 'kontakt@ermias.ai', 'EMAIL', 0.95),
          span(text, '+45 50930610', 'PHONE', 0.95),
          span(text, '111111-1111', 'CPR', 1),
        ]
      : [
          // what the detector actually returned on this text
          span(text, 'Sebastian Gilson', 'PERSON', 1),
          span(text, lang === 'da' ? 'AI-udvikler' : 'AI developer', 'JOB_TITLE', 0.97),
          span(text, 'ermias.ai', 'EMAIL', 1, at('ermias.ai')),
          span(text, 'kontakt@ermias.ai', 'EMAIL', 0.95),
          span(text, '45 12 34 56', 'PHONE', 0.95),
          span(text, '111111-1111', 'CPR', 1),
        ];
  const target = document.getElementById('app')!;
  target.innerHTML = '';
  mount(TestTab, {
    target,
    props: {
      testInput: writable(text),
      isRunning: writable(false),
      outcome: writable({ state: 'done', text, spans, totalMs: 63, nerMs: 60, nerLine: '' }),
      enabledCount: writable(7),
      feedbackCounts: writable({ confirmed: 0, ignored: 0, pending: 0 }),
      runDetection: async () => undefined,
      clearFeedback: async () => undefined,
    },
  });
};

// "Hvad skal findes": the rules list with the group icons
(window as unknown as { showRules: (lang: 'da' | 'en') => void }).showRules = (lang) => {
  __resetLanguageForTests(lang);
  const target = document.getElementById('app')!;
  target.innerHTML = '';
  const categories = writable(GROUP_NAMES.map((id) => ({ id, label: id, description: '', enabled: GROUP_DEFAULT_ON[id], defaultEnabled: GROUP_DEFAULT_ON[id] })));
  mount(DetectionRulesCard, { target, props: { categories, enabledCount: writable(7), setCategoryEnabled: async () => undefined } });
};

// The review overlay (real component, real stylesheet) over a blank chat-like page
(window as unknown as { showOverlay: (lang: 'da' | 'en') => void }).showOverlay = (lang) => {
  __resetLanguageForTests(lang);
  const text = (lang === 'da' ? da : en)['test.sample'];
  const spans: PiiSpan[] = [
    span(text, 'Sebastian Gilson', 'PERSON', 1),
    span(text, lang === 'da' ? 'AI-udvikler' : 'AI developer', 'JOB_TITLE', 0.97),
    span(text, 'ermias.ai', 'ORGANIZATION', 0.93),
    span(text, 'kontakt@ermias.ai', 'EMAIL', 0.95),
    span(text, '+45 50930610', 'PHONE', 0.95),
    span(text, '111111-1111', 'CPR', 1),
  ];
  const noop = () => undefined;
  new ReviewOverlay(text, spans, { onConfirm: noop, onPasteOriginal: noop, onCancel: noop, onFeedback: noop, onAddToAllowlist: noop, onEditDetails: noop }, 0.5, { totalMs: 63 }).show();
};
