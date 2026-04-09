<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { sshStatus, monitorData, type MonitorData } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';
	import SshConnectModal from '$lib/components/SshConnectModal.svelte';
	import Terminal from '$lib/components/Terminal.svelte';
	import QuickActions from '$lib/components/QuickActions.svelte';
	import JobQueue from '$lib/components/JobQueue.svelte';
	import ActiveTraining from '$lib/components/ActiveTraining.svelte';
	import LastCompletion from '$lib/components/LastCompletion.svelte';
	import GpuMonitor from '$lib/components/GpuMonitor.svelte';
	import CommandOutput from '$lib/components/CommandOutput.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';

	let { data } = $props();

	let showSshModal = $state(!data.ssh.connected);
	let showPalette = $state(false);
	let bottomPanel = $state<'terminal' | 'output'>('terminal');
	let bottomCollapsed = $state(false);
	let monitorWs: WebSocket | null = $state(null);
	let activeView = $state<'dashboard' | 'actions'>('dashboard');

	// Initialize store from server data
	$effect(() => {
		sshStatus.set({
			connected: data.ssh.connected,
			host: data.ssh.info?.host,
			username: data.ssh.info?.username,
			connectedAt: data.ssh.info?.connectedAt
		});
	});

	// Keyboard shortcut: Ctrl+K for command palette
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault();
				showPalette = !showPalette;
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function startMonitorWs() {
		if (monitorWs) monitorWs.close();

		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(`${proto}//${window.location.host}/ws/monitor`);

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'monitor') {
					monitorData.set(msg.data as MonitorData);
				}
			} catch { /* ignore */ }
		};

		ws.onclose = (event) => {
			monitorWs = null;
			if (event.code === 4000) {
				toast('Monitor taken over by another session', 'warning');
			}
		};

		monitorWs = ws;
	}

	function onSshConnected() {
		showSshModal = false;
		sshStatus.set({ connected: true });
		toast('SSH connection established', 'success');
		startMonitorWs();
	}

	async function handleDisconnect() {
		try {
			await fetch('/api/ssh/disconnect', { method: 'POST' });
			sshStatus.set({ connected: false });
			monitorData.set(null);
			if (monitorWs) monitorWs.close();
			toast('SSH disconnected', 'info');
			showSshModal = true;
		} catch {
			toast('Failed to disconnect', 'error');
		}
	}

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}

	// Start monitor WS if already connected (onMount prevents HMR re-trigger storms)
	onMount(() => {
		if (data.ssh.connected) {
			startMonitorWs();
		}
		return () => {
			if (monitorWs) monitorWs.close();
		};
	});

	// Derived stats for status strip
	let runningJobs = $derived($monitorData?.jobs.filter(j => j.state === 'RUNNING').length ?? 0);
	let pendingJobs = $derived($monitorData?.jobs.filter(j => j.state === 'PENDING').length ?? 0);
</script>

