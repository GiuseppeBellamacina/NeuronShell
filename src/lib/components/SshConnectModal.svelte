<script lang="ts">
	import { toast } from '$lib/stores/toast';

	interface Props {
		onconnected: () => void;
		onclose: () => void;
	}

	let { onconnected, onclose }: Props = $props();

	let host = $state('gcluster.dmi.unict.it');
	let port = $state(22);
	let username = $state('');
	let authMethod = $state<'password' | 'key'>('password');
	let password = $state('');
	let privateKey = $state('');
	let loading = $state(false);
	let error = $state('');
	let remember = $state(false);

	// Load saved credentials from localStorage
	$effect(() => {
		try {
			const saved = localStorage.getItem('neuronshell_ssh');
			if (saved) {
				const creds = JSON.parse(saved);
				host = creds.host || host;
				port = creds.port || port;
				username = creds.username || '';
				authMethod = creds.authMethod || 'password';
				remember = true;
			}
		} catch { /* ignore */ }
	});

	async function handleConnect(e: Event) {
		e.preventDefault();
		if (!host || !username) return;
		loading = true;
		error = '';

		try {
			const body: Record<string, unknown> = { host, port, username };
			if (authMethod === 'password') {
				body.password = password;
			} else {
				body.privateKey = privateKey;
			}

			const res = await fetch('/api/ssh/connect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await res.json();
			if (res.ok) {
				// Save non-sensitive data
				if (remember) {
					localStorage.setItem('neuronshell_ssh', JSON.stringify({ host, port, username, authMethod }));
				} else {
					localStorage.removeItem('neuronshell_ssh');
				}
				onconnected();
			} else {
				error = data.error || 'Connection failed';
				toast(error, 'error');
			}
		} catch {
			error = 'Connection error';
			toast(error, 'error');
		} finally {
			loading = false;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-md" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }} onkeydown={undefined}>
	<div class="glass w-full max-w-md mx-4 overflow-hidden animate-in">
		<!-- Header -->
		<div class="flex items-center justify-between px-6 py-4 border-b border-white/5">
			<div class="flex items-center gap-3">
				<div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
					<svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
					</svg>
				</div>
				<div>
					<h2 class="text-sm font-semibold text-text-primary">SSH Connection</h2>
					<p class="text-[10px] text-text-muted">Connect to your cluster</p>
				</div>
			</div>
			<button onclick={onclose} class="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer">&times;</button>
		</div>

		<form onsubmit={handleConnect} class="p-6 space-y-4">
			<!-- Host & Port -->
			<div class="flex gap-3">
				<div class="flex-1">
					<label for="ssh-host" class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Host</label>
					<input id="ssh-host" type="text" bind:value={host} class="input-cyber w-full" placeholder="hostname or IP" required />
				</div>
				<div class="w-20">
					<label for="ssh-port" class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Port</label>
					<input id="ssh-port" type="number" bind:value={port} class="input-cyber w-full text-center" min="1" max="65535" />
				</div>
			</div>

			<!-- Username -->
			<div>
				<label for="ssh-user" class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Username</label>
				<input id="ssh-user" type="text" bind:value={username} class="input-cyber w-full" placeholder="SSH username" required />
			</div>

			<!-- Auth Method Toggle -->
			<div>
				<label class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Authentication</label>
				<div class="flex gap-1 p-0.5 rounded-lg bg-bg-deep/80 border border-white/5">
					<button
						type="button"
						onclick={() => authMethod = 'password'}
						class="flex-1 py-2 text-xs rounded-md transition-all cursor-pointer {authMethod === 'password' ? 'bg-accent/15 text-accent shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
					>
						Password
					</button>
					<button
						type="button"
						onclick={() => authMethod = 'key'}
						class="flex-1 py-2 text-xs rounded-md transition-all cursor-pointer {authMethod === 'key' ? 'bg-accent/15 text-accent shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
					>
						Private Key
					</button>
				</div>
			</div>

			<!-- Password or Key Input -->
			{#if authMethod === 'password'}
				<div>
					<label for="ssh-pass" class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Password</label>
					<input id="ssh-pass" type="password" bind:value={password} class="input-cyber w-full" placeholder="SSH password" />
				</div>
			{:else}
				<div>
					<label for="ssh-key" class="block text-[11px] text-text-muted mb-1.5 uppercase tracking-wider">Private Key (PEM)</label>
					<textarea id="ssh-key" bind:value={privateKey} class="input-cyber w-full h-28 resize-none font-mono text-[11px] leading-relaxed" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."></textarea>
				</div>
			{/if}

			<!-- Remember -->
			<label class="flex items-center gap-2.5 cursor-pointer text-xs text-text-muted hover:text-text-secondary transition-colors select-none">
				<input type="checkbox" bind:checked={remember} class="accent-accent w-3.5 h-3.5" />
				Remember host & username
			</label>

			{#if error}
				<div class="text-red text-xs p-3 rounded-lg border border-red/20 bg-red/5 flex items-center gap-2">
					<span>&#x26A0;</span>
					<span>{error}</span>
				</div>
			{/if}

			<button
				type="submit"
				disabled={loading || !host || !username || (authMethod === 'password' ? !password : !privateKey)}
				class="btn-cyber w-full py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
			>
				{#if loading}
					<span class="inline-block animate-spin mr-2">◠</span> Connecting...
				{:else}
					Connect
				{/if}
			</button>
		</form>
	</div>
</div>
