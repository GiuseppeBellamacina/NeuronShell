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
	}

	const commands: Command[] = [
		// Jobs
		{ id: 'myjobs', label: 'My Jobs', description: 'List your active SLURM jobs', category: 'Jobs', icon: '⚡', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && myjobs' },
		{ id: 'sinfo', label: 'Cluster Nodes', description: 'Show all cluster nodes and status', category: 'Jobs', icon: '🖥', cmd: 'sinfo -N -l' },
		{ id: 'sacct', label: 'My Associations', description: 'Show account, partition, QOS', category: 'Jobs', icon: '🔑', cmd: 'sacctmgr show associations user=$USER format=Account,Partition,QOS -P' },
		// Logs
		{ id: 'lastlog', label: 'Last Log', description: 'Show last 50 lines of most recent log', category: 'Logs', icon: '📋', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && lastlog 50' },
		// Pipeline
		{ id: 'chainshow', label: 'Chain Show', description: 'Show current job chain queue', category: 'Pipeline', icon: '🔗', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && chain-show' },
		{ id: 'watcherstatus', label: 'Watcher Status', description: 'Check if pipeline watcher is running', category: 'Pipeline', icon: '👁', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && watcher-status' },
		{ id: 'chainstart', label: 'Chain Start', description: 'Start the pipeline watcher', category: 'Pipeline', icon: '▶', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-start' },
		// Monitoring
		{ id: 'quota', label: 'Disk Quota', description: 'Check disk usage quota', category: 'Monitor', icon: '💾', cmd: 'quota -s' },
		// Training
		{ id: 'configs', label: 'List Configs', description: 'Show available training configs', category: 'Training', icon: '📁', cmd: 'find ~/GRPO-strict-generation/experiments/configs -name "grpo_*.yaml" -type f | sort' },
		{ id: 'ckpts', label: 'Checkpoints', description: 'List all checkpoints', category: 'Analysis', icon: '💾', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && ckpts --all' },
		// Utilities
		{ id: 'tree', label: 'Project Tree', description: 'Show project directory structure', category: 'Utils', icon: '🌳', cmd: 'find ~/GRPO-strict-generation -maxdepth 2 | head -60' },
		{ id: 'clean-dry', label: 'Clean (Dry Run)', description: 'Show what would be cleaned', category: 'Utils', icon: '🧹', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh' },
		// Danger
		{ id: 'chainstop', label: 'Chain Stop', description: 'Stop the pipeline watcher', category: 'Danger', icon: '⏹', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && chain-stop', danger: true },
		{ id: 'watcherkill', label: 'Watcher Kill', description: 'Force kill the watcher process', category: 'Danger', icon: '💀', cmd: 'cd ~/GRPO-strict-generation && source cluster/aliases.sh && watcher-kill <<< "y"', danger: true },
		{ id: 'killall', label: 'Kill All Jobs', description: 'Cancel ALL your SLURM jobs', category: 'Danger', icon: '🚨', cmd: 'scancel --me', danger: true },
		{ id: 'cleanforce', label: 'Clean (Force)', description: 'Force clean workspace files', category: 'Danger', icon: '🗑', cmd: 'cd ~/GRPO-strict-generation && bash cluster/clean.sh --force', danger: true },
		{ id: 'pipclean', label: 'Pip Clean', description: 'Remove all pip --user packages', category: 'Danger', icon: '💣', cmd: 'source ~/GRPO-strict-generation/cluster/aliases.sh && pip-clean', danger: true },
	];

	let filtered = $derived.by(() => {
		if (!query.trim()) return commands.filter(c => !c.danger);
		const q = query.toLowerCase();
		return commands.filter(c =>
			c.label.toLowerCase().includes(q) ||
			c.description.toLowerCase().includes(q) ||
			c.category.toLowerCase().includes(q) ||
			c.id.toLowerCase().includes(q)
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
		// Reset selection when filter changes
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
		class="fixed inset-0 z-9998 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
		onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
		onkeydown={undefined}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="w-full max-w-xl mx-4 glass overflow-hidden" onkeydown={handleKeydown}>>
			<!-- Search Input -->
			<div class="flex items-center gap-3 px-4 py-3 border-b border-border-dim">
				<span class="text-accent text-sm">⌘</span>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Type a command..."
					class="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted font-mono"
				/>
				<kbd class="text-[9px] text-text-muted border border-border-dim px-1.5 py-0.5">ESC</kbd>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto">
				{#if filtered.length === 0}
					<div class="px-4 py-6 text-center text-text-muted text-xs">
						No commands found
					</div>
				{:else}
					{#each filtered as cmd, i}
						<button
							onclick={() => runCommand(cmd)}
							class="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer
								{i === selectedIndex ? 'bg-accent/10 border-l-2 border-accent' : 'border-l-2 border-transparent hover:bg-bg-elevated/50'}
								{cmd.danger ? 'hover:bg-red/10' : ''}"
						>
							<span class="text-base w-6 text-center shrink-0">{cmd.icon}</span>
							<div class="flex-1 min-w-0">
						<div class="text-sm {cmd.danger ? 'text-red' : 'text-text-primary'}">{cmd.label}</div>
								<div class="text-[10px] text-text-muted truncate">{cmd.description}</div>
							</div>
							<span class="text-[9px] text-text-muted uppercase tracking-wider shrink-0 px-1.5 py-0.5 border border-border-dim/50">
								{cmd.category}
							</span>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Footer hint -->
			<div class="px-4 py-2 border-t border-border-dim flex items-center gap-4 text-[9px] text-text-muted">
				<span>↑↓ navigate</span>
				<span>↵ run</span>
				<span>Type <span class="text-red">"danger"</span> to see destructive commands</span>
			</div>
		</div>
	</div>
{/if}
