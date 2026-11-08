<script lang="ts">
	import type { CategoriesModel } from '../popup-model.svelte';
	import { tr } from '../../shared/i18n/store';
	import DetectionRulesCard from './DetectionRulesCard.svelte';

	let { categories }: { categories: CategoriesModel } = $props();
</script>

<div class="pk-stack">
	<DetectionRulesCard
		categories={categories.categories}
		enabledCount={categories.enabledCount}
		setCategoryEnabled={categories.setCategoryEnabled}
	/>
	<p class="pk-fine">{$tr('detect.note')}</p>
</div>
