<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';

	function getUtilColor(val: number): string {
		if (val > 80) return 'bg-neon-red';
		if (val > 50) return 'bg-neon-yellow';
		return 'bg-neon-green';
	}

	function getTempColor(val: number): string {
		if (val > 85) return 'text-neon-red';
		if (val > 70) return 'text-neon-yellow';
		return 'text-neon-green';
	}
</script>

<div class="glass border border-border-dim p-4">
	<!-- Header -->
	<div class="flex items-center gap-2 mb-4">
		<span class="text-sm">🎮</span>
		<h3 class="font-[Orbitron] text-xs font-bold tracking-widest text-neon-cyan">GPU MONITOR</h3>
		{#if $monitorData}
			<span class="text-[9px] text-text-muted ml-auto">
				{new Date($monitorData.timestamp).toLocaleTimeString()}
			</span>
		{/if}
	</div>

	{#if $monitorData && $monitorData.gpus.length > 0}
		<div class="space-y-4">
			{#each $monitorData.gpus as gpu}
				<div class="border border-border-dim/50 p-3 bg-bg-deep/50">
					<div class="flex items-center justify-between mb-3">
						<span class="text-xs text-text-primary">GPU {gpu.index}: {gpu.name}</span>
						<span class="{getTempColor(gpu.temp)} text-xs font-mono">{gpu.temp}°C</span>
					</div>

					<!-- GPU Utilization -->
					<div class="mb-2">
						<div class="flex justify-between text-[10px] text-text-secondary mb-1">
							<span>UTILIZATION</span>
							<span class="text-text-primary">{gpu.utilization}%</span>
						</div>
						<div class="h-2 bg-bg-void rounded-sm overflow-hidden">
							<div
								class="{getUtilColor(gpu.utilization)} h-full transition-all duration-500"
								style="width: {gpu.utilization}%"
							></div>
						</div>
					</div>

					<!-- VRAM -->
					<div class="mb-2">
						<div class="flex justify-between text-[10px] text-text-secondary mb-1">
							<span>VRAM</span>
							<span class="text-text-primary">{gpu.memUsed} / {gpu.memTotal} MB</span>
						</div>
						<div class="h-2 bg-bg-void rounded-sm overflow-hidden">
							<div
								class="{getUtilColor(gpu.memTotal > 0 ? (gpu.memUsed / gpu.memTotal) * 100 : 0)} h-full transition-all duration-500"
								style="width: {gpu.memTotal > 0 ? (gpu.memUsed / gpu.memTotal) * 100 : 0}%"
							></div>
						</div>
					</div>

					<!-- Power -->
					<div class="text-[10px] text-text-muted">
						Power: <span class="text-text-secondary">{gpu.power}W</span>
					</div>
				</div>
			{/each}
		</div>
	{:else if $monitorData && $monitorData.gpus.length === 0}
		<div class="text-text-muted text-xs text-center py-6">
			No GPU data available (not inside a GPU job?)
		</div>
	{:else}
		<div class="text-text-muted text-xs text-center py-6 animate-pulse">
			Waiting for data...
		</div>
	{/if}
</div>
