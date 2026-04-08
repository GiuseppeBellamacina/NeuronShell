<script lang="ts">
	import { addCommandOutput } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';

	interface Props {
		connected: boolean;
	}

	let { connected }: Props = $props();

	let expandedCategory = $state<string | null>('jobs');
	let inputValues = $state<Record<string, string>>({});
	let loadingCmd = $state<string | null>(null);

	interface Action {
		label: string;
		cmd: string | ((inputs: Record<string, string>) => string);
		inputs?: { key: string; placeholder: string; type?: string }[];
		danger?: boolean;
		confirm?: string;
	}

	interface Category {
		name: string;
		icon: string;
		color: string;
		actions: Action[];
	}

	const categories: Category[] = [
		{
			name: 'jobs',
			icon: '⚡',
			color: 'neon-cyan',
			actions: [
				{ label: 'My Jobs', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && myjobs' },
				{ label: 'Job Info', cmd: (i) => `source ~/GRPO-strict-generation/cluster/aliases.sh && jobinfo ${i.jobId}`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
				{ label: 'Kill Job', cmd: (i) => `scancel ${i.jobId}`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }], danger: true, confirm: 'Cancel this job?' },
				{ label: 'Kill All Jobs', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && scancel --me', danger: true, confirm: 'Cancel ALL your jobs?' }
			]
		},
		{
			name: 'logs',
			icon: '📋',
			color: 'neon-green',
			actions: [
				{ label: 'Last Log (50)', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && lastlog 50' },
				{ label: 'Train Log', cmd: (i) => `tail -n 100 ~/GRPO-strict-generation/logs/slurm-train-${i.jobId}.log`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
				{ label: 'Eval Log', cmd: (i) => `tail -n 100 ~/GRPO-strict-generation/logs/slurm-eval-${i.jobId}.log`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] },
				{ label: 'Baseline Log', cmd: (i) => `tail -n 100 ~/GRPO-strict-generation/logs/slurm-baseline-${i.jobId}.log`, inputs: [{ key: 'jobId', placeholder: 'Job ID' }] }
			]
		},
		{
			name: 'training',
			icon: '🧠',
			color: 'neon-magenta',
			actions: [
				{ label: 'List Configs', cmd: 'find ~/GRPO-strict-generation/experiments/configs -name "grpo_*.yaml" -type f | sort' },
				{ label: 'Train', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && train --config ${i.config}`, inputs: [{ key: 'config', placeholder: 'Config path (e.g. grpo_smollm2_135m.yaml)' }] },
				{ label: 'Run Eval', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && run-eval --config ${i.config}`, inputs: [{ key: 'config', placeholder: 'Config path' }] },
				{ label: 'Run All', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && run-all --all', confirm: 'Launch full pipeline for all models?' }
			]
		},
		{
			name: 'pipeline',
			icon: '🔗',
			color: 'neon-yellow',
			actions: [
				{ label: 'Chain Show', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && chain-show' },
				{ label: 'Watcher Status', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && watcher-status' },
				{ label: 'Chain Stop', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-stop', danger: true, confirm: 'Stop the pipeline?' },
				{ label: 'Chain Start', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-start' },
				{ label: 'Watcher Kill', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && watcher-kill <<< "y"', danger: true, confirm: 'Kill the watcher process?' }
			]
		},
		{
			name: 'monitoring',
			icon: '📊',
			color: 'neon-cyan',
			actions: [
				{ label: 'GPU Status', cmd: 'nvidia-smi' },
				{ label: 'Disk Quota', cmd: 'quota -s' },
				{ label: 'Cluster Nodes', cmd: 'sinfo -N -l' },
				{ label: 'My Associations', cmd: 'sacctmgr show associations user=$USER format=Account,Partition,QOS -P' }
			]
		},
		{
			name: 'analysis',
			icon: '🔬',
			color: 'neon-green',
			actions: [
				{ label: 'Checkpoints (all)', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && ckpts --all' },
				{ label: 'Training Table', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && trainlog-table ${i.variant}`, inputs: [{ key: 'variant', placeholder: '--nothink --standard (or --all)' }] },
				{ label: 'Training Plot', cmd: (i) => `cd ~/GRPO-strict-generation && source cluster/aliases.sh && trainlog-plot ${i.variant}`, inputs: [{ key: 'variant', placeholder: '--nothink --standard (or --all)' }] }
			]
		},
		{
			name: 'utilities',
			icon: '🔧',
			color: 'neon-orange',
			actions: [
				{ label: 'Project Tree', cmd: 'find ~/GRPO-strict-generation -maxdepth 2 | head -60' },
				{ label: 'Clean (dry-run)', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh' },
				{ label: 'Clean (force)', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh --force', danger: true, confirm: 'Force clean workspace?' },
				{ label: 'Pip Setup', cmd: 'cd ~/GRPO-strict-generation && bash cluster/setup.sh' },
				{ label: 'Pip Clean', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && pip-clean', danger: true, confirm: 'Remove all pip --user packages?' }
			]
		}
	];

	async function executeAction(action: Action) {
		if (!connected) {
			toast('Not connected to SSH', 'warning');
			return;
		}

		if (action.confirm && !window.confirm(action.confirm)) return;

		const cmd = typeof action.cmd === 'function' ? action.cmd(inputValues) : action.cmd;
		loadingCmd = action.label;

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

	function toggleCategory(name: string) {
		expandedCategory = expandedCategory === name ? null : name;
	}
</script>

<div class="flex flex-col h-full">
	<div class="px-3 py-2 border-b border-border-dim">
		<h2 class="text-[10px] uppercase tracking-[0.3em] text-text-muted">Quick Actions</h2>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#each categories as cat}
			<div class="border-b border-border-dim/50">
				<!-- Category Header -->
				<button
					onclick={() => toggleCategory(cat.name)}
					class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-bg-elevated/50 transition-colors cursor-pointer"
				>
					<span class="text-sm">{cat.icon}</span>
					<span class="text-xs uppercase tracking-widest text-text-secondary flex-1">{cat.name}</span>
					<span class="text-text-muted text-[10px] transition-transform {expandedCategory === cat.name ? 'rotate-90' : ''}">▶</span>
				</button>

				<!-- Actions -->
				{#if expandedCategory === cat.name}
					<div class="px-2 pb-2 space-y-1">
						{#each cat.actions as action}
							<div class="space-y-1">
								<!-- Inputs -->
								{#if action.inputs}
									{#each action.inputs as input}
										<input
											type={input.type || 'text'}
											placeholder={input.placeholder}
											bind:value={inputValues[input.key]}
											class="input-cyber w-full text-[11px] py-1 px-2"
										/>
									{/each}
								{/if}
								<!-- Button -->
								<button
									onclick={() => executeAction(action)}
									disabled={!connected || loadingCmd === action.label}
									class="w-full text-left px-2 py-1.5 text-[11px] border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed
										{action.danger ? 'border-neon-red/30 text-neon-red hover:bg-neon-red/10 hover:border-neon-red/50' : 'border-border-dim text-text-primary hover:border-neon-cyan/40 hover:bg-neon-cyan/5 hover:text-neon-cyan'}"
								>
									{#if loadingCmd === action.label}
										<span class="inline-block animate-spin mr-1">◠</span>
									{/if}
									{action.label}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Custom Command -->
	<div class="border-t border-border-dim p-2">
		<div class="text-[10px] uppercase tracking-widest text-text-muted mb-1">&gt; Custom</div>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				const cmd = inputValues['custom'];
				if (cmd) {
					executeAction({ label: cmd.split(' ')[0], cmd });
					inputValues['custom'] = '';
				}
			}}
			class="flex gap-1"
		>
			<input
				type="text"
				placeholder="command..."
				bind:value={inputValues['custom']}
				class="input-cyber flex-1 text-[11px] py-1 px-2"
			/>
			<button type="submit" disabled={!connected} class="btn-cyber text-[10px] px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed">
				RUN
			</button>
		</form>
	</div>
</div>
