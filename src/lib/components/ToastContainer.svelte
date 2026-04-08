<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/toast';

	const colorMap: Record<Toast['type'], string> = {
		success: 'border-green/30 text-green',
		error: 'border-red/30 text-red',
		info: 'border-accent/30 text-accent',
		warning: 'border-yellow/30 text-yellow'
	};

	const iconMap: Record<Toast['type'], string> = {
		success: '✓',
		error: '✕',
		info: 'ℹ',
		warning: '⚠'
	};
</script>

{#if $toasts.length > 0}
	<div class="fixed top-4 right-4 z-10000 flex flex-col gap-2 pointer-events-none">
		{#each $toasts as t (t.id)}
			<div
				class="glass-toast pointer-events-auto px-4 py-3 flex items-center gap-3 text-xs min-w-72 border {colorMap[t.type]} {t.exiting ? 'toast-exit' : 'toast-enter'}"
			>
				<span class="font-bold text-sm">{iconMap[t.type]}</span>
				<span class="text-text-primary">{t.message}</span>
			</div>
		{/each}
	</div>
{/if}
