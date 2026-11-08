<script lang="ts">
	import { UI, type Lang } from './content';

	let { lang }: { lang: Lang } = $props();
	const host = 'chat.dk';
</script>

<!-- A looping illustration: type a site, press add, watch the spinner turn into a green check. -->
<div class="demo" role="img" aria-label={`${host}: ${UI.demoActive[lang]}`}>
	<div class="add">
		<span class="field"><span class="typed">{host}</span><span class="caret"></span></span>
		<span class="btn">{UI.demoAddButton[lang]}</span>
	</div>
	<div class="row">
		<span class="state"><span class="spinner"></span><span class="check">✓</span></span>
		<strong>{host}</strong>
		<span class="note"><span class="pending">…</span><span class="ok">{UI.demoActive[lang]}</span></span>
	</div>
</div>

<style>
	.demo { height: 150px; border-radius: 14px; background: #0f172a; color: #e2e8f0; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 16px 20px; font-size: 14px; }
	.add { display: flex; gap: 8px; }
	.field { flex: 1; display: flex; align-items: center; padding: 9px 12px; border-radius: 8px; background: #1e293b; font-family: var(--f-mono); }
	.typed { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation: type 7s steps(7) infinite; }
	.caret { width: 2px; height: 1.1em; margin-left: 2px; background: #e2e8f0; animation: blink 0.8s steps(1) infinite; }
	.btn { padding: 9px 14px; border-radius: 8px; background: #2563eb; color: #fff; animation: press 7s linear infinite; }

	.row { display: flex; align-items: center; gap: 10px; opacity: 0; animation: appear 7s linear infinite; }
	.state { position: relative; width: 18px; height: 18px; flex-shrink: 0; }
	.spinner, .check { position: absolute; inset: 0; }
	.spinner { border: 2px solid rgb(148 163 184 / 35%); border-top-color: #94a3b8; border-radius: 50%; box-sizing: border-box; animation: spin 0.8s linear infinite, spinner-life 7s linear infinite; }
	.check { display: grid; place-items: center; border-radius: 50%; background: #16a34a; color: #fff; font-size: 12px; font-weight: 700; opacity: 0; animation: check-life 7s linear infinite; }
	.note { position: relative; color: #94a3b8; font-size: 12px; }
	.pending { animation: spinner-life 7s linear infinite; }
	.ok { position: absolute; left: 0; white-space: nowrap; color: #6ee7b7; opacity: 0; animation: check-life 7s linear infinite; }

	@keyframes type { 0% { width: 0; } 20%, 100% { width: 7ch; } }
	@keyframes blink { 50% { opacity: 0; } }
	@keyframes press { 0%, 24% { transform: scale(1); } 27% { transform: scale(0.92); } 30%, 100% { transform: scale(1); } }
	@keyframes appear { 0%, 28% { opacity: 0; } 32%, 94% { opacity: 1; } 98%, 100% { opacity: 0; } }
	@keyframes spin { to { transform: rotate(360deg); } }
	@keyframes spinner-life { 0%, 60% { opacity: 1; } 64%, 100% { opacity: 0; } }
	@keyframes check-life { 0%, 60% { opacity: 0; } 64%, 100% { opacity: 1; } }

	@media (prefers-reduced-motion: reduce) {
		.typed { animation: none; width: 7ch; }
		.caret, .btn, .spinner { animation: none; }
		.row { animation: none; opacity: 1; }
		.spinner, .pending { opacity: 0; animation: none; }
		.check, .ok { animation: none; opacity: 1; }
	}
</style>
