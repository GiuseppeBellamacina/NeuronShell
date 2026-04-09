<script lang="ts">
	import { monitorData } from '$lib/stores/ssh';

	function tempColor(temp: number): string {
		if (temp >= 85) return 'text-red';
		if (temp >= 70) return 'text-orange';
		if (temp >= 50) return 'text-yellow';
		return 'text-green';
	}

	function utilColor(pct: number): string {
		if (pct >= 90) return 'bg-green';
		if (pct >= 50) return 'bg-accent';
		if (pct >= 20) return 'bg-yellow';
		return 'bg-text-muted';
	}

	function memColor(pct: number): string {
		if (pct >= 90) return 'bg-red';
		if (pct >= 70) return 'bg-orange';
		if (pct >= 40) return 'bg-purple';
		return 'bg-accent';
	}
</script>

{#if $monitorData?.gpus && $monitorData.gpus.length > 0}
	<div class="glass p-4 space-y-3">
		<div class="flex items-center gap-2">
			<span class="text-sm">🎮</span>
			<h3 class="text-xs font-semibold text-text-primary">GPU</h3>
			<span class="text-[10px] text-text-muted ml-auto font-mono">{$monitorData.gpus.length} device{$monitorData.gpus.length > 1 ? 's' : ''}</span>
		</div>

		<div class="space-y-2.5">
			{#each $monitorData.gpus as gpu}
				<div class="border border-white/5 rounded-lg p-3 bg-bg-deep/40">
					<!-- GPU name + temp -->
					<div class="flex items-center justify-between mb-2.5">
						<div class="flex items-center gap-2">
							<span class="text-[10px] text-text-muted font-mono">#{gpu.index}</span>
							<span class="text-[11px] text-text-primary font-medium truncate">{gpu.name}</span>
						</div>
						<span class="text-[11px] font-mono font-semibold {tempColor(gpu.temp)}">{gpu.temp}°C</span>
					</div>

					<!-- Utilization bar -->
					<div class="mb-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-[9px] text-text-muted uppercase tracking-wider">Compute</span>
							<span class="text-[10px] font-mono text-text-secondary">{gpu.utilization}%</span>
						</div>
						<div class="w-full h-1.5 bg-bg-surface rounded-full overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-700 {utilColor(gpu.utilization)}"
								style="width: {gpu.utilization}%"
							></div>
						</div>
					</div>

					<!-- Memory bar -->
					<div class="mb-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-[9px] text-text-muted uppercase tracking-wider">VRAM</span>
							<span class="text-[10px] font-mono text-text-secondary">
								{(gpu.memoryUsed / 1024).toFixed(1)}/{(gpu.memoryTotal / 1024).toFixed(1)} GB
							</span>
						</div>
						<div class="w-full h-1.5 bg-bg-surface rounded-full overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-700 {memColor(gpu.memoryPercent)}"
								style="width: {gpu.memoryPercent}%"
							></div>
						</div>
					</div>

					<!-- Power -->
					<div class="flex items-center justify-between">
						<span class="text-[9px] text-text-muted uppercase tracking-wider">Power</span>
						<span class="text-[10px] font-mono text-text-secondary">{gpu.power}W / {gpu.powerLimit}W</span>
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else if $monitorData}
	<div class="glass p-4">
		<div class="flex items-center gap-2 mb-3">
			<span class="text-sm">🎮</span>
			<h3 class="text-xs font-semibold text-text-primary">GPU</h3>
		</div>
		<div class="text-text-muted text-[11px] text-center py-4">
			No active GPU — no running jobs
		</div>
	</div>
{/if}
