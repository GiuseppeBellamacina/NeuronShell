<script lang="ts">
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin(e: Event) {
		e.preventDefault();
		if (!username || !password) return;
		loading = true;
		error = '';

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			const data = await res.json();
			if (res.ok) {
				goto('/');
			} else {
				error = data.error || 'Login failed';
			}
		} catch {
			error = 'Connection error';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-bg-void p-4">
	<div class="w-full max-w-sm">
		<!-- Logo / Title -->
		<div class="text-center mb-8">
			<h1 class="text-2xl font-semibold text-text-primary">
				Neuron<span class="text-accent">Shell</span>
			</h1>
			<p class="mt-1 text-text-muted text-sm">
				Cluster Control Interface
			</p>
		</div>

		<!-- Login Card -->
		<form onsubmit={handleLogin} class="glass p-6">
			<div class="space-y-4">
				<div>
					<label for="username" class="block text-xs text-text-secondary mb-1.5">
						Username
					</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						class="input-cyber w-full"
						placeholder="Enter username"
						autocomplete="username"
						required
					/>
				</div>

				<div>
					<label for="password" class="block text-xs text-text-secondary mb-1.5">
						Password
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						class="input-cyber w-full"
						placeholder="Enter password"
						autocomplete="current-password"
						required
					/>
				</div>

				{#if error}
					<div class="text-red text-sm flex items-center gap-2 p-2.5 rounded-md border border-red/20 bg-red/5">
						<span class="text-xs">&#x26A0;</span>
						<span>{error}</span>
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading || !username || !password}
					class="btn-cyber w-full py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
				>
					{#if loading}
						<span class="inline-block animate-spin mr-2">&#x25E0;</span> Signing in...
					{:else}
						Sign in
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
