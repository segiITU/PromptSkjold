import { mount } from 'svelte';
import '../shared/styles/tokens.css';
import { getLanguage, initLanguage, onLanguageChange } from '../shared/i18n/core';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Options mount target #app not found');
}

// Read the language preference first so the first paint is in the right language.
void initLanguage().finally(() => {
  document.documentElement.lang = getLanguage();
  onLanguageChange((lang) => (document.documentElement.lang = lang));
  mount(App, { target });
});
