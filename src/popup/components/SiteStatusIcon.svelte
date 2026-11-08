<script lang="ts">
	import type { UserSiteState } from '../../shared/user-sites';
	import { tr } from '../../shared/i18n/store';

	let { state }: { state: UserSiteState } = $props();
</script>

{#if state === 'pending'}
	<span class="icon spinner" role="img" aria-label={`… ${$tr('site.wait')}`}></span>
{:else if state === 'active'}
	<span class="icon ok" role="img" aria-label={`OK, ${$tr('site.ok')}`}>✓</span>
{:else}
	<span class="icon bad" role="img" aria-label={`× ${$tr('site.bad')}`}>✕</span>
{/if}

<style>
	.icon { display: inline-grid; place-items: center; width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; font-size: 12px; font-weight: 700; line-height: 1; }
	.ok { background: var(--teal-deep); color: #fff; }
	.bad { background: var(--danger); color: #fff; }
	.spinner { border: 2px solid var(--line-2); border-top-color: var(--ink-3); box-sizing: border-box; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
</style>
