<script lang="ts">
	import { Loader2 } from '@lucide/svelte';
	import type { Invoice, PaymentLinkInfo } from '$lib/invoice-detail';
	import {
		formatInvoiceCurrency,
		formatInvoiceNumber,
		invoiceDebtAmount,
		invoicePaymentDescription,
		invoiceStatusLabel,
		invoiceStatusTagClass
	} from '$lib/invoice-detail';

	interface Props {
		invoice: Invoice;
		isOpen: boolean;
		isConfirming?: boolean;
		isDeleting?: boolean;
		isCreatingPaymentLink?: boolean;
		paymentInfo?: PaymentLinkInfo | null;
		paymentError?: string;
		onClose: () => void;
		onCreatePaymentLink?: () => void;
		onConfirmPayment?: () => void;
		onDelete?: () => void;
	}

	let {
		invoice,
		isOpen,
		isConfirming = false,
		isDeleting = false,
		isCreatingPaymentLink = false,
		paymentInfo = null,
		paymentError = '',
		onClose,
		onCreatePaymentLink,
		onConfirmPayment,
		onDelete
	}: Props = $props();

	const isPaid = $derived(invoice.status === 'paid');
	const debt = $derived(invoiceDebtAmount(invoice));
	const payosCheckoutUrl = $derived(
		paymentInfo?.provider === 'payos' ? paymentInfo.checkoutUrl : invoice.payosCheckoutUrl
	);
	const paymentDescription = $derived(
		paymentInfo?.description ?? invoicePaymentDescription(invoice.id)
	);
	const paymentAmount = $derived(paymentInfo?.amount ?? debt);

	function printInvoice() {
		window.print();
	}

	function formatDate(value?: string | null) {
		if (!value) return '--';
		return new Date(value).toLocaleDateString('vi-VN');
	}
</script>

