<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/toast';

	const colorMap: Record<Toast['type'], string> = {
		success: 'border-neon-green text-neon-green',
		error: 'border-neon-red text-neon-red',
		info: 'border-neon-cyan text-neon-cyan',
		warning: 'border-neon-yellow text-neon-yellow'
	};

	const iconMap: Record<Toast['type'], string> = {
		success: '✓',
		error: '✕',
		info: 'ℹ',
		warning: '⚠'
	};
</script>

{#if $toasts.length > 0}
	<div class="fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
		{#each $toasts as t (t.id)}
			<div
				class="glass border pointer-events-auto px-4 py-3 flex items-center gap-3 text-xs min-w-72 {colorMap[t.type]} {t.exiting ? 'toast-exit' : 'toast-enter'}"
			>
				<span class="font-bold text-sm">{iconMap[t.type]}</span>
				<span class="text-text-primary">{t.message}</span>
			</div>
		{/each}
	</div>
{/if}
