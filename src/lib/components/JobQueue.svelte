<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';

	function stateColor(state: string): string {
		switch (state?.toUpperCase()) {
			case 'RUNNING': return 'text-neon-green bg-neon-green/10 border-neon-green/30';
			case 'PENDING': return 'text-neon-yellow bg-neon-yellow/10 border-neon-yellow/30';
			case 'COMPLETING': return 'text-neon-cyan bg-neon-cyan/10 border-neon-cyan/30';
			case 'FAILED': return 'text-neon-red bg-neon-red/10 border-neon-red/30';
			case 'CANCELLED': return 'text-neon-orange bg-neon-orange/10 border-neon-orange/30';
			default: return 'text-text-muted bg-bg-surface border-border-dim';
		}
	}
</script>

<div class="glass border border-border-dim p-4">
	<!-- Header -->
	<div class="flex items-center gap-2 mb-4">
		<span class="text-sm">📡</span>
		<h3 class="font-[Orbitron] text-xs font-bold tracking-widest text-neon-cyan">JOB QUEUE</h3>
		{#if $monitorData?.jobs}
			<span class="text-[10px] text-text-muted ml-auto">
				{$monitorData.jobs.length} job{$monitorData.jobs.length !== 1 ? 's' : ''}
			</span>
		{/if}
	</div>

	{#if $monitorData && $monitorData.jobs.length > 0}
		<div class="overflow-x-auto">
			<table class="w-full text-[11px]">
				<thead>
					<tr class="text-text-muted uppercase tracking-wider border-b border-border-dim">
						<th class="text-left py-2 px-2">ID</th>
						<th class="text-left py-2 px-2">Name</th>
						<th class="text-left py-2 px-2">State</th>
						<th class="text-left py-2 px-2">Time</th>
						<th class="text-left py-2 px-2">Node</th>
						<th class="text-left py-2 px-2">GPU</th>
					</tr>
				</thead>
				<tbody>
					{#each $monitorData.jobs as job}
						<tr class="border-b border-border-dim/30 hover:bg-bg-elevated/30 transition-colors">
							<td class="py-1.5 px-2 text-neon-cyan font-mono">{job.id}</td>
							<td class="py-1.5 px-2 text-text-primary truncate max-w-32">{job.name}</td>
							<td class="py-1.5 px-2">
								<span class="px-1.5 py-0.5 border text-[9px] uppercase tracking-wider {stateColor(job.state)}">
									{job.state}
								</span>
							</td>
							<td class="py-1.5 px-2 text-text-secondary font-mono">{job.time}</td>
							<td class="py-1.5 px-2 text-text-secondary">{job.reason}</td>
							<td class="py-1.5 px-2 text-text-secondary">{job.gpu}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if $monitorData && $monitorData.jobs.length === 0}
		<div class="text-text-muted text-xs text-center py-6">
			No active jobs
		</div>
	{:else}
		<div class="text-text-muted text-xs text-center py-6 animate-pulse">
			Waiting for data...
		</div>
	{/if}
</div>
