<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		onchange,
		size = 'md'
	}: { checked?: boolean; label: string; onchange?: (checked: boolean) => void; size?: 'md' | 'sm' | 'lg' } = $props();

	function toggle() {
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	class={['pk-switch', size !== 'md' && size]}
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	onclick={toggle}
>
	<span></span>
</button>
