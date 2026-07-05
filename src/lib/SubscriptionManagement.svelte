<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Loader2, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';

	type Period = 'MONTHLY' | 'YEARLY';

	interface Quote {
		tier: string;
		recommendedTier: string;
		period: Period;
		strategy: 'POOLED' | 'SPLIT';
		monthlyPrice: number | null;
		periodPrice: number | null;
		pooledMonthlyPrice: number | null;
		splitMonthlyPrice: number | null;
		roomCount: number;
		standardRoomCount: number;
		colivingRoomCount: number;
		overCapacity: boolean;
		splitEligible: boolean;
		activeSubscription: {
			tier: string;
			period: Period;
			validUntil: string | null;
			enabledRentalTypes: string[];
			standardRoomLimit: number | null;
			colivingRoomLimit: number | null;
		};
		actualRoomCounts: { standard: number; coliving: number };
	}

	interface ChangeRequest {
		id: string;
		requestedTier: string;
		requestedPeriod: Period;
		requestedRentalTypes: string | null;
		requestedRoomAdditions: string | null;
		standardRoomCount: number;
		colivingRoomCount: number;
		quotedPeriodPrice: number | null;
		status: 'pending' | 'approved' | 'rejected' | 'cancelled';
		note: string | null;
		adminNote: string | null;
		createdAt: string;
	}

	const TIER_OPTIONS = [
		{ value: 'FREE', label: 'Free', minRooms: 0, maxRooms: 3 },
		{ value: 'ROOMS_4_10', label: '4–10 phòng', minRooms: 4, maxRooms: 10 },
		{ value: 'ROOMS_11_25', label: '11–25 phòng', minRooms: 11, maxRooms: 25 },
		{ value: 'ROOMS_26_50', label: '26–50 phòng', minRooms: 26, maxRooms: 50 },
		{ value: 'ROOMS_51_80', label: '51–80 phòng', minRooms: 51, maxRooms: 80 },
		{ value: 'ROOMS_81_100', label: '81–100 phòng', minRooms: 81, maxRooms: 100 },
		{ value: 'ROOMS_101_150', label: '101–150 phòng', minRooms: 101, maxRooms: 150 },
		{ value: 'ROOMS_151_PLUS', label: 'Trên 150 phòng', minRooms: 151, maxRooms: null }
	];
	const RENTAL_TYPE_OPTIONS = [
		{
			value: 'APARTMENT',
			label: 'Share phòng chung cư / Co-living / Share phòng',
			lines: ['Share phòng chung cư', 'Co-living', 'Share phòng']
		},
		{
			value: 'MOTEL',
			label: 'Phòng trọ truyền thống / Căn hộ dịch vụ',
			lines: ['Phòng trọ truyền thống', 'Căn hộ dịch vụ']
		},
		{ value: 'DORM', label: 'KTX / Sleepbox', lines: ['KTX', 'Sleepbox'] }
	];

	function isColivingPricingType(type: string) {
		return type === 'APARTMENT' || type === 'COLIVING';
	}

	let isLoading = $state(true);
	let isQuoteLoading = $state(false);
	let isSubmitting = $state(false);
	let quote = $state<Quote | null>(null);
	let requests = $state<ChangeRequest[]>([]);
	let selectedTier = $state('FREE');
	let selectedPeriod = $state<Period>('MONTHLY');
	let note = $state('');
	let roomAdditions = $state<Record<string, number>>({});
	let baseStandardRooms = $state(0);
	let baseColivingRooms = $state(0);
	let plannedStandardRooms = $state(0);
	let plannedColivingRooms = $state(0);

	onMount(load);

	async function load() {
		isLoading = true;
		try {
			const [quoteRes, requestRes] = await Promise.all([
				fetch('/api/subscription/quote'),
				fetch('/api/subscription/requests')
			]);
			const quoteData = await quoteRes.json();
			const requestData = await requestRes.json();
			if (!quoteRes.ok) throw new Error(quoteData.error || 'Không tải được giá gói');
			if (!requestRes.ok) throw new Error(requestData.error || 'Không tải được yêu cầu đổi gói');
			quote = quoteData;
			selectedPeriod = quoteData.activeSubscription.period;
			const actual = quoteData.actualRoomCounts;
			baseStandardRooms = quoteData.activeSubscription.standardRoomLimit ?? actual.standard;
			baseColivingRooms = quoteData.activeSubscription.colivingRoomLimit ?? actual.coliving;
			plannedStandardRooms = baseStandardRooms;
			plannedColivingRooms = baseColivingRooms;
			const activeMinRooms =
				TIER_OPTIONS.find((option) => option.value === quoteData.activeSubscription.tier)
					?.minRooms ?? 0;
			const missingRooms = Math.max(
				0,
				activeMinRooms - plannedStandardRooms - plannedColivingRooms
			);
			if (missingRooms > 0) {
				if (
					quoteData.activeSubscription.enabledRentalTypes.length > 0 &&
					quoteData.activeSubscription.enabledRentalTypes.every(isColivingPricingType)
				) {
					baseColivingRooms += missingRooms;
					plannedColivingRooms = baseColivingRooms;
				} else {
					baseStandardRooms += missingRooms;
					plannedStandardRooms = baseStandardRooms;
				}
			}
			selectedTier = tierForRoomCount(plannedStandardRooms + plannedColivingRooms);
			requests = requestData;
			if (
				plannedStandardRooms !== quoteData.standardRoomCount ||
				plannedColivingRooms !== quoteData.colivingRoomCount
			) {
				await refreshQuote();
			}
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isLoading = false;
		}
	}

	async function refreshQuote(
		tier = selectedTier,
		period = selectedPeriod,
		standardRooms = plannedStandardRooms,
		colivingRooms = plannedColivingRooms
	) {
		isQuoteLoading = true;
		try {
			const res = await fetch(
				`/api/subscription/quote?tier=${encodeURIComponent(tier)}&period=${period}&standardRoomCount=${standardRooms}&colivingRoomCount=${colivingRooms}`
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không tính được giá gói');
			quote = data;
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isQuoteLoading = false;
		}
	}

	function choosePeriod(period: Period) {
		selectedPeriod = period;
		refreshQuote(selectedTier, period);
	}

	function tierForRoomCount(roomCount: number) {
		return (
			TIER_OPTIONS.find(
				(option) =>
					roomCount >= option.minRooms && (option.maxRooms === null || roomCount <= option.maxRooms)
			)?.value ?? 'ROOMS_151_PLUS'
		);
	}

	function recalculateExpansion() {
		plannedStandardRooms =
			baseStandardRooms +
			Object.entries(roomAdditions)
				.filter(([type]) => !isColivingPricingType(type))
				.reduce((sum, [, count]) => sum + count, 0);
		plannedColivingRooms =
			baseColivingRooms +
			Object.entries(roomAdditions)
				.filter(([type]) => isColivingPricingType(type))
				.reduce((sum, [, count]) => sum + count, 0);
		selectedTier = tierForRoomCount(plannedStandardRooms + plannedColivingRooms);
		refreshQuote();
	}

	function updateRoomAddition(type: string, rawValue: string) {
		roomAdditions = { ...roomAdditions, [type]: Math.max(1, Math.floor(Number(rawValue) || 1)) };
		recalculateExpansion();
	}

	async function submitRequest() {
		if (!quote || isSubmitting) return;
		if (quote.overCapacity) {
			toast.error('Gói này không đủ cho số phòng hiện tại');
			return;
		}
		isSubmitting = true;
		try {
			const res = await fetch('/api/subscription/requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					requestedTier: selectedTier,
					requestedPeriod: selectedPeriod,
					roomAdditions,
					standardRoomCount: plannedStandardRooms,
					colivingRoomCount: plannedColivingRooms,
					note
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không gửi được yêu cầu');
			requests = [data, ...requests];
			note = '';
			roomAdditions = {};
			recalculateExpansion();
			toast.success('Đã gửi yêu cầu điều chỉnh gói');
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function cancelRequest(id: string) {
		if (
			!(await confirmPopup({
				title: 'Hủy yêu cầu đổi gói',
				message: 'Bạn có chắc muốn hủy yêu cầu đang chờ duyệt?',
				confirmLabel: 'Hủy yêu cầu',
				tone: 'danger'
			}))
		)
			return;
		try {
			const res = await fetch('/api/subscription/requests', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action: 'cancel' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không hủy được yêu cầu');
			requests = requests.map((request) => (request.id === id ? data : request));
			toast.success('Đã hủy yêu cầu');
		} catch (error: any) {
			toast.error(error.message);
		}
	}

	function tierLabel(tier: string) {
		return TIER_OPTIONS.find((option) => option.value === tier)?.label ?? tier;
	}

	function rentalTypeLabel(type: string) {
		if (type === 'COLIVING') return 'Share phòng chung cư / Co-living / Share phòng';
		if (type === 'SERVICED_APARTMENT') return 'Phòng trọ truyền thống / Căn hộ dịch vụ';
		return RENTAL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
	}

	function roomAdditionEntries(value: string | null) {
		if (!value) return [];
		try {
			const additions = JSON.parse(value) as Record<string, number>;
			return Object.entries(additions)
				.filter(([, count]) => Number(count) > 0)
				.map(([type, count]) => ({ type, label: rentalTypeLabel(type), count: Number(count) }));
		} catch {
			return [];
		}
	}

	function toggleRentalType(type: string) {
		const next = { ...roomAdditions };
		if (next[type] !== undefined) delete next[type];
		else next[type] = 1;
		roomAdditions = next;
		recalculateExpansion();
	}

	function money(value: number | null) {
		if (value === null) return 'Liên hệ';
		if (value === 0) return 'Miễn phí';
		return new Intl.NumberFormat('vi-VN').format(value) + 'đ';
	}

	function date(value: string | null) {
		return value ? new Date(value).toLocaleDateString('vi-VN') : 'Không giới hạn';
	}

	function requestStatus(status: ChangeRequest['status']) {
		if (status === 'approved') return { label: 'Đã duyệt', cls: 'bg-green-100 text-green-800' };
		if (status === 'rejected') return { label: 'Từ chối', cls: 'bg-red-100 text-red-800' };
		if (status === 'cancelled') return { label: 'Đã hủy', cls: 'bg-zinc-100 text-zinc-600' };
		return { label: 'Chờ duyệt', cls: 'bg-yellow-100 text-yellow-900' };
	}

	const hasPendingRequest = $derived(requests.some((request) => request.status === 'pending'));
	const selectedExpansionTypes = $derived(
		RENTAL_TYPE_OPTIONS.filter((option) => roomAdditions[option.value] !== undefined)
	);
</script>

{#if isLoading}
	<div class="flex h-[40vh] items-center justify-center">
		<Loader2 class="h-10 w-10 animate-spin" />
	</div>
{:else if quote}
	<div class="max-w-4xl space-y-6">
		<section class="rounded-lg border-2 border-black bg-white p-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-bold text-zinc-500">Gói và loại hình hiện tại</p>
					<h2 class="mt-1 text-xl font-black">{tierLabel(quote.activeSubscription.tier)}</h2>
					<p class="mt-1 text-xs font-bold text-zinc-500">
						{quote.activeSubscription.period === 'YEARLY' ? 'Theo năm' : 'Theo tháng'} · Hạn
						{date(quote.activeSubscription.validUntil)}
					</p>
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each quote.activeSubscription.enabledRentalTypes as type}
							<span
								class="rounded-[5px] bg-zinc-100 px-2.5 py-1 text-[10px] font-black text-zinc-600"
							>
								{rentalTypeLabel(type)}
							</span>
						{/each}
					</div>
				</div>
				<div class="rounded-lg bg-blue-50 px-4 py-3 text-right">
					<p class="text-xs font-bold text-blue-800">Đang sử dụng</p>
					<p class="mt-1 text-lg font-black">
						{quote.actualRoomCounts.standard + quote.actualRoomCounts.coliving} phòng
					</p>
					<p class="text-[10px] font-bold text-zinc-500">
						{quote.actualRoomCounts.standard} trọ/CHDV/KTX/Sleepbox + {quote.actualRoomCounts.coliving}
						share phòng/co-living
					</p>
					{#if quote.activeSubscription.standardRoomLimit !== null || quote.activeSubscription.colivingRoomLimit !== null}
						<p class="mt-1 text-[10px] font-black text-blue-800">
							Hạn mức {quote.activeSubscription.standardRoomLimit ?? 0} + {quote.activeSubscription
								.colivingRoomLimit ?? 0}
						</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="space-y-5">
			<div>
				<h2 class="text-base font-black text-blue-600">Tính giá và yêu cầu điều chỉnh</h2>
				<p class="mt-1 text-xs font-bold text-zinc-500">
					Roomio tự so giá gộp và giá tách theo loại hình thực tế, rồi lấy phương án thấp hơn.
				</p>
			</div>

			<div class="space-y-2">
				<div class="flex items-end justify-between gap-3">
					<p class="text-xs font-bold text-zinc-600">Chọn loại hình muốn mở rộng</p>
					<p class="text-xs font-black text-blue-700">Gói đề xuất: {tierLabel(selectedTier)}</p>
				</div>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each RENTAL_TYPE_OPTIONS as option}
						<button
							type="button"
							disabled={hasPendingRequest}
							onclick={() => toggleRentalType(option.value)}
							class="min-h-14 rounded-[6px] border-2 border-black px-3 py-2 text-left text-xs font-black transition-colors disabled:opacity-50 {roomAdditions[
								option.value
							] !== undefined
								? 'bg-blue-300 text-black'
								: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
						>
							{#each option.lines as line}
								<span class="block">{line}</span>
							{/each}
							{#if quote.activeSubscription.enabledRentalTypes.includes(option.value)}
								<span class="mt-0.5 block text-[9px]">Đang quản lý</span>
							{/if}
						</button>
					{/each}
				</div>
				{#if selectedExpansionTypes.length > 0}
					<div class="mt-3 rounded-lg bg-zinc-50 p-3">
						<p class="mb-2 text-xs font-black text-zinc-600">Số phòng muốn thêm</p>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each selectedExpansionTypes as option}
								<label class="block text-[10px] font-bold text-zinc-500">
									{option.label}
									<input
										type="number"
										min="1"
										value={roomAdditions[option.value]}
										onchange={(event) =>
											updateRoomAddition(option.value, event.currentTarget.value)}
										class="mt-1 w-full rounded-[6px] border-2 border-black bg-white px-3 py-2 text-sm font-black text-black"
									/>
								</label>
							{/each}
						</div>
					</div>
				{/if}
				<p class="text-[10px] font-bold text-zinc-500">
					Sau điều chỉnh: {plannedStandardRooms} trọ/CHDV/KTX/Sleepbox + {plannedColivingRooms}
					share phòng/co-living.
					Hệ thống cộng phần mở rộng vào hạn mức hiện tại để tính giá.
				</p>
			</div>

			<div class="space-y-2">
				<p class="text-xs font-bold text-zinc-600">Thời hạn</p>
				<div class="grid grid-cols-2 gap-2">
					{#each [{ value: 'MONTHLY' as const, label: 'Theo tháng' }, { value: 'YEARLY' as const, label: 'Theo năm' }] as option}
						<button
							type="button"
							disabled={isQuoteLoading}
							onclick={() => choosePeriod(option.value)}
							class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {selectedPeriod ===
							option.value
								? 'bg-blue-300 text-black'
								: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="rounded-lg bg-blue-50 p-5">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-xs font-bold text-blue-800">Giá dự kiến</p>
						<p class="mt-1 text-2xl font-black">
							{money(quote.periodPrice)}{quote.periodPrice !== null && quote.periodPrice > 0
								? `/${selectedPeriod === 'YEARLY' ? 'năm' : 'tháng'}`
								: ''}
						</p>
					</div>
					{#if isQuoteLoading}<Loader2 class="h-5 w-5 animate-spin" />{:else}<Check
							class="h-5 w-5 text-blue-700"
						/>{/if}
				</div>
				{#if quote.splitEligible}
					<p class="mt-2 text-xs font-bold text-zinc-600">
						{quote.strategy === 'SPLIT' ? 'Tách hai bảng có lợi hơn' : 'Gộp chung có lợi hơn'} · Giá gộp
						{money(quote.pooledMonthlyPrice)}/tháng · Giá tách {money(
							quote.splitMonthlyPrice
						)}/tháng
					</p>
				{:else if quote.standardRoomCount > 0 && quote.colivingRoomCount > 0}
					<p class="mt-2 text-xs font-bold text-zinc-600">
						Đang tính giá gộp; chỉ tách khi mỗi nhóm có ít nhất 4 phòng.
					</p>
				{:else}
					<p class="mt-2 text-xs font-bold text-zinc-600">
						{quote.colivingRoomCount > 0
							? 'Áp dụng bảng giá Co-living.'
							: 'Áp dụng bảng giá trọ / CHDV / Sleepbox.'}
					</p>
				{/if}
			</div>

			<label class="block space-y-1 text-xs font-bold text-zinc-600">
				Ghi chú cho Super Admin (tùy chọn)
				<textarea
					bind:value={note}
					maxlength="500"
					rows="3"
					placeholder="Ví dụ: Cần nâng gói từ đầu tháng sau"
					class="mt-1 w-full resize-none rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
				></textarea>
			</label>

			<div class="flex justify-end">
				<button
					type="button"
					disabled={isSubmitting || isQuoteLoading || hasPendingRequest || quote.overCapacity}
					onclick={submitRequest}
					class="inline-flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-5 py-2.5 text-sm font-black shadow-secondary transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isSubmitting}<Loader2 class="h-4 w-4 animate-spin" />{/if}
					{hasPendingRequest ? 'Đang có yêu cầu chờ duyệt' : 'Gửi yêu cầu điều chỉnh gói'}
				</button>
			</div>
		</section>

		<section class="space-y-3 border-t-2 border-black pt-6">
			<h2 class="text-base font-black">Lịch sử yêu cầu</h2>
			{#if requests.length === 0}
				<p class="rounded-lg bg-zinc-50 p-4 text-sm font-bold text-zinc-500">
					Chưa có yêu cầu điều chỉnh gói.
				</p>
			{:else}
				<div class="space-y-2">
					{#each requests as request}
						{@const status = requestStatus(request.status)}
						<div
							class="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-black bg-white p-4"
						>
							<div>
								<p class="text-sm font-black">
									{tierLabel(request.requestedTier)} · {request.requestedPeriod === 'YEARLY'
										? 'Theo năm'
										: 'Theo tháng'}
								</p>
								<p class="mt-1 text-xs font-bold text-zinc-500">
									{money(request.quotedPeriodPrice)} · {new Date(
										request.createdAt
									).toLocaleDateString('vi-VN')}
								</p>
								<p class="mt-1 text-xs font-bold text-zinc-500">
									Dự kiến {request.standardRoomCount} trọ/CHDV/KTX/Sleepbox + {request.colivingRoomCount}
									share phòng/co-living
								</p>
								{#if request.requestedRentalTypes}
									<p class="mt-1 text-xs font-bold text-blue-700">
										Thêm loại hình: {request.requestedRentalTypes
											.split(',')
											.map(rentalTypeLabel)
											.join(', ')}
									</p>
								{/if}
								{#if request.requestedRoomAdditions}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each roomAdditionEntries(request.requestedRoomAdditions) as addition}
											<span
												class="rounded-[5px] bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800"
											>
												{addition.label}: +{addition.count} phòng
											</span>
										{/each}
									</div>
								{/if}
								{#if request.adminNote}<p class="mt-1 text-xs font-bold">
										Phản hồi: {request.adminNote}
									</p>{/if}
							</div>
							<div class="flex items-center gap-2">
								<span class="rounded-full px-2.5 py-1 text-[10px] font-black {status.cls}">
									{status.label}
								</span>
								{#if request.status === 'pending'}
									<button
										type="button"
										onclick={() => cancelRequest(request.id)}
										class="rounded-[6px] border-2 border-black bg-white p-1.5 hover:bg-zinc-100"
										aria-label="Hủy yêu cầu"
									>
										<X class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
{/if}