{#if isOpen}
	<div
		class="invoice-modal-overlay fixed inset-0 z-50 flex animate-[fade-in_0.18s_ease-out] items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm md:p-4 print:bg-white print:p-0"
		onclick={onClose}
		onkeydown={(event) => event.key === 'Escape' && onClose()}
		role="button"
		tabindex="0"
	>
		<section
			id="invoice-detail-modal"
			class="invoice-modal-content relative flex max-h-[92vh] w-full max-w-[860px] animate-[scale-up_0.18s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white print:max-h-none print:max-w-none print:overflow-visible"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<button
				onclick={onClose}
				class="print-hidden absolute top-4 right-4 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xl font-black text-black transition-colors hover:text-blue-600"
				aria-label="Đóng"
			>
				×
			</button>

			<div class="overflow-y-auto p-5 md:p-7 print:overflow-visible">
				<header class="pr-10">
					<p class="text-xs font-black text-zinc-500">Tháng {invoice.month}</p>
					<div class="mt-1 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<div>
							<h2 class="text-2xl font-black text-blue-600 md:text-4xl">
								{invoice.id}
							</h2>
							<p class="mt-1 text-sm font-bold text-zinc-600">
								{invoice.room.property.name} · {invoice.roomNumber} · {invoice.tenantName}
							</p>
						</div>
						<span
							class="w-fit rounded-full border border-black px-3 py-1 text-xs font-black {invoiceStatusTagClass(
								invoice.status
							)}"
						>
							{invoiceStatusLabel(invoice.status)}
						</span>
					</div>
				</header>

				<div class="mt-6 grid gap-4 border-y border-zinc-200 py-4 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<p class="text-xs font-bold text-zinc-500">Tổng tiền</p>
						<p class="mt-1 text-lg font-black text-black">
							{formatInvoiceCurrency(invoice.totalAmount)}
						</p>
					</div>
					<div>
						<p class="text-xs font-bold text-zinc-500">Đã trả</p>
						<p class="mt-1 text-lg font-black text-green-600">
							{formatInvoiceCurrency(invoice.paidAmount)}
						</p>
					</div>
					<div>
						<p class="text-xs font-bold text-zinc-500">Còn nợ</p>
						<p class="mt-1 text-lg font-black {debt > 0 ? 'text-red-600' : 'text-green-600'}">
							{formatInvoiceCurrency(debt)}
						</p>
					</div>
					<div>
						<p class="text-xs font-bold text-zinc-500">Hạn đóng</p>
						<p class="mt-1 text-lg font-black text-black">{formatDate(invoice.dueDate)}</p>
					</div>
				</div>

				<section class="mt-6">
					<h3 class="text-sm font-black text-black">Khoản thu</h3>
					<div class="mt-2 overflow-hidden border-y border-zinc-200">
						<table class="w-full border-collapse text-sm">
							<thead>
								<tr class="text-xs font-black text-blue-600">
									<th class="py-3 pr-4 text-left">Nội dung</th>
									<th class="py-3 pl-4 text-right">Thành tiền</th>
								</tr>
							</thead>
							<tbody>
								{#each invoice.items as item}
									<tr class="border-t border-zinc-200 font-semibold text-black">
										<td class="py-3 pr-4">
											<div class="font-black">{item.name}</div>
											{#if item.details}
												<div class="mt-0.5 text-xs font-bold text-zinc-500">{item.details}</div>
											{/if}
										</td>
										<td class="py-3 pl-4 text-right font-black">
											{formatInvoiceNumber(item.amount)}đ
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>

				{#if !isPaid}
					<section class="mt-6 space-y-3">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 class="text-sm font-black text-black">Thanh toán</h3>
								<p class="mt-1 text-xs font-bold text-zinc-500">
									Link/QR lấy từ flow PayOS hoặc VietQR chuẩn của hệ thống.
								</p>
							</div>
							{#if onCreatePaymentLink && !paymentInfo}
								<button
									type="button"
									onclick={onCreatePaymentLink}
									disabled={isCreatingPaymentLink}
									class="modal-action w-full rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-black text-black shadow-secondary sm:w-auto"
								>
									<span class="modal-action-label">
										{isCreatingPaymentLink
											? 'Đang lấy...'
											: payosCheckoutUrl
												? 'Cập nhật link thanh toán'
												: 'Lấy thông tin thanh toán'}
									</span>
								</button>
							{/if}
						</div>

						{#if isCreatingPaymentLink}
							<div class="flex items-center gap-2 text-sm font-bold text-zinc-600">
								<Loader2 class="h-4 w-4 animate-spin" />
								Đang tạo link thanh toán...
							</div>
						{:else if paymentError}
							<p class="text-sm font-black text-red-600">{paymentError}</p>
						{:else if paymentInfo?.provider === 'vietqr'}
							<div class="grid gap-4 border-y border-zinc-200 py-4 md:grid-cols-[140px_1fr]">
								{#if paymentInfo.qrImageUrl}
									<img
										src={paymentInfo.qrImageUrl}
										alt="QR thanh toán"
										class="h-32 w-32 border-2 border-black bg-white object-contain"
									/>
								{/if}
								<div class="grid gap-2 text-sm font-bold text-black sm:grid-cols-2">
									<div>
										<p class="text-xs text-zinc-500">Ngân hàng</p>
										<p>{paymentInfo.bankName ?? '--'}</p>
									</div>
									<div>
										<p class="text-xs text-zinc-500">Số tài khoản</p>
										<p>{paymentInfo.accountNumber ?? '--'}</p>
									</div>
									<div>
										<p class="text-xs text-zinc-500">Chủ tài khoản</p>
										<p>{paymentInfo.accountName ?? '--'}</p>
									</div>
									<div>
										<p class="text-xs text-zinc-500">Số tiền</p>
										<p class="text-green-600">{formatInvoiceCurrency(paymentAmount)}</p>
									</div>
									<div class="sm:col-span-2">
										<p class="text-xs text-zinc-500">Nội dung chuyển khoản</p>
										<p class="font-mono text-blue-600">{paymentDescription}</p>
									</div>
								</div>
							</div>
						{:else if paymentInfo?.provider === 'payos' || payosCheckoutUrl}
							<div
								class="flex flex-col gap-3 border-y border-zinc-200 py-4 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p class="text-sm font-black text-black">PayOS</p>
									<p class="mt-1 text-xs font-bold text-zinc-500">
										Thanh toán qua link PayOS, webhook sẽ tự đối soát khi tiền về.
									</p>
								</div>
								{#if payosCheckoutUrl}
									<a
										href={payosCheckoutUrl}
										target="_blank"
										rel="noreferrer"
										class="modal-action rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-center text-sm font-black text-black shadow-secondary"
									>
										<span class="modal-action-label">Mở PayOS</span>
									</a>
								{/if}
							</div>
						{:else}
							<p class="text-sm font-bold text-zinc-500">
								Chưa lấy thông tin thanh toán cho hóa đơn này.
							</p>
						{/if}
					</section>
				{/if}

				{#if invoice.paymentProofImage}
					<section class="mt-6">
						<h3 class="text-sm font-black text-black">Ảnh bill khách gửi</h3>
						<img
							src={invoice.paymentProofImage}
							alt="Bill thanh toán"
							class="mt-3 max-h-72 rounded-[6px] border-2 border-black bg-white object-contain"
						/>
						<p class="mt-2 text-xs font-bold text-zinc-500">
							Đối soát đúng tài khoản nhận tiền trước khi xác nhận thanh toán.
						</p>
					</section>
				{/if}

				<footer
					class="print-hidden mt-6 flex flex-col gap-2 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<button type="button" onclick={printInvoice} class="roomio-button-white text-sm">
						In hóa đơn
					</button>

					<div class="flex flex-col gap-2 sm:flex-row">
						{#if onDelete}
							<button
								type="button"
								onclick={onDelete}
								disabled={isDeleting || isConfirming}
								class="rounded-[6px] px-4 py-2 text-sm font-black text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
							>
								{isDeleting ? 'Đang xóa...' : 'Xóa'}
							</button>
						{/if}

						{#if !isPaid && onConfirmPayment}
							<button
								type="button"
								onclick={onConfirmPayment}
								disabled={isConfirming || isDeleting}
								class="modal-action rounded-[6px] border-2 border-black bg-blue-300 px-5 py-2.5 text-sm font-black text-black shadow-secondary disabled:opacity-50"
							>
								<span class="modal-action-label">
									{isConfirming ? 'Đang xác nhận...' : 'Xác nhận đã nhận tiền'}
								</span>
							</button>
						{:else if isPaid}
							<div class="rounded-[6px] bg-green-50 px-4 py-2 text-sm font-black text-green-700">
								Đã đóng ngày {formatDate(invoice.paidDate)}
							</div>
						{/if}
					</div>
				</footer>
			</div>
		</section>
	</div>
{/if}

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes scale-up {
		from {
			transform: scale(0.98);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media print {
		:global(body > *) {
			visibility: hidden;
		}

		:global(#invoice-detail-modal),
		:global(#invoice-detail-modal *) {
			visibility: visible;
		}

		:global(.invoice-modal-overlay) {
			position: fixed !important;
			inset: 0 !important;
			background: white !important;
			backdrop-filter: none !important;
			padding: 0 !important;
		}

		:global(.invoice-modal-content) {
			position: absolute !important;
			top: 0 !important;
			left: 0 !important;
			width: 100% !important;
			max-width: 100% !important;
			max-height: none !important;
			border: none !important;
			border-radius: 0 !important;
		}

		:global(.print-hidden) {
			display: none !important;
		}

		@page {
			size: A4;
			margin: 1cm;
		}
	}
</style>
