<script lang="ts">
	import { commandOutput } from '$lib/stores/ssh';

	let container: HTMLDivElement;
	let autoScroll = $state(true);

	$effect(() => {
		if ($commandOutput.length && autoScroll && container) {
			container.scrollTop = container.scrollHeight;
		}
	});
</script>

<div
	bind:this={container}
	class="h-full overflow-y-auto bg-bg-void p-3 font-mono text-xs"
	onscroll={() => {
		if (container) {
			autoScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;
		}
	}}
>
	{#if $commandOutput.length === 0}
		<div class="text-text-muted text-center py-4 text-[10px] uppercase tracking-widest">
			Command output will appear here
		</div>
	{:else}
		{#each $commandOutput as entry}
			<div class="mb-3 border-b border-border-dim/30 pb-2">
				<div class="flex items-center gap-2 mb-1">
					<span class="text-neon-cyan text-[10px]">❯</span>
					<span class="text-neon-cyan text-[11px] font-semibold">{entry.command}</span>
					<span class="text-text-muted text-[9px] ml-auto">{new Date(entry.timestamp).toLocaleTimeString()}</span>
				</div>
				{#if entry.output}
					<pre class="text-text-primary whitespace-pre-wrap break-all leading-relaxed pl-4">{entry.output}</pre>
				{/if}
				{#if entry.error}
					<pre class="text-neon-red whitespace-pre-wrap break-all leading-relaxed pl-4">{entry.error}</pre>
				{/if}
			</div>
		{/each}
	{/if}
</div>
