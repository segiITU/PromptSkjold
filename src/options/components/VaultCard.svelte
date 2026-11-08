<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { ReplacementModeSetting, Settings } from '../../shared/message-types';
	import type { IdentityRecord } from '../../shared/identity-vault';
	import type { MessageKey } from '../../shared/i18n/da';
	import { supportsSynthetic } from '../../shared/synthetic-pool';
	import { intlLocale, tr as tx } from '../../shared/i18n/store';
	import { iconSvg } from '../../shared/design/categories';
	import CardHeading from '../../popup/components/CardHeading.svelte';
	import Segmented from '../../popup/components/Segmented.svelte';
	import Toggle from '../../popup/components/Toggle.svelte';

	let {
		settings,
		records,
		setVaultEnabled,
		setDefaultReplacementMode,
		updateRecord,
		deleteRecord,
		exportVault,
		importVault,
		clearUnpinned,
	}: {
		settings: Writable<Settings | null>;
		records: Writable<IdentityRecord[]>;
		setVaultEnabled: (enabled: boolean) => Promise<void>;
		setDefaultReplacementMode: (mode: ReplacementModeSetting) => Promise<void>;
		updateRecord: (
			id: string,
			patch: Partial<Pick<IdentityRecord, 'replacementMode' | 'syntheticValue' | 'pinned' | 'notes' | 'entityType'>>,
		) => Promise<void>;
		deleteRecord: (id: string) => Promise<void>;
		exportVault: () => void;
		importVault: (file: File) => Promise<{ imported: number } | { error: string }>;
		clearUnpinned: () => Promise<number>;
	} = $props();

	let vaultEnabled = $derived($settings?.identityVaultEnabled ?? true);
	let defaultMode = $derived<ReplacementModeSetting>($settings?.defaultReplacementMode ?? 'placeholder');
	let fileInput: HTMLInputElement | null = $state(null);
	let unpinnedCount = $derived($records.filter((r) => !r.pinned).length);
	let confirming = $state(false);
	let status = $state<{ tone: 'ok' | 'bad'; text: string } | null>(null);

	function formatRelative(ts: number): string {
		const diff = Date.now() - ts;
		if (diff < 60_000) return $tx('rel.now');
		if (diff < 3_600_000) return $tx('rel.min', { n: Math.floor(diff / 60_000) });
		if (diff < 86_400_000) return $tx('rel.hour', { n: Math.floor(diff / 3_600_000) });
		const days = Math.floor(diff / 86_400_000);
		if (days < 30) return $tx('rel.day', { n: days });
		return new Date(ts).toLocaleDateString($intlLocale, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	async function onSyntheticChange(record: IdentityRecord, value: string) {
		const trimmed = value.trim();
		if (!trimmed) {
			await updateRecord(record.id, { replacementMode: 'placeholder', syntheticValue: '' });
		} else {
			await updateRecord(record.id, { syntheticValue: trimmed });
		}
	}

	async function onModeChange(record: IdentityRecord, mode: ReplacementModeSetting) {
		await updateRecord(record.id, { replacementMode: mode });
	}

	async function onImportChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		const result = await importVault(file);
		target.value = '';
		status = 'error' in result ? { tone: 'bad', text: result.error } : { tone: 'ok', text: $tx('vlt.imported', { n: result.imported }) };
	}

	function onClearUnpinned() {
		status = null;
		if (unpinnedCount === 0) {
			status = { tone: 'ok', text: $tx('vlt.nothingToClear') };
			return;
		}
		confirming = true;
	}

	async function confirmClear() {
		confirming = false;
		await clearUnpinned();
	}
</script>

<article class="pk-card" id="vault-section">
	<CardHeading title={$tx('vlt.title')} hint={$tx('vlt.hint')} />

	<div class="pk-card-body">
		<p class="pk-fine">{$tx('vlt.intro')}</p>

		<div class="controls">
			<div class="line">
				<span class="pk-label">{$tx('vlt.enable')}</span>
				<Toggle size="sm" checked={vaultEnabled} label={$tx('vlt.enable')} onchange={(checked) => setVaultEnabled(checked)} />
			</div>
			<div class="line">
				<span class="pk-label">{$tx('vlt.defaultMode')}</span>
				<Segmented
					ariaLabel={$tx('vlt.modeAria')}
					value={defaultMode}
					options={[{ value: 'placeholder', label: $tx('vault.placeholder') }, { value: 'synthetic', label: $tx('vault.synthetic') }]}
					onchange={(mode) => setDefaultReplacementMode(mode)}
				/>
			</div>
		</div>

		{#if $records.length === 0}
			<p class="pk-empty-line">{$tx('vlt.empty')}</p>
		{:else}
			<div class="pk-table-wrap">
				<table class="pk-table vault" aria-label={$tx('vlt.tableAria')}>
					<thead>
						<tr>
							<th>{$tx('vlt.original')}</th>
							<th>{$tx('vlt.type')}</th>
							<th>{$tx('vlt.replacement')}</th>
							<th>{$tx('vlt.mode')}</th>
							<th>{$tx('vlt.used')}</th>
							<th>{$tx('vlt.pin')}</th>
							<th><span class="sr-only">{$tx('common.remove')}</span></th>
						</tr>
					</thead>
					<tbody>
						{#each $records as record (record.id)}
							{@const modeDisabled = !supportsSynthetic(record.entityType) || !record.syntheticValue}
							<tr>
								<td class="mono clip" title={record.originalText}>{record.originalText}</td>
								<td class="meta">{$tx(`entity.${record.entityType}` as MessageKey)}</td>
								<td class="mono clip">
									{#if record.replacementMode === 'synthetic' && record.syntheticValue}
										<input
											type="text"
											value={record.syntheticValue}
											aria-label={$tx('vlt.syntheticFor', { v: record.originalText })}
											onchange={(event) => onSyntheticChange(record, event.currentTarget.value)}
										/>
									{:else}
										<span class="pk-ph">{record.placeholder}</span>
									{/if}
								</td>
								<td>
									<select
										aria-label={$tx('vlt.modeFor', { v: record.originalText })}
										value={modeDisabled ? 'placeholder' : record.replacementMode}
										disabled={modeDisabled}
										title={modeDisabled ? $tx('vlt.noSynthetic') : undefined}
										onchange={(event) => onModeChange(record, event.currentTarget.value as ReplacementModeSetting)}
									>
										<option value="placeholder">{$tx('vault.placeholder')}</option>
										<option value="synthetic">{$tx('vault.synthetic')}</option>
									</select>
								</td>
								<td class="meta">{record.usageCount}× · {formatRelative(record.lastSeenAt)}</td>
								<td>
									<button
										type="button"
										class={['pk-x-btn', 'pin', record.pinned && 'on']}
										aria-pressed={record.pinned}
										title={record.pinned ? $tx('vlt.pinned') : $tx('vlt.pinRecord')}
										aria-label={record.pinned ? $tx('vlt.unpinRecord') : $tx('vlt.pinRecord')}
										onclick={() => updateRecord(record.id, { pinned: !record.pinned })}
									>{@html iconSvg('shield')}</button>
								</td>
								<td>
									<button type="button" class="pk-x-btn" aria-label={$tx('tbl.remove', { v: record.originalText })} onclick={() => deleteRecord(record.id)}>{@html iconSvg('x')}</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="bulk">
			<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={exportVault}>{$tx('vlt.export')}</button>
			<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={() => fileInput?.click()}>{$tx('vlt.import')}</button>
			<input type="file" accept="application/json" hidden bind:this={fileInput} onchange={onImportChange} />
			{#if confirming}
				<span class="confirm" role="alertdialog" aria-label={$tx('vlt.confirmClear', { n: unpinnedCount })}>
					<span class="pk-small">{$tx('vlt.confirmClear', { n: unpinnedCount })}</span>
					<button type="button" class="pk-btn pk-btn-danger pk-btn-sm" onclick={confirmClear}>{$tx('vlt.confirmYes')}</button>
					<button type="button" class="pk-btn pk-btn-quiet pk-btn-sm" onclick={() => (confirming = false)}>{$tx('common.cancel')}</button>
				</span>
			{:else}
				<button type="button" class="pk-btn pk-btn-danger pk-btn-sm" onclick={onClearUnpinned}>{$tx('vlt.clear')}</button>
			{/if}
		</div>
		{#if status}
			<p class={status.tone === 'bad' ? 'pk-error' : 'pk-fine'} role="status">{status.text}</p>
		{/if}
	</div>
</article>

<style>
	.controls { display: grid; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); }
	.line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.vault { min-width: 780px; }
	.vault .clip { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.vault td:nth-child(1) { max-width: 200px; }
	.pin.on { color: var(--teal-ink); background: var(--teal-wash); }
	.bulk { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.confirm { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line-2); border-radius: var(--r-sm); background: var(--danger-wash); }
</style>
