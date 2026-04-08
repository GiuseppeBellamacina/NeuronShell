<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';

	let expanded = $state(false);
</script>

{#if $monitorData?.lastCompletion}
	{@const lc = $monitorData.lastCompletion}
	<div class="glass p-4 space-y-3">
		<!-- Header -->
		<div class="flex items-center gap-2">
			<span class="text-sm">💬</span>
			<h3 class="text-xs font-semibold text-text-primary">Last Completion</h3>
			<span class="text-[9px] px-1.5 py-0.5 rounded border border-accent/30 text-accent bg-accent/10 uppercase tracking-wider">
				{lc.difficulty}
			</span>
			<span class="ml-auto text-[10px] font-mono font-semibold {lc.total >= 0.8 ? 'text-green' : lc.total >= 0.5 ? 'text-yellow' : 'text-red'}">
				{lc.total >= 0 ? '+' : ''}{lc.total.toFixed(4)}
			</span>
		</div>

		<!-- Reward breakdown -->
		<div class="flex flex-wrap gap-1.5">
			{#each Object.entries(lc.rewards) as [key, val]}
				{@const positive = val >= 0}
				<div class="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono
					{positive ? 'border-green/20 bg-green/5 text-green' : 'border-red/20 bg-red/5 text-red'}">
					<span class="text-text-muted">{key}</span>
					<span>{positive ? '+' : ''}{val.toFixed(2)}</span>
				</div>
			{/each}
		</div>

		<!-- Prompt (collapsible) -->
		{#if lc.prompt}
			<div>
				<button
					onclick={() => expanded = !expanded}
					class="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer mb-1"
				>
					<span class="transition-transform {expanded ? 'rotate-90' : ''}">▶</span>
					<span>Prompt</span>
				</button>
				{#if expanded}
					<div class="text-[10px] text-text-secondary bg-bg-deep/50 border border-border-dim rounded-lg p-3 max-h-32 overflow-auto leading-relaxed">
						{lc.prompt}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Completion -->
		{#if lc.completion}
			<div>
				<div class="text-[10px] text-text-muted mb-1">Output</div>
				<pre class="text-[10px] text-text-primary bg-bg-deep/50 border border-border-dim rounded-lg p-3 max-h-48 overflow-auto font-mono whitespace-pre-wrap leading-relaxed">{lc.completion}</pre>
			</div>
		{/if}

		<!-- Schema info -->
		{#if Object.keys(lc.schema).length > 0}
			<div>
				<div class="text-[10px] text-text-muted mb-1">Schema</div>
				<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-mono">
					{#each Object.entries(lc.schema) as [key, val]}
						<span>
							<span class="text-text-muted">{key}:</span>
							<span class="text-text-secondary">{val}</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
