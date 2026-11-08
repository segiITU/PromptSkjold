<script lang="ts">
	import type { CategoriesModel } from '../popup-model.svelte';
	import type { MessageKey } from '../../shared/i18n/da';
	import { tr } from '../../shared/i18n/store';
	import { GROUP_CATEGORY } from '../../shared/design/categories';
	import EntityIcon from '../../shared/design/EntityIcon.svelte';
	import CardHeading from './CardHeading.svelte';
	import Toggle from './Toggle.svelte';

	let { categories, setCategoryEnabled }: Pick<CategoriesModel, 'categories' | 'enabledCount' | 'setCategoryEnabled'> = $props();
</script>

<article class="pk-card">
	<CardHeading title={$tr('rules.title')} hint={$tr('rules.hint')} />
	<ul>
		{#each $categories as category (category.id)}
			{@const cat = GROUP_CATEGORY[category.id]}
			{@const name = $tr(`group.${category.id}` as MessageKey)}
			<li class={['row', !category.enabled && 'off']} data-cat={cat}>
				<EntityIcon name={cat} />
				<span class="tx">
					<b>{name}</b>
					<span>{$tr(`group.desc.${category.id}` as MessageKey)}</span>
				</span>
				<Toggle size="sm" checked={category.enabled} label={$tr('rules.toggle', { name })} onchange={(checked) => setCategoryEnabled(category.id, checked)} />
			</li>
		{/each}
	</ul>
</article>

<style>
	.row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--line); }
	.row:first-child { border-top: 0; }
	.tx { flex: 1; display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
	.tx b { font-weight: 600; }
	.tx span { font-size: 12.5px; color: var(--ink-3); }
	.row.off .tx { opacity: 0.6; }
</style>
