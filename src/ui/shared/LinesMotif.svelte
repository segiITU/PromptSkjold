<script lang="ts">
  /** The logo's lines-and-bar motif. See src/shared/styles/motif.css. */
  let { state = 'scan', small = false }: { state?: 'scan' | 'empty' | 'done'; small?: boolean } = $props();
</script>

<div class={['pk-lines', small && 'sm']} data-state={state} aria-hidden="true">
  <i></i><i></i><b></b><i></i><i></i>
</div>
