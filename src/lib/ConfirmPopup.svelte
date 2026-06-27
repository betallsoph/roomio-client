<script lang="ts">
	import { AlertTriangle, Check, X } from '@lucide/svelte';
	import { closeConfirmPopup, confirmPopupState } from '$lib/confirm-popup';

	const buttonToneClass = $derived(
		$confirmPopupState?.tone === 'danger'
			? 'bg-red-200 text-red-800 hover:bg-red-300'
			: $confirmPopupState?.tone === 'warning'
				? 'bg-yellow-200 text-black hover:bg-yellow-300'
				: 'bg-blue-300 text-black hover:bg-blue-400'
	);
</script>

{#if $confirmPopupState}
	<div
		class="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
		onclick={() => closeConfirmPopup(false)}
		onkeydown={(event) => event.key === 'Escape' && closeConfirmPopup(false)}
		role="button"
		tabindex="0"
	>
		<div
			class="w-full max-w-md animate-[scale-up_0.18s_ease-out] overflow-hidden rounded-lg border-2 border-black bg-white"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
			role="dialog"
			tabindex="-1"
			aria-modal="true"
		>
			<div class="flex items-center justify-between gap-3 bg-zinc-50 px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					<AlertTriangle class="h-4.5 w-4.5 shrink-0 text-blue-500" />
					<h2 class="truncate text-sm font-black text-black">{$confirmPopupState.title}</h2>
				</div>
				<button
					onclick={() => closeConfirmPopup(false)}
					class="rounded-[6px] border-2 border-black bg-white p-1.5 text-black transition-colors hover:bg-zinc-100"
					aria-label="Đóng"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="space-y-5 px-4 py-5">
				<p class="text-sm leading-relaxed font-semibold text-zinc-700">
					{$confirmPopupState.message}
				</p>

				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						onclick={() => closeConfirmPopup(false)}
						class="rounded-[6px] border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-zinc-100"
					>
						{$confirmPopupState.cancelLabel}
					</button>
					<button
						onclick={() => closeConfirmPopup(true)}
						class="inline-flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black px-4 py-2 text-sm font-black transition-colors {buttonToneClass}"
					>
						{$confirmPopupState.confirmLabel}
						<Check class="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
