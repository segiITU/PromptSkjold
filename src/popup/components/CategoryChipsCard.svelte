<script lang="ts">
	import type { CategoriesModel } from '../popup-model.svelte';
	import type { MessageKey } from '../../shared/i18n/da';
	import { tr } from '../../shared/i18n/store';
	import { GROUP_CATEGORY } from '../../shared/design/categories';
	import EntityIcon from '../../shared/design/EntityIcon.svelte';
	import CardHeading from './CardHeading.svelte';

	let { categories, enabledCount, toggleCategory }: Pick<CategoriesModel, 'categories' | 'enabledCount' | 'toggleCategory'> = $props();
</script>

<article class="pk-card">
	<CardHeading title={$tr('cats.title')} badge={`${$enabledCount}/${$categories.length}`} />
	<div class="grid" role="group" aria-label={$tr('cats.aria')}>
		{#each $categories as category (category.id)}
			{@const cat = GROUP_CATEGORY[category.id]}
			<button type="button" class={['chip', category.enabled && 'on']} data-cat={cat} aria-pressed={category.enabled} onclick={() => toggleCategory(category.id)}>
				<EntityIcon name={cat} size={15} />
				{$tr(`group.${category.id}` as MessageKey)}
			</button>
		{/each}
	</div>
</article>

<style>
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px 12px 12px; }
	.chip { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1.5px solid var(--line-2); border-radius: 12px; background: transparent; color: var(--ink-3); font-size: 13px; font-weight: 600; text-align: left; }
	.chip :global(.pk-ic) { color: var(--ink-3); }
	.chip.on :global(.pk-ic) { color: var(--c); }
	.chip.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); color: var(--ink); }
</style>
