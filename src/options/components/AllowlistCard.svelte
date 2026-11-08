<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { AllowlistEntry, Settings } from '../../shared/message-types';
	import type { MessageKey } from '../../shared/i18n/da';
	import { intlLocale, tr as tx } from '../../shared/i18n/store';
	import { iconSvg } from '../../shared/design/categories';
	import CardHeading from '../../popup/components/CardHeading.svelte';

	let {
		settings,
		error,
		addEntry,
		removeEntry,
		clearError,
	}: {
		settings: Writable<Settings | null>;
		error: Writable<string | null>;
		addEntry: (pattern: string) => Promise<boolean>;
		removeEntry: (index: number) => Promise<void>;
		clearError: () => void;
	} = $props();

	let inputValue = $state('');
	let inputEl: HTMLInputElement | null = $state(null);
	let entries = $derived($settings?.allowlist ?? []);

	export function prefill(value: string): void {
		inputValue = value;
		inputEl?.focus();
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const ok = await addEntry(inputValue);
		if (ok) inputValue = '';
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString($intlLocale, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<article class="pk-card" id="allowlist-section">
	<CardHeading title={$tx('allow.title')} hint={$tx('allow.hint')} />

	<div class="pk-card-body">
		<form class="pk-add" autocomplete="off" onsubmit={handleSubmit}>
			<input
				type="text"
				class="pk-input"
				placeholder={$tx('allow.ph')}
				aria-label={$tx('allow.aria')}
				aria-invalid={$error !== null}
				bind:value={inputValue}
				bind:this={inputEl}
				oninput={() => clearError()}
			/>
			<button type="submit" class="pk-btn pk-btn-ink pk-btn-sm">{$tx('common.add')}</button>
		</form>

		{#if $error}
			<p class="pk-error" role="alert">{$error}</p>
		{/if}

		{#if entries.length === 0}
			<p class="pk-empty-line">{$tx('allow.empty')}</p>
		{:else}
			<div class="pk-table-wrap">
				<table class="pk-table" aria-label={$tx('allow.listAria')}>
					<thead>
						<tr>
							<th class="grow">{$tx('tbl.pattern')}</th>
							<th>{$tx('tbl.added')}</th>
							<th>{$tx('tbl.source')}</th>
							<th><span class="sr-only">{$tx('common.remove')}</span></th>
						</tr>
					</thead>
					<tbody>
						{#each entries as entry, i (i + ':' + entry.pattern)}
							<tr>
								<td class="mono">{entry.pattern}</td>
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
