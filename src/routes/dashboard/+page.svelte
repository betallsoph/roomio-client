<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Check, Loader2, Play, ArrowRight } from '@lucide/svelte';
	import { rentalTypeShortLabel, RENTAL_TYPES } from '$lib/rental-types';

	interface DashboardStats {
		totalRevenue: number;
		emptyRooms: number;
		unpaidInvoices: number;
		expiringContracts: number;
		totalRooms: number;
		occupiedRooms: number;
		roomBreakdownByRentalType?: Partial<
			Record<'APARTMENT' | 'MOTEL' | 'DORM' | 'WHOLE_UNIT', number>
		>;
	}

	interface Invoice {
		id: string;
		roomNumber: string;
		tenantName: string;
		tenantPhone: string;
		month: string;
		totalAmount: number;
		dueDate: string;
		status: string;
		room: {
			property: {
				shortName: string;
			};
		};
	}

	interface MaintenanceRequest {
		id: string;
		roomNumber: string;
		buildingName: string;
		tenant: {
			user: {
				name: string;
			};
		};
		title: string;
		status: string;
		priority: string;
		createdAt: string;
	}

	interface InboxItem {
		id: string;
		type: string;
		priority: string;
		title: string;
		description: string;
		href: string;
		createdAt: string;
	}

	interface InboxData {
		counts: Record<string, number>;
		items: InboxItem[];
	}

	let today = $state('');
	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let processingInvoiceId = $state<string | null>(null);

	let stats = $state<DashboardStats>({
		totalRevenue: 0,
		emptyRooms: 0,
		unpaidInvoices: 0,
		expiringContracts: 0,
		totalRooms: 0,
		occupiedRooms: 0
	});

	let unpaidInvoices = $state<Invoice[]>([]);
	let pendingRequests = $state<MaintenanceRequest[]>([]);
	let inbox = $state<InboxData>({ counts: {}, items: [] });

	const roomBreakdownChips = $derived.by(() => {
		const breakdown = stats.roomBreakdownByRentalType;
		if (!breakdown || Object.keys(breakdown).length === 0) return [];
		const chips = RENTAL_TYPES.filter((type) => (breakdown[type] ?? 0) > 0).map(
			(type) => [type, breakdown[type]!] as const
		);
		return chips.length >= 2 ? chips : [];
	});

	onMount(() => {
		today = new Date().toLocaleDateString('vi-VN', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});

		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) {
			goto('/login');
			return;
		}
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchDashboardData(session.landlordProfileId);
	});

	async function fetchDashboardData(profileId: string) {
		isLoading = true;
		try {
			// 1. Fetch dashboard stats
			const statsRes = await fetch(`/api/dashboard/stats?landlordId=${profileId}`);
			const statsData = await statsRes.json();
			if (statsRes.ok) stats = statsData;

			// 2. Fetch pending invoices
			const invRes = await fetch(`/api/invoices?landlordId=${profileId}&status=pending`);
			const invData = await invRes.json();
			if (invRes.ok) unpaidInvoices = invData.slice(0, 5);

			// 3. Fetch requests
			const reqRes = await fetch(`/api/requests?landlordId=${profileId}`);
			const reqData = await reqRes.json();
			if (reqRes.ok) {
				pendingRequests = reqData
					.filter((r: any) => r.status !== 'completed' && r.status !== 'rejected')
					.slice(0, 5);
			}

			// 4. Centralized operating inbox
			const inboxRes = await fetch('/api/inbox');
			const inboxData = await inboxRes.json();
			if (inboxRes.ok) inbox = inboxData;
		} catch (err: any) {
			toast.error('Không thể tải dữ liệu báo cáo: ' + err.message);
		} finally {
			isLoading = false;
		}
	}

	async function confirmInvoicePayment(invoiceId: string) {
		if (processingInvoiceId) return;
		processingInvoiceId = invoiceId;

		try {
			const res = await fetch(`/api/invoices/${invoiceId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'confirmPaid' })
			});
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Lỗi khi xác nhận đóng tiền');
			}

			toast.success(`Đã xác nhận thanh toán hóa đơn ${invoiceId}`);
			// Refresh
			if (landlordId) fetchDashboardData(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			processingInvoiceId = null;
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}
</script>

<div class="space-y-8">
	<!-- Header -->
	<section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<p
				class="flex items-center gap-1.5 text-sm leading-relaxed font-semibold text-zinc-600 sm:text-base"
			>
				Hôm nay, {today}
			</p>
		</div>
		<div class="flex gap-3">
			<a
				href="/dashboard/buildings"
				class="inline-flex items-center gap-1.5 text-sm font-bold text-blue-500 hover:underline"
			>
				Tòa nhà <ArrowRight class="h-3.5 w-3.5" />
			</a>
			<a
				href="/dashboard/invoices/bulk"
				class="inline-flex items-center gap-1.5 text-sm font-bold text-blue-500 hover:underline"
			>
				Hoá đơn loạt <Play class="h-3.5 w-3.5" />
			</a>
		</div>
	</section>

	{#if isLoading}
		<div class="flex h-[60vh] w-full items-center justify-center">
			<div class="flex flex-col items-center gap-3">
				<Loader2 class="h-10 w-10 animate-spin text-black" />
				<p class="font-bold text-zinc-600">Đang tải báo cáo tổng quan...</p>
			</div>
		</div>
	{:else}
		<!-- Mobile: compact inline stats strip (no cards) -->
		<section
			class="flex items-center gap-0 overflow-hidden rounded-lg border-2 border-black bg-white text-center sm:hidden"
		>
			<div class="flex-1 px-2 py-3">
				<p class="text-[9px] font-bold text-zinc-400">Doanh thu</p>
				<p class="mt-0.5 truncate text-xs font-black text-black">
					{formatCurrency(stats.totalRevenue)}
				</p>
			</div>
			<div class="flex-1 px-2 py-3">
				<p class="text-[9px] font-bold text-zinc-400">Lấp đầy</p>
				<p class="mt-0.5 text-xs font-black text-black">
					{stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0}%
				</p>
				{#if roomBreakdownChips.length >= 2}
					<div class="mt-1 flex flex-wrap justify-center gap-0.5">
						{#each roomBreakdownChips as [type, count] (type)}
							<span
								class="rounded-full border border-black bg-zinc-100 px-1.5 py-px text-[8px] font-bold text-zinc-700"
							>
								{rentalTypeShortLabel(type)}: {count}
							</span>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex-1 px-2 py-3">
				<p class="text-[9px] font-bold text-zinc-400">Chưa đóng</p>
				<p class="mt-0.5 text-xs font-black text-blue-500">{stats.unpaidInvoices} HĐ</p>
			</div>
			<div class="flex-1 px-2 py-3">
				<p class="text-[9px] font-bold text-zinc-400">Hết HĐ</p>
				<p class="mt-0.5 text-xs font-black text-black">{stats.expiringContracts}</p>
			</div>
		</section>

		<!-- Desktop: stat cards grid -->
		<section class="hidden sm:block">
			<h2 class="mb-4 text-lg font-bold sm:text-xl">Chỉ số chính</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<!-- Card 1: Revenue -->
				<div class="rounded-lg border-2 border-black bg-white p-4">
					<p class="text-[10px] font-bold text-zinc-500">Doanh thu</p>
					<h3 class="mt-0.5 truncate text-base font-black text-black sm:text-xl">
						{formatCurrency(stats.totalRevenue)}
					</h3>
				</div>

				<!-- Card 2: Occupancy -->
				<div class="rounded-lg border-2 border-black bg-white p-4">
					<p class="text-[10px] font-bold text-zinc-500">Tỷ lệ trống</p>
					<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">
						{stats.emptyRooms}/{stats.totalRooms}
						<span class="block text-[10px] font-bold text-zinc-400">
							Lấp đầy {stats.totalRooms > 0
								? Math.round((stats.occupiedRooms / stats.totalRooms) * 100)
								: 0}%
						</span>
					</h3>
					{#if roomBreakdownChips.length >= 2}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each roomBreakdownChips as [type, count] (type)}
								<span
									class="rounded-full border border-black bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-700"
								>
									{rentalTypeShortLabel(type)}: {count}
								</span>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Card 3: Unpaid Bills -->
				<div class="rounded-lg border-2 border-black bg-white p-4">
					<p class="text-[10px] font-bold text-zinc-500">Chưa đóng</p>
					<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">
						{stats.unpaidInvoices} HĐ
					</h3>
				</div>

				<!-- Card 4: Expiring Contracts -->
				<div class="rounded-lg border-2 border-black bg-white p-4">
					<p class="text-[10px] font-bold text-zinc-500">Sắp hết HĐ</p>
					<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">
						{stats.expiringContracts}
					</h3>
				</div>
			</div>
		</section>

		<!-- Main Lists Section -->
		<section class="grid gap-6 lg:grid-cols-3">
			<div class="roomio-window lg:col-span-3">
				<div class="roomio-window-bar !border-b-0">
					<div class="roomio-window-dots">
						<div class="roomio-window-dot bg-red-500"></div>
						<div class="roomio-window-dot bg-yellow-500"></div>
						<div class="roomio-window-dot bg-green-500"></div>
					</div>
					<h2 class="text-base font-black text-black">Việc cần xử lý</h2>
					<a
						href="/dashboard/automation"
						class="flex items-center gap-1 text-xs font-black text-blue-500 hover:underline"
					>
						Tự động hoá <ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>
				{#if inbox.items.length === 0}
					<div class="p-8 text-center">
						<p class="font-black text-black">Không có việc tồn đọng</p>
						<p class="mt-1 text-xs font-bold text-zinc-500">
							Hệ thống chưa phát hiện hóa đơn, chỉ số, hợp đồng hay sự cố cần xử lý.
						</p>
					</div>
				{:else}
					<div class="grid gap-2 p-2 md:grid-cols-2">
						{#each inbox.items.slice(0, 8) as item}
							<a href={item.href} class="block rounded-lg p-4 transition-colors hover:bg-zinc-50">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-black text-black">{item.title}</p>
										<p class="mt-1 line-clamp-2 text-xs font-bold text-zinc-600">
											{item.description}
										</p>
									</div>
									<span
										class="shrink-0 rounded-full border border-black px-2 py-0.5 text-[9px] font-black {item.priority ===
										'high'
											? 'bg-red-200 text-red-800'
											: 'bg-blue-100 text-blue-800'}"
									>
										{item.type}
									</span>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Left 2 Columns: Unpaid Invoices -->
			<div class="roomio-window flex flex-col lg:col-span-2">
				<div class="roomio-window-bar shrink-0 !border-b-0">
					<div class="roomio-window-dots">
						<div class="roomio-window-dot bg-red-500"></div>
						<div class="roomio-window-dot bg-yellow-500"></div>
						<div class="roomio-window-dot bg-green-500"></div>
					</div>
					<h2 class="text-base font-black text-black">Hoá đơn cần thu tiền</h2>
					<a
						href="/dashboard/invoices"
						class="flex items-center gap-1 text-xs font-black text-blue-500 hover:underline"
					>
						Xem tất cả <ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>

				{#if unpaidInvoices.length === 0}
					<div class="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center">
						<p class="text-base font-black text-black">Tất cả sạch nợ!</p>
						<p class="mt-1 text-xs font-semibold text-zinc-500">
							Không có hoá đơn nào đang nợ hoặc chưa đóng.
						</p>
					</div>
				{:else}
					<!-- Mobile: card list view -->
					<div class="bg-white sm:hidden">
						{#each unpaidInvoices as invoice}
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
									<span
										class="shrink-0 rounded-full border border-black bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800"
									>
										HN: {new Date(invoice.dueDate).toLocaleDateString('vi-VN')}
									</span>
									<button
										onclick={() => confirmInvoicePayment(invoice.id)}
										disabled={processingInvoiceId === invoice.id}
										class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-green-200 px-3 py-1.5 text-xs font-black text-black shadow-secondary transition-all disabled:opacity-50"
									>
										{#if processingInvoiceId === invoice.id}
											<Loader2 class="h-3 w-3 animate-spin" />
										{:else}
											Xác nhận <Check class="h-3 w-3" />
										{/if}
									</button>
								</div>
							</div>
						{/each}
					</div>
					<!-- Desktop: table view -->
					<div class="hidden overflow-x-auto bg-white sm:block">
						<table class="w-full border-collapse text-left text-sm">
							<thead>
								<tr class="bg-blue-300 text-xs font-black text-black">
									<th class="px-4 py-3">Phòng</th>
									<th class="px-4 py-3">Khách thuê</th>
									<th class="px-4 py-3">Tháng</th>
									<th class="px-4 py-3">Số tiền</th>
									<th class="px-4 py-3">Hạn thanh toán</th>
									<th class="px-4 py-3 text-right">Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{#each unpaidInvoices as invoice}
									<tr class="font-semibold transition-all hover:bg-slate-50">
										<td class="px-4 py-4 font-black text-black">
											{invoice.room.property.shortName} - {invoice.roomNumber}
										</td>
										<td class="px-4 py-4">
											<div>
												<p class="text-sm font-black text-black">{invoice.tenantName}</p>
												<p class="text-xs font-bold text-zinc-500">{invoice.tenantPhone}</p>
											</div>
										</td>
										<td class="px-4 py-4 font-bold">{invoice.month}</td>
										<td class="px-4 py-4 font-black text-black"
											>{formatCurrency(invoice.totalAmount)}</td
										>
										<td class="px-4 py-4">
											<span
												class="rounded-full border border-black bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800"
											>
												{new Date(invoice.dueDate).toLocaleDateString('vi-VN')}
											</span>
										</td>
										<td class="px-4 py-4 text-right">
											<button
												onclick={() => confirmInvoicePayment(invoice.id)}
												disabled={processingInvoiceId === invoice.id}
												class="ml-auto flex cursor-pointer items-center justify-center gap-1 rounded-[6px] border-2 border-black bg-green-200 px-3 py-1.5 text-xs font-black text-black shadow-secondary transition-all hover:bg-green-300 disabled:opacity-50"
											>
												Xác nhận đóng
												{#if processingInvoiceId === invoice.id}
													<Loader2 class="h-3 w-3 animate-spin" />
												{:else}
													<Check class="h-3.5 w-3.5" />
												{/if}
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Right Column: Pending Incidents -->
			<div class="roomio-window flex flex-col">
				<div class="roomio-window-bar shrink-0 !border-b-0">
					<div class="roomio-window-dots">
						<div class="roomio-window-dot bg-red-500"></div>
						<div class="roomio-window-dot bg-yellow-500"></div>
						<div class="roomio-window-dot bg-green-500"></div>
					</div>
					<h2 class="text-base font-black text-black">Sự cố cần xử lý</h2>
					<a
						href="/dashboard/requests"
						class="flex items-center gap-1 text-xs font-black text-blue-500 hover:underline"
					>
						Xem tất cả <ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>

				{#if pendingRequests.length === 0}
					<div class="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center">
						<p class="text-base font-black text-black">Không có sự cố nào!</p>
						<p class="mt-1 text-xs font-semibold text-zinc-500">
							Nhà trọ vận hành êm đẹp, chưa ghi nhận vấn đề.
						</p>
					</div>
				{:else}
					<div class="flex-1 overflow-y-auto bg-white">
						{#each pendingRequests as req}
							<div class="flex flex-col gap-2 p-4 font-semibold transition-all hover:bg-slate-50">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h4 class="text-sm font-black text-black">{req.title}</h4>
										<p class="mt-0.5 text-xs font-bold text-zinc-500">
											{req.buildingName} - Phòng {req.roomNumber}
										</p>
									</div>
									<span
										class="rounded-full border border-black px-2 py-0.5 text-[10px] font-black {req.priority ===
										'important'
											? 'bg-red-200 text-red-800'
											: 'bg-zinc-150 text-zinc-700'}"
									>
										{req.priority === 'important' ? 'Khẩn cấp' : 'Thường'}
									</span>
								</div>
								<div class="mt-1 flex items-center justify-between text-xs font-bold text-zinc-500">
									<span>{req.tenant.user.name}</span>
									<span>{new Date(req.createdAt).toLocaleDateString('vi-VN')}</span>
								</div>
								<div class="mt-2 flex gap-2">
									<a
										href="/dashboard/requests"
										class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-3 py-1.5 text-center text-xs font-black text-black shadow-secondary transition-all hover:bg-blue-400"
									>
										Chi tiết & Phân công <ArrowRight class="h-3.5 w-3.5" />
									</a>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
