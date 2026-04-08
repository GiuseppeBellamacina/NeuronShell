<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';
</script>

<div class="glass border border-border-dim p-4">
	<!-- Header -->
	<div class="flex items-center gap-2 mb-4">
		<span class="text-sm">🔗</span>
		<h3 class="font-[Orbitron] text-xs font-bold tracking-widest text-neon-cyan">PIPELINE STATUS</h3>
	</div>

	{#if $monitorData}
		<div class="flex flex-wrap items-center gap-4">
			<!-- Watcher Status -->
			<div class="flex items-center gap-3 border border-border-dim px-4 py-3 bg-bg-deep/50 min-w-48">
				<div class="pulse-dot {$monitorData.watcher.active ? 'pulse-dot-connected' : 'pulse-dot-disconnected'}"></div>
				<div>
					<div class="text-[10px] text-text-muted uppercase tracking-widest">Watcher</div>
					<div class="text-xs {$monitorData.watcher.active ? 'text-neon-green' : 'text-neon-red'}">
						{$monitorData.watcher.active ? 'ACTIVE' : 'INACTIVE'}
					</div>
					{#if $monitorData.watcher.pid}
						<div class="text-[9px] text-text-muted font-mono">PID {$monitorData.watcher.pid}</div>
					{/if}
				</div>
			</div>

			<!-- Chain Queue -->
			<div class="flex items-center gap-3 border border-border-dim px-4 py-3 bg-bg-deep/50 min-w-48">
				<span class="text-2xl text-neon-yellow font-[Orbitron] font-bold">{$monitorData.chainJobs}</span>
				<div>
					<div class="text-[10px] text-text-muted uppercase tracking-widest">Jobs in Queue</div>
					<div class="text-xs text-text-secondary">
						{#if $monitorData.chainJobs > 0}
							Pipeline pending
						{:else}
							Queue empty
						{/if}
					</div>
				</div>
			</div>

			<!-- Active Jobs Summary -->
			<div class="flex items-center gap-3 border border-border-dim px-4 py-3 bg-bg-deep/50 min-w-48">
				<span class="text-2xl text-neon-cyan font-[Orbitron] font-bold">{$monitorData.jobs.filter(j => j.state === 'RUNNING').length}</span>
				<div>
					<div class="text-[10px] text-text-muted uppercase tracking-widest">Running</div>
					<div class="text-xs text-text-secondary">
						{$monitorData.jobs.filter(j => j.state === 'PENDING').length} pending
					</div>
				</div>
			</div>

			<!-- GPU Count -->
			<div class="flex items-center gap-3 border border-border-dim px-4 py-3 bg-bg-deep/50 min-w-48">
				<span class="text-2xl text-neon-magenta font-[Orbitron] font-bold">{$monitorData.gpus.length}</span>
				<div>
					<div class="text-[10px] text-text-muted uppercase tracking-widest">GPUs</div>
					<div class="text-xs text-text-secondary">
						{#if $monitorData.gpus.length > 0}
							{@const avgUtil = Math.round($monitorData.gpus.reduce((a, g) => a + g.utilization, 0) / $monitorData.gpus.length)}
							Avg util: {avgUtil}%
						{:else}
							Not allocated
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="text-text-muted text-xs text-center py-6 animate-pulse">
			Waiting for data...
		</div>
	{/if}
</div>
