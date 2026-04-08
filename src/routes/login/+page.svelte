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

<div class="min-h-screen flex items-center justify-center bg-grid scanlines p-4">
	<!-- Background decorations -->
	<div class="fixed inset-0 pointer-events-none overflow-hidden">
		<div class="absolute top-1/4 -left-32 w-64 h-64 bg-neon-cyan/5 rounded-full blur-[100px]"></div>
		<div class="absolute bottom-1/4 -right-32 w-64 h-64 bg-neon-magenta/5 rounded-full blur-[100px]"></div>
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-cyan/3 rounded-full blur-[150px]"></div>
	</div>

	<div class="relative w-full max-w-md">
		<!-- Logo / Title -->
		<div class="text-center mb-8">
			<h1 class="font-[Orbitron] text-4xl font-bold text-neon-cyan text-glow-cyan text-flicker tracking-widest">
				NEURON<span class="text-neon-magenta text-glow-magenta">SHELL</span>
			</h1>
			<p class="mt-2 text-text-secondary text-sm tracking-[0.3em] uppercase">
				Cluster Control Interface
			</p>
			<div class="mt-4 h-px bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent"></div>
		</div>

		<!-- Login Card -->
		<form onsubmit={handleLogin} class="glass glow-cyan p-8 relative">
			<!-- Corner accents -->
			<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-neon-cyan"></div>
			<div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-neon-cyan"></div>
			<div class="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-neon-cyan"></div>
			<div class="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-neon-cyan"></div>

			<div class="space-y-5">
				<div>
					<label for="username" class="block text-xs uppercase tracking-widest text-text-secondary mb-2">
						&gt; User ID
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
					<label for="password" class="block text-xs uppercase tracking-widest text-text-secondary mb-2">
						&gt; Access Key
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
					<div class="text-neon-red text-sm flex items-center gap-2 p-2 border border-neon-red/30 bg-neon-red/5">
						<span class="text-xs">&#x26A0;</span>
						<span>{error}</span>
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading || !username || !password}
					class="btn-cyber w-full py-3 text-sm font-semibold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
				>
					{#if loading}
						<span class="inline-block animate-spin mr-2">&#x25E0;</span> AUTHENTICATING...
					{:else}
						INITIALIZE SESSION &gt;&gt;
					{/if}
				</button>
			</div>

			<div class="mt-6 text-center text-[10px] text-text-muted tracking-widest uppercase">
				Authorized personnel only
			</div>
		</form>

		<!-- Bottom decoration -->
		<div class="mt-6 flex items-center justify-center gap-2 text-[10px] text-text-muted">
			<span class="pulse-dot pulse-dot-connected"></span>
			<span class="tracking-widest uppercase">System Online</span>
		</div>
	</div>
</div>
