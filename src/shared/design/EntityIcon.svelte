<script lang="ts">
	import { iconSvg, type Category, type IconName } from './categories';

	/** One decorative icon (aria-hidden). Takes the colour of the category it sits in (`--c`) or the text colour. */
	let { name, size = 16 }: { name: Category | IconName; size?: number } = $props();
</script>

<span class="pk-ic" style="width:{size}px;height:{size}px" aria-hidden="true">{@html iconSvg(name)}</span>
