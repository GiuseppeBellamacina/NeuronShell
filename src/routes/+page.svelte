<script lang="ts">
	import { goto } from '$app/navigation';
	import { sshStatus, monitorData, type MonitorData } from '$lib/stores/ssh';
	import { toast } from '$lib/stores/toast';
	import SshConnectModal from '$lib/components/SshConnectModal.svelte';
	import Terminal from '$lib/components/Terminal.svelte';
	import QuickActions from '$lib/components/QuickActions.svelte';
	import GpuMonitor from '$lib/components/GpuMonitor.svelte';
	import JobQueue from '$lib/components/JobQueue.svelte';
	import PipelineStatus from '$lib/components/PipelineStatus.svelte';
	import CommandOutput from '$lib/components/CommandOutput.svelte';

	let { data } = $props();

	let showSshModal = $state(!data.ssh.connected);
	let showSidebar = $state(true);
	let activePanel = $state<'terminal' | 'monitoring'>('terminal');
	let monitorWs: WebSocket | null = $state(null);

	// Initialize store from server data
	$effect(() => {
		sshStatus.set({
			connected: data.ssh.connected,
			host: data.ssh.info?.host,
			username: data.ssh.info?.username,
			connectedAt: data.ssh.info?.connectedAt
		});
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

		ws.onclose = () => {
			monitorWs = null;
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

	// Start monitor WS if already connected
	$effect(() => {
		if (data.ssh.connected) {
			startMonitorWs();
		}
		return () => {
			if (monitorWs) monitorWs.close();
		};
	});
</script>

<div class="h-screen flex flex-col bg-grid scanlines overflow-hidden">
	<!-- ── Top Bar ──────────────────────────────────────── -->
	<header class="glass border-b border-border-dim flex items-center px-4 h-12 shrink-0 z-50">
		<h1 class="font-[Orbitron] text-sm font-bold tracking-widest text-neon-cyan text-glow-cyan">
			NEURON<span class="text-neon-magenta text-glow-magenta">SHELL</span>
		</h1>

		<div class="flex-1"></div>

		<!-- Connection Status -->
		<div class="flex items-center gap-3 mr-6">
			{#if $sshStatus.connected}
				<span class="pulse-dot pulse-dot-connected"></span>
				<span class="text-xs text-neon-green">
					{$sshStatus.username}@{$sshStatus.host}
				</span>
				<button onclick={handleDisconnect} class="btn-cyber-danger text-[10px] px-2 py-1 border border-neon-red/40 hover:bg-neon-red/10 transition-colors cursor-pointer">
					DISCONNECT
				</button>
			{:else}
				<span class="pulse-dot pulse-dot-disconnected"></span>
				<span class="text-xs text-neon-red">OFFLINE</span>
				<button onclick={() => showSshModal = true} class="btn-cyber text-[10px] px-2 py-1 cursor-pointer">
					CONNECT
				</button>
			{/if}
		</div>

		<!-- User -->
		<div class="flex items-center gap-3 border-l border-border-dim pl-4">
			<span class="text-xs text-text-secondary">{data.username}</span>
			<button onclick={handleLogout} class="text-[10px] text-text-muted hover:text-neon-magenta transition-colors cursor-pointer uppercase tracking-widest">
				Logout
			</button>
		</div>
	</header>

	<!-- ── Main Content ────────────────────────────────── -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Sidebar -->
		{#if showSidebar}
			<aside class="w-72 glass border-r border-border-dim flex flex-col overflow-hidden shrink-0">
				<QuickActions connected={$sshStatus.connected} />
			</aside>
		{/if}

		<!-- Main Area -->
		<main class="flex-1 flex flex-col overflow-hidden">
			<!-- Panel Tabs -->
			<div class="flex items-center gap-0 border-b border-border-dim shrink-0">
				<button
					onclick={() => showSidebar = !showSidebar}
					class="px-3 h-9 text-text-muted hover:text-neon-cyan transition-colors text-sm cursor-pointer border-r border-border-dim"
					title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
				>
					{showSidebar ? '◀' : '▶'}
				</button>
				<button
					onclick={() => activePanel = 'terminal'}
					class="px-4 h-9 text-xs uppercase tracking-widest transition-colors cursor-pointer {activePanel === 'terminal' ? 'text-neon-cyan border-b-2 border-neon-cyan bg-neon-cyan/5' : 'text-text-muted hover:text-text-primary'}"
				>
					Terminal
				</button>
				<button
					onclick={() => activePanel = 'monitoring'}
					class="px-4 h-9 text-xs uppercase tracking-widest transition-colors cursor-pointer {activePanel === 'monitoring' ? 'text-neon-cyan border-b-2 border-neon-cyan bg-neon-cyan/5' : 'text-text-muted hover:text-text-primary'}"
				>
					Monitoring
				</button>
			</div>

			<!-- Panel Content -->
			<div class="flex-1 overflow-hidden">
				{#if activePanel === 'terminal'}
					<div class="h-full flex flex-col">
						{#if $sshStatus.connected}
							<Terminal />
						{:else}
							<div class="flex-1 flex items-center justify-center text-text-muted text-sm">
								<div class="text-center">
									<p class="text-4xl mb-4 opacity-20">⌨</p>
									<p>Connect to SSH to open terminal</p>
									<button onclick={() => showSshModal = true} class="btn-cyber mt-4 cursor-pointer">
										CONNECT
									</button>
								</div>
							</div>
						{/if}
						<!-- Command Output History -->
						<div class="h-48 border-t border-border-dim overflow-auto shrink-0">
							<CommandOutput />
						</div>
					</div>
				{:else}
					<div class="h-full overflow-auto p-4 space-y-4">
						{#if $sshStatus.connected}
							<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
								<GpuMonitor />
								<JobQueue />
							</div>
							<PipelineStatus />
						{:else}
							<div class="flex items-center justify-center h-64 text-text-muted text-sm">
								Connect to SSH to view monitoring data
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</main>
	</div>
</div>

<!-- SSH Connect Modal -->
{#if showSshModal}
	<SshConnectModal onconnected={onSshConnected} onclose={() => showSshModal = false} />
{/if}

