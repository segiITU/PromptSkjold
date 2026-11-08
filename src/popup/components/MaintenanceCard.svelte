<script lang="ts">
	import { tr } from '../../shared/i18n/store';

	let { restoreDefaults, clearMappings }: { restoreDefaults: () => void; clearMappings: () => void } = $props();
</script>

<div class="maint">
	<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={restoreDefaults}>{$tr('maint.restore')}</button>
	<button type="button" class="pk-btn pk-btn-outline pk-btn-sm" onclick={clearMappings}>{$tr('maint.clearMappings')}</button>
</div>

<style>
	.maint { display: flex; gap: 8px; }
	.maint button { flex: 1; }
</style>