<div class="h-screen flex flex-col overflow-hidden bg-bg-void">
	<!-- ── Top Bar ──────────────────────────────────────── -->
	<header class="glass-panel border-b border-white/5 flex items-center px-5 h-12 shrink-0 z-50">
		<h1 class="text-sm font-bold tracking-wide text-text-primary select-none">
			Neuron<span class="text-accent">Shell</span>
		</h1>

		<div class="flex-1"></div>

		<!-- Command Palette trigger -->
		<button
			onclick={() => showPalette = true}
			class="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer text-text-muted hover:text-text-secondary group"
		>
			<svg class="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
			</svg>
			<span class="text-[11px] hidden sm:inline">Search commands...</span>
			<kbd class="text-[9px] font-mono border border-white/8 rounded px-1.5 py-0.5 text-text-muted/50 ml-1">Ctrl K</kbd>
		</button>

		<!-- Connection Status -->
		<div class="flex items-center gap-3 mr-4">
			{#if $sshStatus.connected}
				<div class="flex items-center gap-2 px-3 py-1 rounded-lg bg-green/5 border border-green/15">
					<span class="pulse-dot pulse-dot-connected" style="width:6px;height:6px"></span>
					<span class="text-[11px] text-green font-mono">
						{$sshStatus.username}@{$sshStatus.host}
					</span>
				</div>
				<button onclick={handleDisconnect} class="btn-cyber-danger text-[10px] px-2.5 py-1 cursor-pointer rounded-lg">
					Disconnect
				</button>
			{:else}
				<div class="flex items-center gap-2 px-3 py-1 rounded-lg bg-red/5 border border-red/15">
					<span class="pulse-dot pulse-dot-disconnected" style="width:6px;height:6px"></span>
					<span class="text-[11px] text-red/80">Offline</span>
				</div>
				<button onclick={() => showSshModal = true} class="btn-cyber text-[10px] px-2.5 py-1 cursor-pointer">
					Connect
				</button>
			{/if}
		</div>

		<!-- User -->
		<div class="flex items-center gap-3 border-l border-white/5 pl-4">
			<span class="text-[11px] text-text-secondary">{data.username}</span>
			<button onclick={handleLogout} class="text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
				Logout
			</button>
		</div>
	</header>

	<!-- ── Status Strip ────────────────────────────────── -->
	{#if $sshStatus.connected}
		<div class="flex items-center gap-0 border-b border-white/5 shrink-0 glass-subtle overflow-x-auto">
			<div class="flex items-center gap-2 px-4 py-1.5 border-r border-white/5">
				<span class="pulse-dot {$monitorData?.watcher.active ? 'pulse-dot-connected' : 'pulse-dot-disconnected'}" style="width:6px;height:6px"></span>
				<span class="text-[10px] font-medium {$monitorData?.watcher.active ? 'text-green' : 'text-text-muted'}">
					Pipeline {$monitorData?.watcher.active ? 'Active' : 'Idle'}
				</span>
			</div>
			<div class="flex items-center gap-1.5 px-4 py-1.5 border-r border-white/5">
				<span class="text-sm font-semibold font-mono text-accent">{runningJobs}</span>
				<span class="text-[10px] text-text-muted">Running</span>
			</div>
			<div class="flex items-center gap-1.5 px-4 py-1.5 border-r border-white/5">
				<span class="text-sm font-semibold font-mono text-yellow">{pendingJobs}</span>
				<span class="text-[10px] text-text-muted">Pending</span>
			</div>
			{#if $monitorData}
				<div class="flex items-center gap-1.5 px-4 py-1.5 border-r border-white/5">
					<span class="text-sm font-semibold font-mono text-orange">{$monitorData.pipeline.done}/{$monitorData.pipeline.total}</span>
					<span class="text-[10px] text-text-muted">Done</span>
				</div>
				{#if $monitorData.gpus.length > 0}
					<div class="flex items-center gap-1.5 px-4 py-1.5 border-r border-white/5">
						<span class="text-sm font-semibold font-mono text-purple">{$monitorData.gpus[0].utilization}%</span>
						<span class="text-[10px] text-text-muted">GPU</span>
					</div>
				{/if}
			{/if}
			<div class="flex-1"></div>
			<!-- View toggle -->
			<div class="flex items-center gap-0.5 mr-2 p-0.5 bg-white/2 rounded-md">
				<button
					onclick={() => activeView = 'dashboard'}
					class="px-3 py-1 text-[11px] rounded transition-all cursor-pointer {activeView === 'dashboard' ? 'text-accent bg-accent/10 shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
				>
					Dashboard
				</button>
				<button
					onclick={() => activeView = 'actions'}
					class="px-3 py-1 text-[11px] rounded transition-all cursor-pointer {activeView === 'actions' ? 'text-accent bg-accent/10 shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
				>
					Actions
				</button>
			</div>
		</div>
	{/if}

	<!-- ── Main Content ────────────────────────────────── -->
	<div class="flex-1 flex flex-col overflow-hidden">
		{#if !$sshStatus.connected}
			<!-- Disconnected state -->
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center space-y-6">
					<div class="w-20 h-20 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center mx-auto">
						<svg class="w-10 h-10 text-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
						</svg>
					</div>
					<div>
						<p class="text-text-secondary text-sm mb-1">No active connection</p>
						<p class="text-text-muted text-xs">Connect via SSH to start monitoring</p>
					</div>
					<button onclick={() => showSshModal = true} class="btn-cyber cursor-pointer px-6">
						Connect
					</button>
				</div>
			</div>
		{:else}
			<!-- Connected: main grid -->
			<div class="flex-1 overflow-auto p-3 {bottomCollapsed ? '' : 'pb-0'}">
				{#if activeView === 'dashboard'}
					<!-- Dashboard Grid -->
					<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 auto-rows-min">
						<!-- Left: Active Training (pipeline + progress + results) -->
						<div class="lg:col-span-2">
							<ActiveTraining />
						</div>
						<!-- Right: GPU + Last Completion -->
						<div class="space-y-3">
							<GpuMonitor />
							<LastCompletion />
						</div>
						<!-- Full width: Job Queue -->
						<div class="lg:col-span-3">
							<JobQueue />
						</div>
					</div>
				{:else}
					<!-- Actions View -->
					<div class="max-w-3xl mx-auto">
						<QuickActions connected={$sshStatus.connected} />
					</div>
				{/if}
			</div>

			<!-- ── Bottom Panel (Terminal / Output) ───── -->
			<div class="shrink-0 border-t border-white/5 flex flex-col {bottomCollapsed ? 'h-9' : 'h-72'}">
				<!-- Bottom panel tabs -->
				<div class="flex items-center gap-0 shrink-0 glass-subtle">
					<button
						onclick={() => { bottomCollapsed = !bottomCollapsed; }}
						class="px-2.5 h-9 text-text-muted hover:text-accent transition-colors text-xs cursor-pointer border-r border-white/5"
						title={bottomCollapsed ? 'Expand panel' : 'Collapse panel'}
					>
						{bottomCollapsed ? '▲' : '▼'}
					</button>
					<button
						onclick={() => { bottomPanel = 'terminal'; bottomCollapsed = false; }}
						class="px-4 h-9 text-[11px] font-medium transition-all cursor-pointer {bottomPanel === 'terminal' && !bottomCollapsed ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-text-muted hover:text-text-primary'}"
					>
						Terminal
					</button>
					<button
						onclick={() => { bottomPanel = 'output'; bottomCollapsed = false; }}
						class="px-4 h-9 text-[11px] font-medium transition-all cursor-pointer {bottomPanel === 'output' && !bottomCollapsed ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-text-muted hover:text-text-primary'}"
					>
						Output
					</button>
					<div class="flex-1"></div>
					<span class="text-[9px] text-text-muted/50 px-3 font-mono">Ctrl+K commands</span>
				</div>
				<!-- Panel content -->
				{#if !bottomCollapsed}
					<div class="flex-1 overflow-hidden">
						{#if bottomPanel === 'terminal'}
							<Terminal />
						{:else}
							<CommandOutput />
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Modals & Overlays -->
{#if showSshModal}
	<SshConnectModal
		onconnected={onSshConnected}
		onclose={() => { if ($sshStatus.connected) showSshModal = false; }}
	/>
{/if}

<CommandPalette
	open={showPalette}
	connected={$sshStatus.connected}
	onclose={() => showPalette = false}
/>
