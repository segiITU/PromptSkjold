<script lang="ts">
	import type { LanguagePreference } from '../../shared/i18n/core';
	import { chooseLanguage, languagePreference, tr } from '../../shared/i18n/store';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Segmented from '../../popup/components/Segmented.svelte';
</script>

<article class="pk-card" id="language-section">
	<CardHeading title={$tr('lang.title')} hint={$tr('lang.hint')} />
	<div class="pk-row">
		<div>
			<span class="pk-label">{$tr('lang.label')}</span>
			<span class="pk-meta">{$tr('lang.text')}</span>
		</div>
		<Segmented
			ariaLabel={$tr('set.langAria')}
			value={$languagePreference}
			options={[
				{ value: 'auto', label: $tr('set.langAuto') },
				{ value: 'da', label: $tr('set.langDa') },
				{ value: 'en', label: $tr('set.langEn') },
			]}
			onchange={(pref: LanguagePreference) => void chooseLanguage(pref)}
		/>
	</div>
</article>
