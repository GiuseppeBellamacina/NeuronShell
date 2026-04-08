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
<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }} onkeydown={undefined}>
	<div class="glass glow-cyan w-full max-w-lg mx-4 p-6 relative">
		<!-- Corner decorations -->
		<div class="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-neon-cyan"></div>
		<div class="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-neon-cyan"></div>
		<div class="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-neon-cyan"></div>
		<div class="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-neon-cyan"></div>

		<div class="flex items-center justify-between mb-6">
			<h2 class="font-[Orbitron] text-sm font-bold tracking-widest text-neon-cyan">
				SSH CONNECTION
			</h2>
			<button onclick={onclose} class="text-text-muted hover:text-neon-magenta transition-colors text-lg cursor-pointer">&times;</button>
		</div>

		<form onsubmit={handleConnect} class="space-y-4">
			<!-- Host & Port -->
			<div class="flex gap-3">
				<div class="flex-1">
					<label for="ssh-host" class="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">&gt; Host</label>
					<input id="ssh-host" type="text" bind:value={host} class="input-cyber w-full" placeholder="hostname or IP" required />
				</div>
				<div class="w-24">
					<label for="ssh-port" class="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">&gt; Port</label>
					<input id="ssh-port" type="number" bind:value={port} class="input-cyber w-full" min="1" max="65535" />
				</div>
			</div>

			<!-- Username -->
			<div>
				<label for="ssh-user" class="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">&gt; Username</label>
				<input id="ssh-user" type="text" bind:value={username} class="input-cyber w-full" placeholder="SSH username" required />
			</div>

			<!-- Auth Method Toggle -->
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => authMethod = 'password'}
					class="flex-1 py-2 text-[10px] uppercase tracking-widest border transition-colors cursor-pointer {authMethod === 'password' ? 'border-neon-cyan text-neon-cyan bg-neon-cyan/10' : 'border-border-dim text-text-muted hover:border-border-glow'}"
				>
					Password
				</button>
				<button
					type="button"
					onclick={() => authMethod = 'key'}
					class="flex-1 py-2 text-[10px] uppercase tracking-widest border transition-colors cursor-pointer {authMethod === 'key' ? 'border-neon-cyan text-neon-cyan bg-neon-cyan/10' : 'border-border-dim text-text-muted hover:border-border-glow'}"
				>
					Private Key
				</button>
			</div>

			<!-- Password or Key Input -->
			{#if authMethod === 'password'}
				<div>
					<label for="ssh-pass" class="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">&gt; Password</label>
					<input id="ssh-pass" type="password" bind:value={password} class="input-cyber w-full" placeholder="SSH password" />
				</div>
			{:else}
				<div>
					<label for="ssh-key" class="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">&gt; Private Key (PEM)</label>
					<textarea id="ssh-key" bind:value={privateKey} class="input-cyber w-full h-32 resize-none font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."></textarea>
				</div>
			{/if}

			<!-- Remember -->
			<label class="flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-colors">
				<input type="checkbox" bind:checked={remember} class="accent-neon-cyan" />
				Remember host & username
			</label>

			{#if error}
				<div class="text-neon-red text-xs p-2 border border-neon-red/30 bg-neon-red/5">
					{error}
				</div>
			{/if}

			<button
				type="submit"
				disabled={loading || !host || !username || (authMethod === 'password' ? !password : !privateKey)}
				class="btn-cyber-green w-full py-3 text-xs font-semibold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
			>
				{#if loading}
					<span class="inline-block animate-spin mr-2">◠</span> ESTABLISHING LINK...
				{:else}
					CONNECT &gt;&gt;
				{/if}
			</button>
		</form>
	</div>
</div>
