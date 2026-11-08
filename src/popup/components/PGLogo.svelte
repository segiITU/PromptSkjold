<script lang="ts">
	/** The PromptSkjold mark. `gradId` is accepted for backwards compatibility and ignored. */
	let { size = 26 }: { size?: number; gradId?: string } = $props();
</script>

<img src="/assets/logo.png" width={size} height={size} alt="" style="display:block;border-radius:{Math.round(size * 0.22)}px" />
