<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';
</script>

<div class="glass p-4 space-y-4">
	<!-- Header row: pipeline progress + watcher -->
	<div class="flex items-center gap-3">
		<span class="text-sm">🔗</span>
		<h3 class="text-xs font-semibold text-text-primary">Pipeline</h3>
		{#if $monitorData}
			<span class="text-[10px] text-text-muted ml-auto font-mono">
				{$monitorData.pipeline.done}/{$monitorData.pipeline.total}
			</span>
		{/if}
	</div>

	{#if $monitorData}
		<!-- Pipeline bar -->
		{#if $monitorData.pipeline.total > 0}
			<div>
				<div class="flex items-center justify-between mb-1">
					<span class="text-[10px] text-text-muted">
						Progress
					</span>
					<span class="text-[10px] text-text-secondary font-mono">
						{Math.round($monitorData.pipeline.done / $monitorData.pipeline.total * 100)}%
					</span>
				</div>
				<div class="w-full h-2 bg-bg-surface rounded-full overflow-hidden">
					<div
						class="h-full bg-accent rounded-full transition-all duration-700"
						style="width: {$monitorData.pipeline.done / $monitorData.pipeline.total * 100}%"
					></div>
				</div>
			</div>
		{/if}

		<!-- Summary cards -->
		<div class="grid grid-cols-3 gap-2">
			<!-- Watcher -->
			<div class="flex items-center gap-2 border border-border-dim rounded-lg px-3 py-2 bg-bg-deep/50">
				<div class="pulse-dot {$monitorData.watcher.active ? 'pulse-dot-connected' : 'pulse-dot-disconnected'}"></div>
				<div>
					<div class="text-[9px] text-text-muted">Watcher</div>
					<div class="text-[11px] {$monitorData.watcher.active ? 'text-green' : 'text-red'}">
						{$monitorData.watcher.active ? 'ON' : 'OFF'}
					</div>
					{#if $monitorData.watcher.pid}
						<div class="text-[8px] text-text-muted font-mono">PID {$monitorData.watcher.pid}</div>
					{/if}
				</div>
			</div>

			<!-- Running -->
			<div class="flex items-center gap-2 border border-border-dim rounded-lg px-3 py-2 bg-bg-deep/50">
				<span class="text-xl text-green font-semibold font-mono">{$monitorData.jobs.filter(j => j.state === 'RUNNING').length}</span>
				<div>
					<div class="text-[9px] text-text-muted">Running</div>
					<div class="text-[10px] text-text-secondary">{$monitorData.jobs.filter(j => j.state === 'PENDING').length} pending</div>
				</div>
			</div>

			<!-- Completed -->
			<div class="flex items-center gap-2 border border-border-dim rounded-lg px-3 py-2 bg-bg-deep/50">
				<span class="text-xl text-accent font-semibold font-mono">{$monitorData.jobs.filter(j => j.state === 'COMPLETED').length}</span>
				<div>
					<div class="text-[9px] text-text-muted">Completed</div>
				</div>
			</div>
		</div>

		<!-- Active Job -->
		{#if $monitorData.activeJob}
			{@const aj = $monitorData.activeJob}
			<div class="border border-green/20 rounded-lg px-4 py-3 bg-green/5">
				<div class="flex items-center gap-2 mb-2">
					<span class="text-green text-xs animate-pulse">▶</span>
					<span class="text-xs font-medium text-text-primary font-mono">{aj.name}</span>
					<span class="text-[10px] text-text-muted font-mono">[{aj.id}]</span>
					<span class="text-[10px] text-text-muted ml-auto font-mono">step {aj.step.toLocaleString()}/{aj.totalSteps.toLocaleString()}</span>
				</div>
				<div class="w-full h-2.5 bg-bg-surface rounded-full overflow-hidden">
					<div
						class="h-full bg-green rounded-full transition-all duration-1000"
						style="width: {aj.percent}%"
					></div>
				</div>
				<div class="flex justify-between mt-1.5 text-[10px] text-text-muted font-mono">
					<span class="text-green">{aj.percent}%</span>
					<span>
						{#if aj.elapsed}⏰ {aj.elapsed}{/if}
						{#if aj.eta} ⏳ ~{aj.eta}{/if}
					</span>
				</div>
			</div>
		{/if}

		<!-- Results table -->
		{#if $monitorData.results.length > 0}
			<div>
				<div class="text-[10px] text-text-muted uppercase tracking-wider mb-2">Evaluation Results</div>
				<div class="overflow-x-auto">
					<table class="w-full text-[11px]">
						<thead>
							<tr class="text-text-muted border-b border-border-dim text-[10px]">
								<th class="text-left py-1.5 px-2">Model</th>
								<th class="text-right py-1.5 px-2">Reward</th>
								<th class="text-right py-1.5 px-2">Baseline</th>
								<th class="text-right py-1.5 px-2">Stage 1</th>
								<th class="text-right py-1.5 px-2">Δ</th>
							</tr>
						</thead>
						<tbody>
							{#each $monitorData.results as r}
								{@const delta = r.reward !== null && r.baseline !== null ? r.reward - r.baseline : null}
								<tr class="border-b border-border-dim/20 hover:bg-bg-elevated/20 transition-colors">
									<td class="py-1.5 px-2 text-text-primary font-mono">{r.model}</td>
									<td class="py-1.5 px-2 text-right font-mono {r.reward !== null ? 'text-accent' : 'text-text-muted'}">
										{r.reward !== null ? r.reward.toFixed(4) : '—'}
									</td>
									<td class="py-1.5 px-2 text-right font-mono {r.baseline !== null ? 'text-text-secondary' : 'text-text-muted'}">
										{r.baseline !== null ? r.baseline.toFixed(4) : '—'}
									</td>
									<td class="py-1.5 px-2 text-right font-mono {r.stage1 !== null ? 'text-green' : 'text-text-muted'}">
										{r.stage1 !== null ? r.stage1.toFixed(4) : '—'}
									</td>
									<td class="py-1.5 px-2 text-right font-mono text-[10px] {delta !== null ? (delta > 0 ? 'text-green' : delta < 0 ? 'text-red' : 'text-text-muted') : 'text-text-muted'}">
										{delta !== null ? (delta > 0 ? '+' : '') + delta.toFixed(4) : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{:else}
		<div class="text-text-muted text-xs text-center py-6 animate-pulse">
			Waiting for data...
		</div>
	{/if}
</div>
