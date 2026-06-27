import { get, writable } from 'svelte/store';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export interface ConfirmPopupOptions {
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: ConfirmTone;
}

interface ConfirmPopupRequest extends Required<ConfirmPopupOptions> {
	resolve: (confirmed: boolean) => void;
}

export const confirmPopupState = writable<ConfirmPopupRequest | null>(null);

export function confirmPopup(options: string | ConfirmPopupOptions) {
	const normalized = typeof options === 'string' ? { message: options } : options;

	return new Promise<boolean>((resolve) => {
		confirmPopupState.set({
			title: normalized.title ?? 'Xác nhận thao tác',
			message: normalized.message,
			confirmLabel: normalized.confirmLabel ?? 'Xác nhận',
			cancelLabel: normalized.cancelLabel ?? 'Hủy',
			tone: normalized.tone ?? 'default',
			resolve
		});
	});
}

export function closeConfirmPopup(confirmed: boolean) {
	const request = get(confirmPopupState);
	confirmPopupState.set(null);
	request?.resolve(confirmed);
}
