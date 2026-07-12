<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		Loader2,
		ArrowLeft,
		FileText,
		CheckCircle2,
		Trash2,
		Eye,
		Sparkles
	} from '@lucide/svelte';
	import InvoiceDetailModal from '$lib/InvoiceDetailModal.svelte';
	import type { Invoice } from '$lib/invoice-detail';
	import { formatInvoiceCurrency } from '$lib/invoice-detail';

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let isWorking = $state(false);
	let drafts = $state<Invoice[]>([]);
	let selectedIds = $state<string[]>([]);
	let detailInvoice = $state<Invoice | null>(null);
	let isDetailOpen = $state(false);

	const allSelected = $derived(drafts.length > 0 && selectedIds.length === drafts.length);
	const totalSelected = $derived(
		drafts.filter((d) => selectedIds.includes(d.id)).reduce((sum, d) => sum + d.totalAmount, 0)
	);

	// Gom nhóm theo tháng + tòa nhà cho dễ nhìn
	const groups = $derived(() => {
		const map = new Map<string, { label: string; items: Invoice[] }>();
		for (const inv of drafts) {
			const propName = inv.room?.property?.name ?? 'Tòa nhà';
			const key = `${inv.month}__${propName}`;
			if (!map.has(key)) map.set(key, { label: `Tháng ${inv.month} · ${propName}`, items: [] });
			map.get(key)!.items.push(inv);
		}
		return [...map.values()];
	});

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchDrafts();
	});

	async function fetchDrafts() {
		if (!landlordId) return;
		isLoading = true;
		try {
			const res = await fetch(`/api/invoices?landlordId=${landlordId}&status=draft`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tải hóa đơn nháp');
			drafts = data;
			selectedIds = selectedIds.filter((id) => drafts.some((d) => d.id === id));
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			isLoading = false;
		}
	}

	function toggle(id: string) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id];
	}
	function toggleAll() {
		selectedIds = allSelected ? [] : drafts.map((d) => d.id);
	}
	function selectGroup(items: Invoice[]) {
		const ids = items.map((i) => i.id);
		const allIn = ids.every((id) => selectedIds.includes(id));
		selectedIds = allIn
			? selectedIds.filter((id) => !ids.includes(id))
			: [...new Set([...selectedIds, ...ids])];
	}

	async function approve(ids: string[]) {
		if (!ids.length || isWorking) return;
		const confirmed = await confirmPopup({
			title: `Duyệt & gửi ${ids.length} hóa đơn?`,
			message:
				'Hóa đơn sẽ chuyển sang "chưa thanh toán", tính vào công nợ phòng và khách thuê sẽ thấy. Không thể hoàn tác hàng loạt.',
			confirmLabel: 'Duyệt & gửi',
			tone: 'default'
		});
		if (!confirmed) return;

		isWorking = true;
		try {
			const res = await fetch('/api/invoices/draft-approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi duyệt hóa đơn');
			toast.success(`Đã duyệt & gửi ${data.count} hóa đơn cho khách!`);
			selectedIds = [];
			await fetchDrafts();
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			isWorking = false;
		}
	}

	async function remove(ids: string[]) {
		if (!ids.length || isWorking) return;
		const confirmed = await confirmPopup({
			title: `Xóa ${ids.length} hóa đơn nháp?`,
			message: 'Nháp bị xóa sẽ được hệ thống soạn lại ở kỳ chạy sau nếu phòng vẫn đủ điều kiện.',
			confirmLabel: 'Xóa nháp',
			tone: 'danger'
		});
		if (!confirmed) return;

		isWorking = true;
		try {
			const res = await fetch('/api/invoices', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi xóa hóa đơn nháp');
			toast.success(`Đã xóa ${data.count} nháp`);
			selectedIds = [];
			await fetchDrafts();
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			isWorking = false;
		}
	}

	function openDetail(inv: Invoice) {
		detailInvoice = inv;
		isDetailOpen = true;
	}
</script>

<div class="space-y-5">
	<div class="flex items-center gap-3">
		<a
			href="/dashboard/invoices"
			class="shrink-0 cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all hover:bg-zinc-100"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-black text-black">
				<Sparkles class="h-6 w-6" /> Hóa đơn nháp chờ duyệt
			</h1>
			<p class="mt-0.5 text-sm font-bold text-zinc-600">
				Hệ thống tự soạn sẵn cho phòng đã đủ chỉ số. Nháp chưa tính nợ & khách chưa thấy — duyệt để
				gửi.
			</p>
		</div>
	</div>

	{#if isLoading}
		<div class="flex justify-center py-16">
			<Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
		</div>
	{:else if drafts.length === 0}
		<div class="rounded-lg border-2 border-black bg-white p-10 text-center shadow-secondary">
			<FileText class="mx-auto h-8 w-8 text-zinc-400" />
			<p class="mt-2 font-black text-zinc-500">Chưa có hóa đơn nháp nào</p>
			<p class="mt-1 text-sm font-semibold text-zinc-500">
				Đầu mỗi kỳ, hệ thống tự soạn nháp cho các phòng đã đủ chỉ số đã duyệt. Phòng cần xem thì lập
				ở màn
				<a href="/dashboard/invoices/bulk" class="font-black text-blue-600 underline"
					>Tạo hóa đơn hàng loạt</a
				>.
			</p>
		</div>
	{:else}
		<!-- Thanh hành động hàng loạt -->
		<div
			class="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-black bg-white p-3 shadow-secondary"
		>
			<label class="flex cursor-pointer items-center gap-2 text-sm font-black text-black">
				<input
					type="checkbox"
					checked={allSelected}
					onchange={toggleAll}
					class="h-4 w-4 accent-blue-500"
				/>
				Chọn tất cả ({drafts.length})
				{#if selectedIds.length}
					<span class="text-zinc-500"
						>· đã chọn {selectedIds.length} · {formatInvoiceCurrency(totalSelected)}</span
					>
				{/if}
			</label>
			<div class="flex gap-2">
				<button
					type="button"
					disabled={isWorking || selectedIds.length === 0}
					onclick={() => remove(selectedIds)}
					class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black text-red-700 shadow-secondary transition-all hover:bg-red-100 disabled:opacity-40"
				>
					<Trash2 class="h-4 w-4" /> Xóa ({selectedIds.length})
				</button>
				<button
					type="button"
					disabled={isWorking || selectedIds.length === 0}
					onclick={() => approve(selectedIds)}
					class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-green-300 px-4 py-2 text-sm font-black text-black shadow-primary transition-all hover:bg-green-400 disabled:opacity-40"
				>
					{#if isWorking}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<CheckCircle2 class="h-4 w-4" />
					{/if}
					Duyệt & gửi ({selectedIds.length})
				</button>
			</div>
		</div>

		{#each groups() as group (group.label)}
			<div class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
				<div
					class="flex items-center justify-between border-b-2 border-black bg-zinc-50 px-4 py-2.5"
				>
					<span class="text-sm font-black text-black">{group.label}</span>
					<button
						type="button"
						onclick={() => selectGroup(group.items)}
						class="cursor-pointer text-xs font-black text-blue-600 underline"
					>
						Chọn nhóm ({group.items.length})
					</button>
				</div>
				<div class="divide-y divide-black/10">
					{#each group.items as inv (inv.id)}
						<div class="flex flex-wrap items-center gap-3 px-4 py-3">
							<input
								type="checkbox"
								checked={selectedIds.includes(inv.id)}
								onchange={() => toggle(inv.id)}
								class="h-4 w-4 accent-blue-500"
							/>
							<div class="min-w-0 flex-1">
								<div class="font-black text-black">
									Phòng {inv.roomNumber} · {inv.tenantName}
								</div>
								<div class="text-xs font-bold text-zinc-500">
									{inv.items.length} khoản · hạn {inv.dueDate}
								</div>
							</div>
							<div class="text-right font-black text-black">
								{formatInvoiceCurrency(inv.totalAmount)}
							</div>
							<button
								type="button"
								onclick={() => openDetail(inv)}
								class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-black shadow-secondary hover:bg-zinc-100"
							>
								<Eye class="h-3.5 w-3.5" /> Xem
							</button>
							<button
								type="button"
								disabled={isWorking}
								onclick={() => approve([inv.id])}
								class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-green-200 px-2.5 py-1.5 text-xs font-black shadow-secondary hover:bg-green-300 disabled:opacity-40"
							>
								<CheckCircle2 class="h-3.5 w-3.5" /> Duyệt
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>

{#if detailInvoice}
	<InvoiceDetailModal
		invoice={detailInvoice}
		isOpen={isDetailOpen}
		onClose={() => {
			isDetailOpen = false;
			detailInvoice = null;
		}}
	/>
{/if}
