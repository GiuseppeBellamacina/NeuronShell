<script lang="ts">
	import { addCommandOutput } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';

	interface Props {
		open: boolean;
		connected: boolean;
		onclose: () => void;
	}

	let { open, connected, onclose }: Props = $props();

	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let executing = $state<string | null>(null);

	interface Command {
		id: string;
		label: string;
		description: string;
		category: string;
		icon: string;
		cmd: string;
		danger?: boolean;
		keys?: string[];
	}

	const commands: Command[] = [
		// Jobs
		{ id: 'myjobs', label: 'My Jobs', description: 'List your active SLURM jobs', category: 'Jobs', icon: '⚡', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && myjobs', keys: ['jobs', 'slurm', 'active', 'queue'] },
		{ id: 'sinfo', label: 'Cluster Nodes', description: 'Show all cluster nodes and status', category: 'Jobs', icon: '🖥', cmd: 'sinfo -N -l', keys: ['nodes', 'cluster', 'sinfo', 'partitions'] },
		{ id: 'sacct', label: 'My Associations', description: 'Show account, partition, QOS', category: 'Jobs', icon: '🔑', cmd: 'sacctmgr show associations user=$USER format=Account,Partition,QOS -P', keys: ['account', 'qos', 'partition'] },
		// Logs
		{ id: 'lastlog', label: 'Last Log', description: 'Show last 50 lines of most recent log', category: 'Logs', icon: '📋', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && lastlog 50', keys: ['log', 'output', 'tail', 'recent'] },
		// Pipeline
		{ id: 'chainshow', label: 'Chain Show', description: 'Show current job chain queue', category: 'Pipeline', icon: '🔗', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && chain-show', keys: ['chain', 'pipeline', 'queue', 'pending'] },
		{ id: 'watcherstatus', label: 'Watcher Status', description: 'Check if pipeline watcher is running', category: 'Pipeline', icon: '👁', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && watcher-status', keys: ['watcher', 'daemon', 'status'] },
		{ id: 'chainstart', label: 'Chain Start', description: 'Start the pipeline watcher', category: 'Pipeline', icon: '▶', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-start', keys: ['start', 'watcher', 'resume'] },
		// Monitoring
		{ id: 'gpu', label: 'GPU Status', description: 'Show nvidia-smi GPU usage', category: 'Monitor', icon: '🎮', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && gpu', keys: ['gpu', 'nvidia', 'vram', 'cuda'] },
		{ id: 'quota', label: 'Disk Quota', description: 'Check disk usage quota', category: 'Monitor', icon: '💾', cmd: 'quota -s', keys: ['disk', 'space', 'storage'] },
		// Training
		{ id: 'configs', label: 'List Configs', description: 'Show available training configs', category: 'Training', icon: '📁', cmd: 'find ~/GRPO-strict-generation/experiments/configs -name "grpo_*.yaml" -type f | sort', keys: ['config', 'yaml', 'models'] },
		{ id: 'ckpts', label: 'Checkpoints', description: 'List all checkpoints', category: 'Analysis', icon: '💾', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && ckpts --all', keys: ['checkpoint', 'saved', 'model'] },
		// Utilities
		{ id: 'tree', label: 'Project Tree', description: 'Show project directory structure', category: 'Utils', icon: '🌳', cmd: 'find ~/GRPO-strict-generation -maxdepth 2 | head -60', keys: ['tree', 'files', 'directory', 'structure'] },
		{ id: 'clean-dry', label: 'Clean (Dry Run)', description: 'Show what would be cleaned', category: 'Utils', icon: '🧹', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh', keys: ['clean', 'preview'] },
		// Danger
		{ id: 'chainstop', label: 'Chain Stop', description: 'Stop the pipeline watcher', category: 'Danger', icon: '⏹', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-stop', danger: true, keys: ['stop', 'halt'] },
		{ id: 'watcherkill', label: 'Watcher Kill', description: 'Force kill the watcher process', category: 'Danger', icon: '💀', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && watcher-kill <<< "y"', danger: true, keys: ['kill', 'force'] },
		{ id: 'killall', label: 'Kill All Jobs', description: 'Cancel ALL your SLURM jobs', category: 'Danger', icon: '🚨', cmd: 'scancel --me', danger: true, keys: ['cancel', 'all', 'nuke'] },
		{ id: 'cleanforce', label: 'Clean (Force)', description: 'Force clean workspace files', category: 'Danger', icon: '🗑', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh --force', danger: true, keys: ['clean', 'force', 'delete'] },
		{ id: 'pipclean', label: 'Pip Clean', description: 'Remove all pip --user packages', category: 'Danger', icon: '💣', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && pip-clean', danger: true, keys: ['pip', 'packages', 'python'] },
	];

	let filtered = $derived.by(() => {
		if (!query.trim()) return commands.filter(c => !c.danger);
		const q = query.toLowerCase();
		return commands.filter(c =>
			c.label.toLowerCase().includes(q) ||
			c.description.toLowerCase().includes(q) ||
			c.category.toLowerCase().includes(q) ||
			c.id.toLowerCase().includes(q) ||
			(c.keys?.some(k => k.includes(q)) ?? false)
		);
	});

	$effect(() => {
		if (open && inputEl) {
			query = '';
			selectedIndex = 0;
			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	$effect(() => {
		if (filtered.length > 0 && selectedIndex >= filtered.length) {
			selectedIndex = 0;
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter' && filtered[selectedIndex]) {
			e.preventDefault();
			runCommand(filtered[selectedIndex]);
		} else if (e.key === 'Escape') {
			onclose();
		}
	}

	async function runCommand(cmd: Command) {
		if (!connected) {
			toast('Not connected to SSH', 'warning');
			return;
		}
		if (cmd.danger && !window.confirm(`⚠️ ${cmd.label}: ${cmd.description}\n\nSei sicuro?`)) return;

		executing = cmd.id;
		onclose();

		try {
			const res = await fetch('/api/ssh/exec', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: cmd.cmd })
			});
			const data = await res.json();
			if (res.ok) {
				addCommandOutput(cmd.label, data.stdout || '', data.stderr || undefined);
				toast(`${cmd.label}: done`, 'success', 2000);
			} else {
				addCommandOutput(cmd.label, '', data.error);
				toast(data.error, 'error');
			}
		} catch {
			toast('Execution error', 'error');
		} finally {
			executing = null;
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-9998 flex items-start justify-center pt-[12vh] bg-black/70 backdrop-blur-md"
		onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
		onkeydown={undefined}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="w-full max-w-lg mx-4 glass overflow-hidden shadow-2xl shadow-black/50 animate-in" onkeydown={handleKeydown}>
			<!-- Search Input -->
			<div class="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
				<svg class="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Search commands..."
					class="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted/60"
				/>
				<kbd class="text-[9px] text-text-muted border border-border-dim rounded px-1.5 py-0.5 font-mono">ESC</kbd>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto py-1">
				{#if filtered.length === 0}
					<div class="px-4 py-8 text-center text-text-muted text-xs">
						No commands match "<span class="text-text-secondary">{query}</span>"
					</div>
				{:else}
					{#each filtered as cmd, i}
						<button
							onclick={() => runCommand(cmd)}
							class="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all duration-100 cursor-pointer
								{i === selectedIndex ? 'bg-accent/8 border-l-2 border-accent' : 'border-l-2 border-transparent hover:bg-white/3'}
								{cmd.danger ? 'hover:bg-red/8' : ''}"
						>
							<span class="text-base w-6 text-center shrink-0 {i === selectedIndex && !cmd.danger ? 'scale-110' : ''} transition-transform">{cmd.icon}</span>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium {cmd.danger ? 'text-red' : i === selectedIndex ? 'text-text-primary' : 'text-text-secondary'}">{cmd.label}</div>
								<div class="text-[10px] text-text-muted truncate">{cmd.description}</div>
							</div>
							<span class="text-[9px] text-text-muted/60 uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded border border-white/5 bg-white/2">
								{cmd.category}
							</span>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			<div class="px-4 py-2.5 border-t border-white/5 flex items-center gap-4 text-[9px] text-text-muted/70">
				<span><kbd class="font-mono border border-white/5 rounded px-1 py-px mr-0.5">↑↓</kbd> navigate</span>
				<span><kbd class="font-mono border border-white/5 rounded px-1 py-px mr-0.5">↵</kbd> run</span>
				<span class="ml-auto">Type <span class="text-red/70">"danger"</span> for destructive commands</span>
			</div>
		</div>
	</div>
{/if}
