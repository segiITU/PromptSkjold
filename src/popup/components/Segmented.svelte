<script lang="ts" generics="T extends string">
	type Option = { value: T; label: string };
	let {
		options,
		value,
		onchange,
		ariaLabel,
	}: {
		options: Option[];
		value: T;
		onchange: (next: T) => void;
		ariaLabel?: string;
	} = $props();
</script>

<div class="pk-seg-group sm" role="radiogroup" aria-label={ariaLabel}>
	{#each options as option (option.value)}
		<button type="button" role="radio" aria-checked={value === option.value} onclick={() => onchange(option.value)}>
			{option.label}
		</button>
	{/each}
</div>
