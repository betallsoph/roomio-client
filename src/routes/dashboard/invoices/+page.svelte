<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		X,
		Check,
		Trash2,
		Loader2,
		AlertTriangle,
		Eye,
		Calendar,
		FileText
	} from '@lucide/svelte';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	interface InvoiceItem {
		id: string;
		name: string;
		amount: number;
		details: string | null;
	}

	interface Invoice {
		id: string;
		roomId: string;
		roomNumber: string;
		tenantName: string;
		tenantPhone: string;
		month: string;
		rentAmount: number;
		totalAmount: number;
		dueDate: string;
		paidDate: string | null;
		status: string; // 'paid' | 'pending' | 'overdue' | 'partial'
		paidAmount: number;
		paymentProofImage: string | null;
		createdAt: string;
		notes: string | null;
		items: InvoiceItem[];
		room: {
			property: {
				name: string;
				shortName: string;
			};
		};
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let invoices = $state<Invoice[]>([]);
	let selectedInvoice = $state<Invoice | null>(null);
	let isDetailOpen = $state(false);

	// Filters
	let statusFilter = $state('');
	let monthFilter = $state('');
	let searchRoom = $state('');

	let isConfirming = $state(false);
	let isDeleting = $state(false);
	let selectedInvoiceIds = $state<string[]>([]);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchInvoices(session.landlordProfileId);
	});

	async function fetchInvoices(profileId: string) {
		isLoading = true;
		try {
			const url = `/api/invoices?landlordId=${profileId}`;
			const res = await fetch(url);
			const data = await res.json();
			if (res.ok) invoices = data;
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách hóa đơn: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function confirmPayment(invoiceId: string) {
		if (isConfirming) return;
		isConfirming = true;

		try {
			const res = await fetch(`/api/invoices/${invoiceId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'confirmPaid' })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi xác nhận đóng tiền');

			toast.success('Đã xác nhận thanh toán hóa đơn thành công!');
			isDetailOpen = false;
			selectedInvoice = null;
			if (landlordId) fetchInvoices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isConfirming = false;
		}
	}

	async function deleteInvoice(invoiceId: string) {
		if (
			!(await confirmPopup({
				title: 'Xóa hóa đơn',
				message: 'Bạn có chắc chắn muốn xóa hóa đơn này? Số nợ của phòng sẽ tự động giảm đi.',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;
		isDeleting = true;

		try {
			const res = await fetch(`/api/invoices/${invoiceId}`, {
				method: 'DELETE'
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa hóa đơn');

			toast.success('Đã xóa hóa đơn thành công');
			isDetailOpen = false;
			selectedInvoice = null;
			if (landlordId) fetchInvoices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isDeleting = false;
		}
	}

	async function deleteSelectedInvoices() {
		if (selectedInvoiceIds.length === 0 || isDeleting) return;
		if (
			!(await confirmPopup({
				title: 'Xóa hóa đơn đã chọn',
				message: `Bạn có chắc muốn xóa ${selectedInvoiceIds.length} hóa đơn đã chọn? Công nợ phòng sẽ được cập nhật lại.`,
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;
		isDeleting = true;

		try {
			const res = await fetch('/api/invoices', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: selectedInvoiceIds })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa hóa đơn hàng loạt');

			toast.success(`Đã xóa ${data.count} hóa đơn`);
			selectedInvoiceIds = [];
			if (landlordId) fetchInvoices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isDeleting = false;
		}
	}

	function toggleInvoiceSelection(invoiceId: string) {
		selectedInvoiceIds = selectedInvoiceIds.includes(invoiceId)
			? selectedInvoiceIds.filter((id) => id !== invoiceId)
			: [...selectedInvoiceIds, invoiceId];
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}

	// Filtered invoices computed state
	const filteredInvoices = $derived(() => {
		return invoices.filter((inv) => {
			const matchStatus = statusFilter === '' || inv.status === statusFilter;
			const matchMonth = monthFilter === '' || inv.month === monthFilter;
			const matchRoom =
				searchRoom === '' ||
				inv.roomNumber.toLowerCase().includes(searchRoom.toLowerCase()) ||
				inv.tenantName.toLowerCase().includes(searchRoom.toLowerCase());
			return matchStatus && matchMonth && matchRoom;
		});
	});
</script>

<div class="space-y-6">
	<div class="flex justify-start">
		<a
			href="/dashboard/invoices/bulk"
			class="toolbar-action flex w-full cursor-pointer items-center justify-center rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-[transform,box-shadow] sm:w-auto"
		>
			<span class="toolbar-action-label">Tạo hóa đơn loạt</span>
		</a>
	</div>

	{#if selectedInvoiceIds.length > 0}
		<div
			class="flex flex-col justify-between gap-3 rounded-lg border-2 border-black bg-red-50 p-3 shadow-secondary sm:flex-row sm:items-center"
		>
			<p class="text-sm font-black text-black">Đã chọn {selectedInvoiceIds.length} hóa đơn</p>
			<div class="flex gap-2">
				<button
					onclick={() => (selectedInvoiceIds = [])}
					class="rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black text-black"
				>
					Bỏ chọn
				</button>
				<button
					onclick={deleteSelectedInvoices}
					disabled={isDeleting}
					class="rounded-[6px] border-2 border-black bg-red-200 px-3 py-2 text-xs font-black text-red-800 shadow-secondary disabled:opacity-50"
				>
					Xóa đã chọn
				</button>
			</div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="grid items-end gap-4 sm:grid-cols-3">
		<div class="space-y-1">
			<span class="block text-[10px] font-black text-zinc-500">Trạng thái thanh toán</span>
			<RoomioSelect
				bind:value={statusFilter}
				options={[
					{ value: '', label: 'Tất cả hóa đơn' },
					{ value: 'pending', label: 'Chưa thanh toán' },
					{ value: 'paid', label: 'Đã thanh toán' },
					{ value: 'overdue', label: 'Trễ hạn' }
				]}
			/>
		</div>

		<div class="space-y-1">
			<span class="block text-[10px] font-black text-zinc-500">Lọc theo Tháng</span>
			<input
				type="month"
				bind:value={monthFilter}
				class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none"
			/>
		</div>

		<div class="space-y-1">
			<span class="block text-[10px] font-black text-zinc-500">Tìm theo số phòng/tên khách</span>
			<input
				type="text"
				bind:value={searchRoom}
				placeholder="Nhập 101, A2, Tên khách..."
				class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none"
			/>
		</div>
	</div>

	{#if isLoading}
		<div class="flex h-[50vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if filteredInvoices().length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">Không tìm thấy hóa đơn nào</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					Không có hóa đơn nào trùng khớp với bộ lọc hiện tại.
				</p>
			</div>
		</div>
	{:else}
		<!-- Invoices List -->
		<div class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
			<!-- Mobile: card list -->
			<div class="divide-y-2 divide-black sm:hidden">
				{#each filteredInvoices() as invoice}
					<div class="space-y-2 p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm font-black text-black">
									{invoice.room.property.shortName} - P.{invoice.roomNumber}
								</p>
								<p class="mt-0.5 truncate text-xs font-bold text-zinc-500">
									{invoice.tenantName} · T.{invoice.month}
								</p>
							</div>
							<span class="shrink-0 text-sm font-black text-black"
								>{formatCurrency(invoice.totalAmount)}</span
							>
						</div>
						<div class="flex items-center justify-between gap-2">
							<label class="flex items-center gap-2 text-[10px] font-black text-zinc-600">
								<input
									type="checkbox"
									checked={selectedInvoiceIds.includes(invoice.id)}
									onchange={() => toggleInvoiceSelection(invoice.id)}
								/>
								Chọn
							</label>
							<span
								class="shrink-0 rounded-full border border-black px-2 py-0.5 text-[10px] font-black {invoice.status ===
								'paid'
									? 'bg-green-200 text-green-800'
									: 'bg-red-200 text-red-800'}"
							>
								{invoice.status === 'paid' ? 'Đã đóng' : 'Chưa đóng'}
							</span>
							<button
								onclick={() =>
									window.setTimeout(() => {
										selectedInvoice = invoice;
										isDetailOpen = true;
									}, 200)}
								class="cursor-pointer rounded-lg border-2 border-black bg-white p-1.5 text-black shadow-secondary transition-all"
							>
								<Eye class="h-4 w-4" />
							</button>
						</div>
					</div>
				{/each}
			</div>
			<!-- Desktop: table -->
			<div class="hidden overflow-x-auto sm:block">
				<table class="w-full border-collapse text-left text-sm">
					<thead>
						<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
							<th class="w-10 px-4 py-3">
								<span class="sr-only">Chọn</span>
							</th>
							<th class="px-4 py-3">Mã Hóa Đơn</th>
							<th class="px-4 py-3">Nhà / Phòng</th>
							<th class="px-4 py-3">Khách thuê</th>
							<th class="px-4 py-3">Tháng</th>
							<th class="px-4 py-3">Tổng tiền</th>
							<th class="px-4 py-3">Trạng thái</th>
							<th class="px-4 py-3">Ảnh bill</th>
							<th class="px-4 py-3 text-right">Chi tiết</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredInvoices() as invoice}
							<tr
								class="border-b border-zinc-200 font-semibold text-zinc-600 transition-colors hover:bg-slate-50"
							>
								<td class="px-4 py-4">
									<input
										type="checkbox"
										checked={selectedInvoiceIds.includes(invoice.id)}
										onchange={() => toggleInvoiceSelection(invoice.id)}
										class="h-4 w-4"
									/>
								</td>
								<td class="px-4 py-4 font-mono font-black text-blue-600">{invoice.id}</td>
								<td class="px-4 py-4 font-black text-black">
									{invoice.room.property.shortName} - {invoice.roomNumber}
								</td>
								<td class="px-4 py-4 font-bold text-zinc-800">{invoice.tenantName}</td>
								<td class="px-4 py-4 font-bold">{invoice.month}</td>
								<td class="px-4 py-4 font-black text-black"
									>{formatCurrency(invoice.totalAmount)}</td
								>
								<td class="px-4 py-4">
									<span
										class="rounded-full border border-black px-2.5 py-0.5 text-[9px] font-black {invoice.status ===
										'paid'
											? 'bg-green-200 text-green-800'
											: 'bg-red-200 text-red-800'}"
									>
										{invoice.status === 'paid' ? 'Đã đóng' : 'Chưa đóng'}
									</span>
								</td>
								<td class="px-4 py-4">
									{#if invoice.paymentProofImage}
										<span
											class="flex w-fit items-center gap-1 rounded-full border border-black bg-amber-200 px-2 py-0.5 text-[9px] font-black text-amber-800"
										>
											<FileText class="h-3 w-3" />
											Có bill
										</span>
									{:else}
										<span class="text-xs text-zinc-400">--</span>
									{/if}
								</td>
								<td class="px-4 py-4 text-right">
									<button
										onclick={() =>
											window.setTimeout(() => {
												selectedInvoice = invoice;
												isDetailOpen = true;
											}, 200)}
										class="hover:bg-zinc-150 cursor-pointer rounded-lg border-2 border-black bg-white p-1.5 text-black shadow-secondary transition-colors"
									>
										<Eye class="h-4 w-4" />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Detail Dialog Modal -->
	{#if isDetailOpen && selectedInvoice}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex animate-[fade-in_0.2s_ease-out] items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isDetailOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isDetailOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Dialog Content -->
			<div
				class="relative flex max-h-[90vh] w-full max-w-2xl animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Chi tiết hóa đơn</span>
					<button
						onclick={() => (isDetailOpen = false)}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<div class="space-y-4 overflow-y-auto p-6">
					<!-- Meta info columns -->
					<div
						class="grid grid-cols-2 gap-4 rounded-lg border-2 border-black bg-white p-4 text-sm font-semibold text-black shadow-secondary"
					>
						<div>
							<p class="text-xs font-black text-zinc-500">Tòa nhà / Số phòng</p>
							<p class="mt-1 font-bold text-black">
								{selectedInvoice.room.property.name} - Phòng {selectedInvoice.roomNumber}
							</p>
						</div>
						<div>
							<p class="text-xs font-black text-zinc-500">Khách thuê phòng</p>
							<p class="mt-1 font-bold text-black">
								{selectedInvoice.tenantName} ({selectedInvoice.tenantPhone})
							</p>
						</div>
						<div>
							<p class="text-xs font-black text-zinc-500">Tháng hóa đơn</p>
							<p class="mt-1 flex items-center gap-1 font-bold text-black">
								<Calendar class="h-4 w-4 text-zinc-500" />
								Tháng {selectedInvoice.month}
							</p>
						</div>
						<div>
							<p class="text-xs font-black text-zinc-500">Hạn đóng tiền</p>
							<p class="text-red-650 mt-1 font-black">
								{new Date(selectedInvoice.dueDate).toLocaleDateString('vi-VN')}
							</p>
						</div>
					</div>

					<!-- Bill Line Items -->
					<div class="space-y-2">
						<h3 class="text-xs font-black text-zinc-500">Các mục thanh toán</h3>
						<div
							class="divide-y divide-black/15 overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
						>
							{#each selectedInvoice.items as item}
								<div class="flex items-center justify-between p-3 text-sm font-semibold">
									<div>
										<p class="font-bold text-black">{item.name}</p>
										{#if item.details}
											<p class="mt-0.5 text-xs font-bold text-zinc-500 italic">{item.details}</p>
										{/if}
									</div>
									<span class="font-bold text-zinc-800">{formatCurrency(item.amount)}</span>
								</div>
							{/each}
							<!-- Total Row -->
							<div
								class="flex items-center justify-between border-t-2 border-black bg-zinc-50 p-4 text-sm"
							>
								<span class="text-base font-black text-black">Tổng số tiền cần đóng</span>
								<span class="text-blue-650 text-lg font-black"
									>{formatCurrency(selectedInvoice.totalAmount)}</span
								>
							</div>
						</div>
					</div>

					<!-- Tenant Submitted Proof -->
					{#if selectedInvoice.paymentProofImage}
						<div class="space-y-2">
							<h3 class="flex items-center gap-1 text-xs font-black text-zinc-500">
								Ảnh chụp bill thanh toán của khách <AlertTriangle class="h-4 w-4 text-amber-500" />
							</h3>
							<div
								class="flex flex-col items-center rounded-lg border-2 border-black bg-amber-50/30 p-3 shadow-secondary"
							>
								<img
									src={selectedInvoice.paymentProofImage}
									alt="Bill thanh toan"
									class="max-h-60 rounded-lg border-2 border-black bg-white object-contain shadow-secondary"
								/>
								<p class="mt-2 text-center text-xs font-bold text-amber-900">
									Khách đã tải bill này lên. Vui lòng đối soát STK trước khi xác nhận.
								</p>
							</div>
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex gap-3 border-t-2 border-black pt-4">
						<button
							onclick={() => deleteInvoice(selectedInvoice!.id)}
							disabled={isDeleting}
							class="hover:bg-red-350 flex cursor-pointer items-center justify-center rounded-[6px] border-2 border-black bg-red-200 p-2.5 text-red-800 shadow-secondary transition-all"
							title="Xóa hóa đơn"
						>
							{#if isDeleting}
								<Loader2 class="h-5 w-5 animate-spin" />
							{:else}
								<Trash2 class="h-5 w-5" />
							{/if}
						</button>

						{#if selectedInvoice.status !== 'paid'}
							<button
								onclick={() => confirmPayment(selectedInvoice!.id)}
								disabled={isConfirming}
								class="modal-action flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-center text-xs font-black text-black shadow-secondary transition-all"
							>
								<span class="modal-action-label">Xác nhận đã nhận tiền (Đóng hóa đơn)</span>
								{#if isConfirming}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Check class="h-4.5 w-4.5" />
								{/if}
							</button>
						{:else}
							<div
								class="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 py-2.5 text-center text-xs font-black text-green-800 select-none"
							>
								Hóa đơn đã đóng vào ngày {new Date(selectedInvoice.paidDate!).toLocaleDateString(
									'vi-VN'
								)}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

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
			transform: scale(0.95);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
