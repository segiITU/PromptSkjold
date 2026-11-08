<script lang="ts">
	import { DEMO, UI, type Lang } from './content';

	let { lang }: { lang: Lang } = $props();
	const parts = $derived(DEMO[lang]);
	const plain = $derived(parts.map((part) => part.t).join(''));
	const replaced = $derived(parts.map((part) => part.ph ?? part.t).join(''));
</script>

<!-- A looping illustration: the message, the found items marked, then the replaced message. -->
<div class="demo" role="img" aria-label={`${UI.demoLabel[lang]}: ${plain} → ${replaced}`}>
	<div class="frame f1">
		<div class="composer"><span>{plain}</span><span class="caret"></span></div>
	</div>

	<div class="frame f2">
		<div class="panel">
			<strong>{UI.demoFound[lang]}</strong>
			<p class="text">
				{#each parts as part, i (i)}{#if part.ph}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}
			</p>
			<span class="btn">{UI.demoButton[lang]}</span>
		</div>
	</div>

	<div class="frame f3">
		<div class="bubble">{replaced}</div>
		<span class="chip"><span class="dot"></span>{UI.demoReplaced[lang]}</span>
	</div>
</div>

<style>
	.demo { position: relative; height: 230px; border-radius: 14px; background: #0f172a; color: #e2e8f0; overflow: hidden; font-size: 14px; }
	.frame { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px; opacity: 0; animation-duration: 10s; animation-iteration-count: infinite; animation-timing-function: linear; }
	.f1 { animation-name: show1; }
	.f2 { animation-name: show2; }
	.f3 { animation-name: show3; }

	.composer { width: min(100%, 520px); padding: 14px 16px; border-radius: 16px; background: #1e293b; line-height: 1.5; }
	.caret { display: inline-block; width: 2px; height: 1.1em; margin-left: 2px; vertical-align: text-bottom; background: #e2e8f0; animation: blink 0.8s steps(1) infinite; }

	.panel { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; width: min(100%, 520px); padding: 14px; border-radius: 12px; background: #f8fafc; color: #0f172a; }
	.text { margin: 0; line-height: 1.6; }
	mark { padding: 1px 4px; border-radius: 4px; background: #e9d5ff; color: #6b21a8; }
	.btn { align-self: flex-end; padding: 6px 12px; border-radius: 8px; background: #2563eb; color: #fff; font-size: 13px; animation: press 10s linear infinite; }

	.bubble { width: min(100%, 520px); box-sizing: border-box; padding: 12px 14px; border-radius: 14px; background: #1e293b; line-height: 1.5; }
	.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #0b3b2e; color: #6ee7b7; font-size: 12px; }
	.dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }

	@keyframes blink { 50% { opacity: 0; } }
	@keyframes show1 { 0%, 29% { opacity: 1; } 33%, 100% { opacity: 0; } }
	@keyframes show2 { 0%, 31% { opacity: 0; } 35%, 61% { opacity: 1; } 65%, 100% { opacity: 0; } }
	@keyframes show3 { 0%, 63% { opacity: 0; } 67%, 95% { opacity: 1; } 99%, 100% { opacity: 0; } }
	@keyframes press { 0%, 52% { transform: scale(1); } 55% { transform: scale(0.92); } 58%, 100% { transform: scale(1); } }

	@media (prefers-reduced-motion: reduce) {
		.frame { animation: none; }
		.f1, .f2 { display: none; }
		.f3 { opacity: 1; }
		.caret, .btn { animation: none; }
	}
</style>
