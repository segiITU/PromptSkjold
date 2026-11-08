<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { BlocklistEntry, EntityType, Settings } from '../../shared/message-types';
	import { ENTITY_TYPES } from '../../shared/message-types';
	import type { MessageKey } from '../../shared/i18n/da';
	import { intlLocale, tr as tx } from '../../shared/i18n/store';
	import { iconSvg } from '../../shared/design/categories';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		error,
		addEntry,
		removeEntry,
		updateCategory,
		clearError,
	}: {
		settings: Writable<Settings | null>;
		error: Writable<string | null>;
		addEntry: (pattern: string, scope: EntityType) => Promise<boolean>;
		removeEntry: (index: number) => Promise<void>;
		updateCategory: (index: number, scope: EntityType) => Promise<void>;
		clearError: () => void;
	} = $props();

	let inputValue = $state('');
	let category = $state<EntityType>('MISC');
	let entries = $derived($settings?.blocklist ?? []);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const ok = await addEntry(inputValue, category);
		if (ok) {
			inputValue = '';
			category = 'MISC';
		}
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString($intlLocale, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function entryScopeAsCategory(entry: BlocklistEntry): EntityType {
		return entry.scope === 'any' ? 'MISC' : entry.scope;
	}

	const typeLabel = (t: EntityType) => $tx(`entity.${t}` as MessageKey);
</script>

<article class="pk-card" id="blocklist-section">
	<CardHeading title={$tx('block.title')} hint={$tx('block.hint')} />

	<div class="pk-card-body">
		<form class="pk-add" autocomplete="off" onsubmit={handleSubmit}>
			<input
				type="text"
				class="pk-input"
				placeholder={$tx('block.ph')}
				aria-label={$tx('block.aria')}
				aria-invalid={$error !== null}
				bind:value={inputValue}
				oninput={() => clearError()}
			/>
			<select class="pk-select" aria-label={$tx('block.categoryAria')} bind:value={category}>
				{#each ENTITY_TYPES as et (et)}
					<option value={et}>{et === 'MISC' ? $tx('block.default') : typeLabel(et)}</option>
				{/each}
			</select>
			<button type="submit" class="pk-btn pk-btn-ink pk-btn-sm">{$tx('common.add')}</button>
		</form>

		{#if $error}
			<p class="pk-error" role="alert">{$error}</p>
		{/if}

		{#if entries.length === 0}
			<p class="pk-empty-line">{$tx('allow.empty')}</p>
		{:else}
			<div class="pk-table-wrap">
				<table class="pk-table" aria-label={$tx('block.listAria')}>
					<thead>
						<tr>
							<th class="grow">{$tx('tbl.pattern')}</th>
							<th>{$tx('tbl.category')}</th>
							<th>{$tx('tbl.added')}</th>
							<th>{$tx('tbl.source')}</th>
							<th><span class="sr-only">{$tx('common.remove')}</span></th>
						</tr>
					</thead>
					<tbody>
						{#each entries as entry, i (i + ':' + entry.pattern)}
							<tr>
								<td class="mono">{entry.pattern}</td>
								<td>
									<select
										aria-label={$tx('block.catFor', { v: entry.pattern })}
										value={entryScopeAsCategory(entry)}
										onchange={(event) => updateCategory(i, event.currentTarget.value as EntityType)}
									>
										{#each ENTITY_TYPES as et (et)}
											<option value={et}>{typeLabel(et)}</option>
										{/each}
									</select>
								</td>
								<td class="meta">{formatDate(entry.addedAt)}</td>
								<td class="meta">{$tx(`src.${entry.source}` as MessageKey)}</td>
								<td>
									<button type="button" class="pk-x-btn" aria-label={$tx('tbl.remove', { v: entry.pattern })} onclick={() => removeEntry(i)}>{@html iconSvg('x')}</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</article>
