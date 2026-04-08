<script lang="ts">
	import { monitorData, addCommandOutput } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';

	let loadingJob = $state<string | null>(null);
	let filter = $state<'all' | 'COMPLETED' | 'RUNNING' | 'PENDING'>('all');
	let collapsedGroups = $state<Set<string>>(new Set());

	function stateColor(state: string): string {
		switch (state?.toUpperCase()) {
			case 'RUNNING': return 'text-green bg-green/10 border-green/30';
			case 'PENDING': return 'text-yellow bg-yellow/10 border-yellow/30';
			case 'COMPLETED': return 'text-accent bg-accent/10 border-accent/30';
			case 'FAILED': return 'text-red bg-red/10 border-red/30';
			case 'CANCELLED': return 'text-orange bg-orange/10 border-orange/30';
			case 'TIMEOUT': return 'text-orange bg-orange/10 border-orange/30';
			default: return 'text-text-muted bg-bg-surface border-border-dim';
		}
	}

	function stateIcon(state: string): string {
		switch (state?.toUpperCase()) {
			case 'COMPLETED': return '✓';
			case 'RUNNING': return '▶';
			case 'PENDING': return '·';
			case 'FAILED': return '✗';
			case 'CANCELLED': return '✗';
			default: return '·';
		}
	}

	let filteredJobs = $derived(
		$monitorData?.jobs.filter(j => filter === 'all' || j.state === filter) ?? []
	);

	// Group jobs by model group
	let groupedJobs = $derived(() => {
		const groups: { name: string; jobs: typeof filteredJobs }[] = [];
		const seen = new Set<string>();
		for (const job of filteredJobs) {
			const g = job.group || 'Ungrouped';
			if (!seen.has(g)) {
				seen.add(g);
				groups.push({ name: g, jobs: filteredJobs.filter(j => (j.group || 'Ungrouped') === g) });
			}
		}
		return groups;
	});

	let counts = $derived({
		all: $monitorData?.jobs.length ?? 0,
		COMPLETED: $monitorData?.jobs.filter(j => j.state === 'COMPLETED').length ?? 0,
		RUNNING: $monitorData?.jobs.filter(j => j.state === 'RUNNING').length ?? 0,
		PENDING: $monitorData?.jobs.filter(j => j.state === 'PENDING').length ?? 0,
	});

	function toggleGroup(name: string) {
		const next = new Set(collapsedGroups);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		collapsedGroups = next;
	}

	async function getJobInfo(jobId: string) {
		loadingJob = jobId;
		try {
			const res = await fetch('/api/ssh/exec', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: `source ~/GRPO-strict-generation/cluster/aliases.sh && jobinfo ${jobId}` })
			});
			const data = await res.json();
			if (res.ok) {
				addCommandOutput(`Job ${jobId} Info`, data.stdout || '', data.stderr || undefined);
				toast(`Job ${jobId} info loaded → Output panel`, 'success', 2000);
			} else {
				toast(data.error, 'error');
			}
		} catch {
			toast('Failed to get job info', 'error');
		} finally {
			loadingJob = null;
		}
	}

	async function getJobLog(jobId: string, name: string) {
		const type = name.toLowerCase().includes('eval') ? 'eval' : name.toLowerCase().includes('baseline') ? 'baseline' : 'train';
		loadingJob = jobId;
		try {
			const res = await fetch('/api/ssh/exec', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: `tail -n 80 ~/GRPO-strict-generation/logs/slurm-${type}-${jobId}.log` })
			});
			const data = await res.json();
			if (res.ok) {
				addCommandOutput(`Log ${type}-${jobId}`, data.stdout || '', data.stderr || undefined);
				toast(`Log loaded → Output panel`, 'success', 2000);
			} else {
				toast(data.error, 'error');
			}
		} catch {
			toast('Failed to get log', 'error');
		} finally {
			loadingJob = null;
		}
	}
</script>

<div class="glass p-4">
	<!-- Header + filter tabs -->
	<div class="flex items-center gap-2 mb-3">
		<span class="text-sm">📡</span>
		<h3 class="text-xs font-semibold text-text-primary">Pipeline Jobs</h3>
		<div class="ml-auto flex gap-1">
			{#each ['all', 'RUNNING', 'PENDING', 'COMPLETED'] as f}
				{@const c = counts[f as keyof typeof counts]}
				<button
					onclick={() => filter = f as typeof filter}
					class="text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer {filter === f
						? 'border-accent/50 bg-accent/10 text-accent'
						: 'border-border-dim text-text-muted hover:text-text-secondary'}"
				>
					{f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} <span class="font-mono">{c}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if $monitorData && filteredJobs.length > 0}
		<div class="overflow-y-auto max-h-[60vh] space-y-1">
			{#each groupedJobs() as group}
				<!-- Group header -->
				<button
					onclick={() => toggleGroup(group.name)}
					class="w-full flex items-center gap-2 py-1.5 px-2 text-[11px] text-text-secondary hover:text-text-primary rounded transition-colors cursor-pointer"
				>
					<span class="text-[10px] text-text-muted transition-transform {collapsedGroups.has(group.name) ? '' : 'rotate-90'}">▶</span>
					<span class="font-medium">{group.name}</span>
					<span class="text-[9px] text-text-muted ml-auto">{group.jobs.length}</span>
				</button>

				{#if !collapsedGroups.has(group.name)}
					{#each group.jobs as job}
						<div class="flex items-center gap-2 py-1 px-3 ml-2 text-[11px] border-l border-border-dim/30 hover:bg-bg-elevated/30 transition-colors group">
							<!-- Status icon -->
							<span class="w-3 text-center {
								job.state === 'COMPLETED' ? 'text-green' :
								job.state === 'RUNNING' ? 'text-accent' :
								job.state === 'PENDING' ? 'text-text-muted' :
								'text-red'
							}">{stateIcon(job.state)}</span>

							<!-- Name -->
							<span class="text-text-primary flex-1 truncate font-mono text-[10px]">{job.name}</span>

							<!-- Job ID -->
							{#if job.id}
								<span class="text-text-muted font-mono text-[10px]">[{job.id}]</span>
							{/if}

							<!-- State badge -->
							<span class="px-1.5 py-0.5 border text-[8px] uppercase tracking-wider rounded {stateColor(job.state)}">
								{job.state}
							</span>

							<!-- Action buttons (only for jobs with IDs) -->
							{#if job.id}
								<span class="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										onclick={() => getJobInfo(job.id)}
										disabled={loadingJob === job.id}
										class="text-[9px] px-1.5 py-0.5 border border-accent/30 text-accent/70 hover:bg-accent/10 hover:text-accent rounded transition-all cursor-pointer disabled:opacity-30"
										title="Job details"
									>INFO</button>
									<button
										onclick={() => getJobLog(job.id, job.name)}
										disabled={loadingJob === job.id}
										class="text-[9px] px-1.5 py-0.5 border border-green/30 text-green/70 hover:bg-green/10 hover:text-green rounded transition-all cursor-pointer disabled:opacity-30"
										title="View log"
									>LOG</button>
								</span>
							{/if}
						</div>
					{/each}
				{/if}
			{/each}
		</div>
	{:else if $monitorData && filteredJobs.length === 0}
		<div class="text-text-muted text-xs text-center py-6">
			{filter === 'all' ? 'No jobs in pipeline' : `No ${filter.toLowerCase()} jobs`}
		</div>
	{:else}
		<div class="text-text-muted text-xs text-center py-6 animate-pulse">
			Waiting for data...
		</div>
	{/if}
</div>
