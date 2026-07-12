<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		Camera,
		Check,
		ExternalLink,
		Eye,
		Loader2,
		Pencil,
		TriangleAlert,
		X
	} from '@lucide/svelte';
	import { confirmPopup } from '$lib/confirm-popup';

	interface ReadingRow {
		id: string;
		roomId: string;
		serviceId: string;
		month: string;
		prevValue: number;
		submittedValue: number | null;
		currValue: number;
		recordedAt: string;
		photoUrl: string | null;
		status: string;
		submittedBy: string;
		isAnomalous: boolean;
		roomNumber: string;
		propertyName: string;
		serviceName: string | null;
	}

	let landlordId = $state('');
	let readings = $state<ReadingRow[]>([]);
	let isLoading = $state(true);
	let filter = $state<'pending' | 'all'>('pending');
	let processingId = $state('');
	let selectedReading = $state<ReadingRow | null>(null);
	let reviewValue = $state('');
	let isEditingValue = $state(false);

	const visibleReadings = $derived(
		filter === 'pending' ? readings.filter((reading) => reading.status === 'pending') : readings
	);
	const pendingCount = $derived(readings.filter((reading) => reading.status === 'pending').length);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (sessionStr) {
			landlordId = JSON.parse(sessionStr).landlordProfileId;
			loadReadings();
		}
	});

	async function loadReadings() {
		isLoading = true;
		try {
			const res = await fetch(`/api/meter-readings?landlordId=${landlordId}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			readings = data;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Lỗi tải danh sách chỉ số');
		} finally {
			isLoading = false;
		}
	}

	function submittedValue(reading: ReadingRow) {
		return reading.submittedValue ?? reading.currValue;
	}

	function unitFor(reading: ReadingRow) {
		const service = reading.serviceName?.toLowerCase() ?? '';
		if (service.includes('điện')) return 'kWh';
		if (service.includes('nước')) return 'm³';
		return 'đơn vị';
	}

	// Trung bình tiêu thụ 3 kỳ đã duyệt gần nhất (cùng phòng + dịch vụ), tính từ dữ liệu đã tải
	function avgUsageFor(reading: ReadingRow): number | null {
		const past = readings
			.filter(
				(r) =>
					r.roomId === reading.roomId &&
					r.serviceId === reading.serviceId &&
					r.status === 'approved' &&
					r.month < reading.month
			)
			.sort((a, b) => (a.month < b.month ? 1 : -1))
			.slice(0, 3)
			.map((r) => r.currValue - r.prevValue)
			.filter((u) => u > 0);
		if (past.length === 0) return null;
		return past.reduce((a, b) => a + b, 0) / past.length;
	}

	// % lệch của mức tiêu thụ kỳ này so với trung bình (dương = cao hơn)
	function deviationPct(usage: number, avg: number | null): number | null {
		if (avg === null || avg <= 0 || !Number.isFinite(usage)) return null;
		return Math.round(((usage - avg) / avg) * 100);
	}

	function openReview(reading: ReadingRow) {
		selectedReading = reading;
		reviewValue = String(reading.currValue);
		isEditingValue = false;
	}

	function closeReview() {
		if (processingId) return;
		selectedReading = null;
		isEditingValue = false;
	}

	async function review(reading: ReadingRow, action: 'approve' | 'reject') {
		if (action === 'reject') {
			const confirmed = await confirmPopup({
				title: 'Từ chối chỉ số?',
				message: 'Khách thuê sẽ cần chụp ảnh và gửi lại chỉ số tháng này.',
				confirmLabel: 'Từ chối',
				tone: 'danger'
			});
			if (!confirmed) return;
		}

		const nextValue = Number(reviewValue);
		if (action === 'approve' && (!Number.isFinite(nextValue) || nextValue < reading.prevValue)) {
			toast.error(`Chỉ số duyệt phải từ ${reading.prevValue} trở lên`);
			return;
		}

		processingId = reading.id;
		try {
			const res = await fetch('/api/meter-readings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: reading.id,
					action,
					...(action === 'approve' ? { currValue: nextValue } : {})
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);

			toast.success(
				action === 'approve'
					? nextValue === submittedValue(reading)
						? 'Đã duyệt chỉ số khách gửi'
						: 'Đã sửa và duyệt chỉ số'
					: 'Đã từ chối chỉ số'
			);
			selectedReading = null;
			isEditingValue = false;
			await loadReadings();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Lỗi xử lý chỉ số');
		} finally {
			processingId = '';
		}
	}

	function statusLabel(status: string) {
		if (status === 'pending') return { text: 'Chờ duyệt', cls: 'bg-yellow-200' };
		if (status === 'approved') return { text: 'Đã chốt', cls: 'bg-green-200' };
		return { text: 'Từ chối', cls: 'bg-red-200' };
	}
</script>

<div class="space-y-5">
	<div class="flex justify-start">
		<div class="flex gap-2">
			<button
				onclick={() => (filter = 'pending')}
				class="toolbar-action rounded-[6px] border-2 border-black px-4 py-2 text-sm font-black transition-all {filter ===
				'pending'
					? 'bg-yellow-200 shadow-secondary'
					: 'bg-white text-zinc-500'}"
			>
				<span class="toolbar-action-label">Chờ duyệt ({pendingCount})</span>
			</button>
			<button
				onclick={() => (filter = 'all')}
				class="toolbar-action rounded-[6px] border-2 border-black px-4 py-2 text-sm font-black transition-all {filter ===
				'all'
					? 'bg-blue-300 shadow-secondary'
					: 'bg-white text-zinc-500'}"
			>
				<span class="toolbar-action-label">Tất cả</span>
			</button>
		</div>
	</div>

	{#if isLoading}
		<div class="flex justify-center py-16">
			<Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
		</div>
	{:else if visibleReadings.length === 0}
		<div class="rounded-lg border-2 border-black bg-white p-10 text-center">
			<p class="font-black text-zinc-400">
				{filter === 'pending' ? 'Không có chỉ số nào đang chờ duyệt.' : 'Chưa có chỉ số nào.'}
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each visibleReadings as reading (reading.id)}
				{@const badge = statusLabel(reading.status)}
				{@const sentValue = submittedValue(reading)}
				{@const usage = reading.currValue - reading.prevValue}
				{@const corrected = reading.status === 'approved' && reading.currValue !== sentValue}
				{@const avg = avgUsageFor(reading)}
				{@const dev = deviationPct(usage, avg)}
				<div
					class="flex flex-col gap-4 rounded-lg border-2 border-black bg-white p-4 lg:flex-row lg:items-center"
				>
					<button
						onclick={() => openReview(reading)}
						class="group relative h-28 w-full shrink-0 overflow-hidden rounded-lg border-2 border-black bg-zinc-100 lg:w-36"
						aria-label="Xem ảnh đồng hồ"
					>
						{#if reading.photoUrl}
							<img src={reading.photoUrl} alt="Ảnh đồng hồ" class="h-full w-full object-cover" />
							<span
								class="absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-[6px] border-2 border-black bg-white shadow-secondary"
							>
								<Eye class="h-4 w-4" />
							</span>
						{:else}
							<span class="flex h-full flex-col items-center justify-center gap-1 text-zinc-400">
								<Camera class="h-6 w-6" />
								<span class="text-xs font-bold">Chưa có ảnh</span>
							</span>
						{/if}
					</button>

					<div class="min-w-0 flex-1 space-y-3">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-black text-black"
								>{reading.propertyName} - P.{reading.roomNumber}</span
							>
							<span class="rounded border-2 border-black bg-blue-100 px-1.5 text-xs font-black">
								{reading.serviceName ?? 'Dịch vụ'}
							</span>
							<span class="rounded border-2 border-black px-1.5 text-xs font-black {badge.cls}"
								>{badge.text}</span
							>
							{#if reading.isAnomalous}
								<span
									class="flex items-center gap-1 rounded border-2 border-black bg-red-200 px-1.5 text-xs font-black"
								>
									<TriangleAlert class="h-3 w-3" /> Bất thường
								</span>
							{/if}
						</div>
						<p class="text-xs font-bold text-zinc-500">
							Tháng {reading.month} | Gửi ngày {reading.recordedAt} |
							{reading.submittedBy === 'TENANT' ? 'Khách tự báo số' : 'Chủ nhà ghi'}
						</p>

						<div class="grid grid-cols-3 gap-2">
							<div class="border-l-2 border-zinc-200 pl-3">
								<p class="text-[10px] font-black text-zinc-400 uppercase">Đầu kỳ</p>
								<p class="text-base font-black">{reading.prevValue}</p>
							</div>
							<div class="border-l-2 border-blue-300 pl-3">
								<p class="text-[10px] font-black text-zinc-400 uppercase">
									{corrected ? 'Khách nhập' : 'Cuối kỳ'}
								</p>
								<p class="text-base font-black">{corrected ? sentValue : reading.currValue}</p>
							</div>
							<div class="border-l-2 border-green-300 pl-3">
								<p class="text-[10px] font-black text-zinc-400 uppercase">Tiêu thụ</p>
								<p class="text-base font-black">{usage} {unitFor(reading)}</p>
							</div>
						</div>
						{#if corrected}
							<p class="text-xs font-bold text-blue-600">
								Chủ nhà đã điều chỉnh và chốt: {reading.currValue}
							</p>
						{/if}
						{#if avg !== null}
							<p class="text-xs font-bold {reading.isAnomalous ? 'text-red-600' : 'text-zinc-500'}">
								TB 3 tháng: {Math.round(avg)}
								{unitFor(reading)}{#if dev !== null}
									· kỳ này {dev >= 0 ? '+' : ''}{dev}%{/if}
							</p>
						{/if}
					</div>

					<button
						onclick={() => openReview(reading)}
						class="flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-xs font-black shadow-secondary"
					>
						<Eye class="h-4 w-4" />
						{reading.status === 'pending' ? 'Xem & duyệt' : 'Xem chi tiết'}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedReading}
	{@const reading = selectedReading}
	{@const sentValue = submittedValue(reading)}
	{@const currentReviewValue = Number(reviewValue)}
	{@const reviewUsage = currentReviewValue - reading.prevValue}
	{@const avg = avgUsageFor(reading)}
	{@const dev = deviationPct(reviewUsage, avg)}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
		onclick={closeReview}
		onkeydown={(event) => event.key === 'Escape' && closeReview()}
		role="button"
		tabindex="0"
	>
		<div
			class="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
			role="dialog"
			tabindex="-1"
			aria-modal="true"
		>
			<div
				class="flex items-center justify-between gap-3 border-b-2 border-black bg-zinc-50 px-4 py-3"
			>
				<div class="min-w-0">
					<h2 class="truncate text-base font-black">
						{reading.propertyName} - P.{reading.roomNumber} - {reading.serviceName ?? 'Đồng hồ'}
					</h2>
					<p class="text-xs font-bold text-zinc-500">Đối chiếu chỉ số tháng {reading.month}</p>
				</div>
				<button onclick={closeReview} class="rounded-[6px] p-2 hover:bg-zinc-200" aria-label="Đóng">
					<X class="h-5 w-5" />
				</button>
			</div>

			<div
				class="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)] lg:overflow-hidden"
			>
				<div class="relative flex min-h-72 items-center justify-center bg-zinc-900 p-3 lg:min-h-0">
					{#if reading.photoUrl}
						<img
							src={reading.photoUrl}
							alt="Ảnh đồng hồ phòng {reading.roomNumber}"
							class="max-h-[68vh] w-full object-contain"
						/>
						<a
							href={reading.photoUrl}
							target="_blank"
							rel="noreferrer"
							class="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-[6px] border-2 border-black bg-white shadow-secondary"
							title="Mở ảnh gốc"
							aria-label="Mở ảnh gốc"
						>
							<ExternalLink class="h-4.5 w-4.5" />
						</a>
					{:else}
						<div class="text-center text-zinc-400">
							<Camera class="mx-auto h-10 w-10" />
							<p class="mt-2 text-sm font-bold">Không có ảnh đối chiếu</p>
						</div>
					{/if}
				</div>

				<div class="flex flex-col justify-between gap-5 overflow-y-auto p-5">
					<div class="space-y-5">
						{#if dev !== null && Math.abs(dev) > 50}
							<div
								class="flex gap-2 rounded-lg border-2 border-black bg-red-100 p-3 text-xs font-bold"
							>
								<TriangleAlert class="h-4 w-4 shrink-0" />
								Kỳ này {reviewUsage}
								{unitFor(reading)}, lệch {dev >= 0 ? '+' : ''}{dev}% so với trung bình 3 tháng ({Math.round(
									avg ?? 0
								)}
								{unitFor(reading)}). Nhìn kỹ ảnh trước khi duyệt.
							</div>
						{:else if reading.isAnomalous}
							<div
								class="flex gap-2 rounded-lg border-2 border-black bg-red-100 p-3 text-xs font-bold"
							>
								<TriangleAlert class="h-4 w-4 shrink-0" />
								Mức tiêu thụ lệch nhiều so với các tháng gần đây. Hãy nhìn kỹ ảnh trước khi duyệt.
							</div>
						{/if}

						<div class="space-y-3">
							<div class="flex items-center justify-between border-b border-zinc-200 pb-2 text-sm">
								<span class="font-bold text-zinc-500">Chỉ số đầu kỳ</span>
								<span class="font-black">{reading.prevValue}</span>
							</div>
							<div class="flex items-center justify-between border-b border-zinc-200 pb-2 text-sm">
								<span class="font-bold text-zinc-500">Khách nhập</span>
								<span class="text-xl font-black text-blue-600">{sentValue}</span>
							</div>
							{#if reading.status === 'approved' && reading.currValue !== sentValue}
								<div
									class="flex items-center justify-between border-b border-zinc-200 pb-2 text-sm"
								>
									<span class="font-bold text-zinc-500">Số đã chốt</span>
									<span class="text-xl font-black">{reading.currValue}</span>
								</div>
							{/if}
						</div>

						{#if isEditingValue && reading.status === 'pending'}
							<label for="review-meter-value" class="block space-y-1">
								<span class="text-xs font-black text-zinc-600">Chỉ số đúng trên ảnh</span>
								<input
									id="review-meter-value"
									type="number"
									min={reading.prevValue}
									bind:value={reviewValue}
									class="w-full rounded-[6px] border-2 border-black px-3 py-2.5 text-xl font-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</label>
						{/if}

						<div class="rounded-lg border-2 border-black bg-green-100 p-4">
							<p class="text-xs font-black text-zinc-600">Tiêu thụ kỳ này</p>
							<p class="mt-1 text-2xl font-black {reviewUsage < 0 ? 'text-red-600' : 'text-black'}">
								{Number.isFinite(reviewUsage) ? reviewUsage : '--'}
								{unitFor(reading)}
							</p>
							{#if avg !== null}
								<p class="mt-1 text-xs font-bold text-zinc-600">
									Trung bình 3 tháng gần nhất: {Math.round(avg)}
									{unitFor(reading)}{#if dev !== null}
										<span class={Math.abs(dev) > 50 ? 'text-red-600' : 'text-zinc-500'}
											>({dev >= 0 ? '+' : ''}{dev}%)</span
										>{/if}
								</p>
							{/if}
						</div>
					</div>

					{#if reading.status === 'pending'}
						<div class="space-y-2 border-t-2 border-black pt-4">
							{#if isEditingValue}
								<button
									onclick={() => review(reading, 'approve')}
									disabled={processingId === reading.id || reviewUsage < 0}
									class="flex w-full items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 px-4 py-3 text-sm font-black shadow-secondary disabled:opacity-50"
								>
									{#if processingId === reading.id}<Loader2
											class="h-4 w-4 animate-spin"
										/>{:else}<Check class="h-4 w-4" />{/if}
									Sửa & duyệt
								</button>
								<button
									onclick={() => {
										reviewValue = String(sentValue);
										isEditingValue = false;
									}}
									disabled={!!processingId}
									class="w-full rounded-[6px] border-2 border-black bg-white px-4 py-2.5 text-sm font-bold"
								>
									Hủy sửa
								</button>
							{:else}
								<button
									onclick={() => review(reading, 'approve')}
									disabled={processingId === reading.id ||
										(reading.submittedBy === 'TENANT' && !reading.photoUrl)}
									class="flex w-full items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 px-4 py-3 text-sm font-black shadow-secondary disabled:opacity-50"
								>
									{#if processingId === reading.id}<Loader2
											class="h-4 w-4 animate-spin"
										/>{:else}<Check class="h-4 w-4" />{/if}
									Duyệt số này
								</button>
								<div class="grid grid-cols-2 gap-2">
									<button
										onclick={() => (isEditingValue = true)}
										disabled={!!processingId}
										class="flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-100 px-3 py-2.5 text-xs font-black"
									>
										<Pencil class="h-4 w-4" /> Sửa số
									</button>
									<button
										onclick={() => review(reading, 'reject')}
										disabled={!!processingId}
										class="flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-red-200 px-3 py-2.5 text-xs font-black text-red-800"
									>
										<X class="h-4 w-4" /> Từ chối
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
