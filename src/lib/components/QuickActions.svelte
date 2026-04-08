<script lang="ts">
	import { addCommandOutput } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';

	interface Props {
		connected: boolean;
	}

	let { connected }: Props = $props();

	let loadingCmd = $state<string | null>(null);
	let inputValues = $state<Record<string, string>>({});
	let showTraining = $state(false);
	let dangerUnlocked = $state(false);
	let showDanger = $state(false);

	interface Action {
		id: string;
		label: string;
		description: string;
		icon: string;
		cmd: string | ((inputs: Record<string, string>) => string);
		inputs?: { key: string; placeholder: string }[];
		danger?: boolean;
		confirm?: string;
		color?: string;
	}

	// ── Hero actions: most used, always visible ──
	const heroActions: Action[] = [
		{ id: 'myjobs', label: 'My Jobs', description: 'Active SLURM jobs', icon: '⚡', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && myjobs', color: 'cyan' },
		{ id: 'chainshow', label: 'Pipeline', description: 'Job chain queue', icon: '🔗', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && chain-show', color: 'yellow' },
		{ id: 'lastlog', label: 'Last Log', description: 'Recent log output', icon: '📋', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && lastlog 50', color: 'green' },
		{ id: 'watcher', label: 'Watcher', description: 'Pipeline watcher status', icon: '👁', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && watcher-status', color: 'magenta' },
	];

	// ── Secondary: common but less frequent ──
	const secondaryActions: Action[] = [
		{ id: 'quota', label: 'Disk Quota', description: 'Check usage', icon: '💾', cmd: 'quota -s' },
		{ id: 'ckpts', label: 'Checkpoints', description: 'All saved ckpts', icon: '📦', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && ckpts --all' },
		{ id: 'sinfo', label: 'Nodes', description: 'Cluster info', icon: '🖥', cmd: 'sinfo -N -l' },
	];

	// ── Job inspection (needs job ID) ──
	const jobActions: Action[] = [
		{ id: 'jobinfo', label: 'Job Info', description: 'Details of a specific job', icon: '🔍', cmd: (i) => `source ~/GRPO-strict-generation/cluster/aliases.sh && jobinfo ${i.jobId}`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
		{ id: 'trainlog', label: 'Train Log', description: 'Training job output', icon: '📋', cmd: (i) => `tail -n 100 ~/GRPO-strict-generation/logs/slurm-train-${i.jobId}.log`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
		{ id: 'evallog', label: 'Eval Log', description: 'Evaluation job output', icon: '📊', cmd: (i) => `tail -n 100 ~/GRPO-strict-generation/logs/slurm-eval-${i.jobId}.log`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
	];

	// ── Training launch ──
	const trainingActions: Action[] = [
		{ id: 'configs', label: 'List Configs', description: 'Available YAML configs', icon: '📁', cmd: 'find ~/GRPO-strict-generation/experiments/configs -name "grpo_*.yaml" -type f | sort' },
		{ id: 'train', label: 'Train', description: 'Submit training job', icon: '🧠', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && train --config ${i.config}`, inputs: [{ key: 'config', placeholder: 'grpo_smollm2_135m.yaml' }], confirm: 'Submit this training job?' },
		{ id: 'eval', label: 'Run Eval', description: 'Submit eval job', icon: '📈', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && run-eval --config ${i.config}`, inputs: [{ key: 'config', placeholder: 'Config path' }], confirm: 'Submit this eval job?' },
		{ id: 'runall', label: 'Run All', description: 'Full pipeline for all models', icon: '🚀', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && run-all --all', confirm: 'Launch full pipeline for ALL models? This will queue many jobs.' },
		{ id: 'chainstart', label: 'Start Watcher', description: 'Start pipeline watcher', icon: '▶', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-start' },
		{ id: 'traintable', label: 'Training Table', description: 'View training metrics', icon: '📊', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && trainlog-table ${i.variant || '--all'}`, inputs: [{ key: 'variant', placeholder: '--nothink --standard (or --all)' }] },
	];

	// ── Danger zone: destructive, hidden by default ──
	const dangerActions: Action[] = [
		{ id: 'killjob', label: 'Kill Job', description: 'Cancel a specific SLURM job', icon: '✕', cmd: (i) => `scancel ${i.killJobId}`, inputs: [{ key: 'killJobId', placeholder: 'Job ID to cancel' }], danger: true, confirm: 'Cancel this job?' },
		{ id: 'killall', label: 'Kill All Jobs', description: 'Cancel ALL your jobs', icon: '🚨', cmd: 'scancel --me', danger: true, confirm: 'Cancel ALL your SLURM jobs? This cannot be undone.' },
		{ id: 'chainstop', label: 'Stop Pipeline', description: 'Stop job chain watcher', icon: '⏹', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-stop', danger: true, confirm: 'Stop the pipeline watcher?' },
		{ id: 'watcherkill', label: 'Kill Watcher', description: 'Force kill watcher process', icon: '💀', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && watcher-kill <<< "y"', danger: true, confirm: 'Force kill the watcher? Running jobs will continue but no new jobs will be submitted.' },
		{ id: 'cleanforce', label: 'Clean (Force)', description: 'Delete temp files', icon: '🗑', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh --force', danger: true, confirm: 'Force clean workspace? This deletes temporary files.' },
		{ id: 'pipclean', label: 'Pip Clean', description: 'Remove all pip packages', icon: '💣', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && pip-clean', danger: true, confirm: 'Remove ALL pip --user packages?' },
	];

	async function execute(action: Action) {
		if (!connected) {
			toast('Not connected to SSH', 'warning');
			return;
		}
		if (action.confirm && !window.confirm(action.confirm)) return;

		const cmd = typeof action.cmd === 'function' ? action.cmd(inputValues) : action.cmd;
		loadingCmd = action.id;

		try {
			const res = await fetch('/api/ssh/exec', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: cmd })
			});
			const data = await res.json();

			if (res.ok) {
				addCommandOutput(action.label, data.stdout || '', data.stderr || undefined);
				if (data.stderr && data.code !== 0) {
					toast(`${action.label}: completed with errors`, 'warning');
				} else {
					toast(`${action.label}: done`, 'success', 2000);
				}
			} else {
				addCommandOutput(action.label, '', data.error);
				toast(data.error, 'error');
			}
		} catch {
			toast('Execution error', 'error');
		} finally {
			loadingCmd = null;
		}
	}
</script>

<div class="space-y-5 overflow-y-auto h-full pr-1">
	<!-- ── Hero Actions ── -->
	<div>
		<h3 class="text-[10px] uppercase tracking-[0.25em] text-text-muted mb-2 px-1">Quick Status</h3>
		<div class="grid grid-cols-2 gap-2">
			{#each heroActions as action}
				<button
					onclick={() => execute(action)}
					disabled={!connected || loadingCmd === action.id}
					class="action-card action-card-{action.color} cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-left"
				>
					<div class="flex items-start gap-2">
						<span class="text-lg leading-none">{action.icon}</span>
						<div class="min-w-0">
							<div class="text-xs font-semibold leading-tight">
								{#if loadingCmd === action.id}<span class="inline-block animate-spin mr-1">◠</span>{/if}
								{action.label}
							</div>
							<div class="text-[9px] text-text-muted mt-0.5 leading-tight">{action.description}</div>
						</div>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- ── Secondary Actions ── -->
	<div>
		<h3 class="text-[10px] uppercase tracking-[0.25em] text-text-muted mb-2 px-1">Monitor</h3>
		<div class="grid grid-cols-2 gap-1.5">
			{#each secondaryActions as action}
				<button
					onclick={() => execute(action)}
					disabled={!connected || loadingCmd === action.id}
					class="flex items-center gap-2 px-2.5 py-2 text-left border border-border-dim hover:border-accent/30 hover:bg-accent/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-bg-deep/50"
				>
					<span class="text-sm">{action.icon}</span>
					<div class="min-w-0">
						<div class="text-[11px] text-text-primary leading-tight">{action.label}</div>
						<div class="text-[9px] text-text-muted leading-tight">{action.description}</div>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- ── Job Inspection ── -->
	<div>
		<h3 class="text-[10px] uppercase tracking-[0.25em] text-text-muted mb-2 px-1">Job Lookup</h3>
		<div class="flex gap-1.5 mb-2">
			<input
				type="text"
				placeholder="Job ID..."
				bind:value={inputValues['jobId']}
				class="input-cyber flex-1 text-[11px] py-1.5 px-2.5"
			/>
		</div>
		<div class="flex gap-1.5 flex-wrap">
			{#each jobActions as action}
				<button
					onclick={() => execute(action)}
					disabled={!connected || !inputValues['jobId'] || loadingCmd === action.id}
					class="flex-1 min-w-0 px-2 py-1.5 text-[10px] border border-border-dim text-text-secondary hover:border-accent/30 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
				>
					{action.icon} {action.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- ── Training (expandable) ── -->
	<div>
		<button
			onclick={() => showTraining = !showTraining}
			class="w-full flex items-center gap-2 px-1 mb-2 cursor-pointer group"
		>
			<h3 class="text-[10px] uppercase tracking-[0.25em] text-text-muted group-hover:text-purple transition-colors">🧠 Training & Launch</h3>
			<div class="flex-1 border-t border-border-dim/50"></div>
			<span class="text-[10px] text-text-muted transition-transform {showTraining ? 'rotate-90' : ''}">▶</span>
		</button>
		{#if showTraining}
			<div class="space-y-2 animate-in">
				<div class="flex gap-1.5 items-center">
					<input
						type="text"
						placeholder="Config file (e.g. grpo_smollm2_135m.yaml)"
						bind:value={inputValues['config']}
						class="input-cyber flex-1 text-[11px] py-1.5 px-2.5"
					/>
				</div>
				<div class="grid grid-cols-2 gap-1.5">
					{#each trainingActions as action}
						<button
							onclick={() => execute(action)}
							disabled={!connected || (action.inputs && !inputValues[action.inputs[0].key]) || loadingCmd === action.id}
							class="px-2.5 py-2 text-left text-[11px] border border-purple/20 text-text-secondary hover:border-purple/40 hover:text-purple hover:bg-purple/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
						>
							<div class="flex items-center gap-1.5">
								<span>{action.icon}</span>
								<span>
									{#if loadingCmd === action.id}<span class="inline-block animate-spin mr-0.5">◠</span>{/if}
									{action.label}
								</span>
							</div>
							<div class="text-[9px] text-text-muted mt-0.5">{action.description}</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- ── Custom Command ── -->
	<div>
		<h3 class="text-[10px] uppercase tracking-[0.25em] text-text-muted mb-2 px-1">&gt; Custom</h3>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				const cmd = inputValues['custom'];
				if (cmd) {
					execute({ id: 'custom', label: cmd.split(' ')[0], description: cmd, icon: '›', cmd });
					inputValues['custom'] = '';
				}
			}}
			class="flex gap-1.5"
		>
			<input
				type="text"
				placeholder="command..."
				bind:value={inputValues['custom']}
				class="input-cyber flex-1 text-[11px] py-1.5 px-2.5"
			/>
			<button type="submit" disabled={!connected} class="btn-cyber text-[10px] px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed">
				RUN
			</button>
		</form>
	</div>

	<!-- ── Danger Zone ── -->
	<div class="mt-2">
		<button
			onclick={() => showDanger = !showDanger}
			class="w-full flex items-center gap-2 px-1 mb-2 cursor-pointer group"
		>
			<h3 class="text-[10px] uppercase tracking-[0.25em] text-red/50 group-hover:text-red transition-colors">⚠ Danger Zone</h3>
			<div class="flex-1 border-t border-red/20"></div>
			<span class="text-[10px] text-red/50 transition-transform {showDanger ? 'rotate-90' : ''}">▶</span>
		</button>
		{#if showDanger}
			<div class="border border-red/20 bg-red/5 p-2.5 space-y-2 animate-in">
				<!-- Unlock toggle -->
				<label class="flex items-center gap-2 cursor-pointer text-[10px] text-red/70">
					<input type="checkbox" bind:checked={dangerUnlocked} class="accent-red" />
					<span>Unlock destructive actions</span>
				</label>
				{#if dangerUnlocked}
					<div class="flex gap-1.5 mb-2">
						<input
							type="text"
							placeholder="Job ID (for Kill Job)"
							bind:value={inputValues['killJobId']}
							class="input-cyber flex-1 text-[11px] py-1.5 px-2.5 border-red/30 focus:border-red"
						/>
					</div>
					<div class="grid grid-cols-2 gap-1.5">
						{#each dangerActions as action}
							<button
								onclick={() => execute(action)}
								disabled={!connected || (action.inputs && !inputValues[action.inputs[0].key]) || loadingCmd === action.id}
								class="px-2 py-1.5 text-[10px] text-left border border-red/30 text-red/70 hover:bg-red/10 hover:text-red hover:border-red/50 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
							>
								{action.icon} {action.label}
								<div class="text-[8px] text-red/40 mt-0.5">{action.description}</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
