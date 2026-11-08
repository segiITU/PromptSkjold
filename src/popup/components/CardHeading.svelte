<script lang="ts">
	let { title, badge, hint }: { eyebrow?: string; title: string; badge?: string | number; hint?: string; badgeClass?: string; compact?: boolean } = $props();
</script>

<div class="pk-card-head">
	<h3>{title}</h3>
	{#if badge !== undefined}
		<span class="pk-fine">{badge}</span>
	{:else if hint}
		<span class="pk-fine">{hint}</span>
	{/if}
</div>
