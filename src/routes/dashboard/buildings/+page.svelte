<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import { Building2, Plus, X, Home, Trash2, Loader2 } from '@lucide/svelte';

	interface Block {
		id: string;
		name: string;
	}

	interface RoomSummary {
		id: string;
		roomNumber: string;
		status: string;
		roomType: string;
		monthlyRent: number;
	}

	interface Property {
		id: string;
		name: string;
		shortName: string;
		address: string;
		rentalType: string;
		blocks: Block[];
		rooms: RoomSummary[];
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let properties = $state<Property[]>([]);
	let selectedProperty = $state<Property | null>(null);
	let enabledRentalTypes = $state<string[]>(['APARTMENT']);

	// Dialog and drawer states
	let isAddDialogOpen = $state(false);
	let isDetailDrawerOpen = $state(false);

	// Form states
	let name = $state('');
	let shortName = $state('');
	let address = $state('');
	let blocksText = $state(''); // e.g. "A1, A2, B1, B2"
	let rentalType = $state('APARTMENT');
	let isSubmitting = $state(false);
	const TAP_ACTION_DELAY = 200;
	const RENTAL_TYPE_OPTIONS = [
		{ value: 'APARTMENT', label: 'Chung cư' },
		{ value: 'MOTEL', label: 'Phòng trọ' },
		{ value: 'SERVICED_APARTMENT', label: 'Căn hộ dịch vụ' },
		{ value: 'DORM', label: 'KTX / Sleepbox' }
	];

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		if (session.enabledRentalTypes) {
			enabledRentalTypes = parseRentalTypes(session.enabledRentalTypes);
			rentalType = enabledRentalTypes[0] ?? 'APARTMENT';
		}
		fetchSettings();
		fetchProperties(session.landlordProfileId);
	});

	function parseRentalTypes(value: string | null | undefined) {
		const parsed = (value || 'APARTMENT')
			.split(',')
			.map((type) => type.trim())
			.filter(Boolean);
		return parsed.length > 0 ? parsed : ['APARTMENT'];
	}

	function rentalTypeLabel(type: string) {
		return RENTAL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
	}

	function propertyLabel(type = rentalType) {
		if (type === 'MOTEL') return 'khu trọ';
		if (type === 'SERVICED_APARTMENT') return 'tòa nhà căn hộ dịch vụ';
		if (type === 'DORM') return 'khu KTX / sleepbox';
		return 'tòa nhà';
	}

	function blockLabel(type = rentalType) {
		if (type === 'MOTEL') return 'Dãy';
		if (type === 'SERVICED_APARTMENT') return 'Tầng / khu';
		if (type === 'DORM') return 'Phòng / khu';
		return 'Block';
	}

	function propertyNamePlaceholder(type = rentalType) {
		if (type === 'MOTEL') return 'Ví dụ: Khu trọ An Bình';
		if (type === 'SERVICED_APARTMENT') return 'Ví dụ: CHDV Nguyễn Trãi';
		if (type === 'DORM') return 'Ví dụ: Sleepbox Cầu Giấy';
		return 'Ví dụ: Hoàng Anh Gia Lai';
	}

	function blockPlaceholder(type = rentalType) {
		if (type === 'MOTEL') return 'Ví dụ: Dãy A, Dãy B, Dãy sau';
		if (type === 'SERVICED_APARTMENT') return 'Ví dụ: Tầng 1, Tầng 2, Khu sau';
		if (type === 'DORM') return 'Ví dụ: Phòng nam, Phòng nữ, Khu yên tĩnh';
		return 'Ví dụ: A1, A2, B1, B2';
	}

	async function fetchSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (!res.ok) return;
			enabledRentalTypes = parseRentalTypes(data.enabledRentalTypes);
			if (!enabledRentalTypes.includes(rentalType)) {
				rentalType = enabledRentalTypes[0] ?? 'APARTMENT';
			}
		} catch {
			// Không chặn trang cơ sở nếu cấu hình tài khoản tải lỗi.
		}
	}

	async function fetchProperties(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/properties?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) properties = data;
		} catch (e: any) {
			toast.error('Không thể tải danh sách tòa nhà: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function handleAddProperty(e: SubmitEvent) {
		e.preventDefault();
		if (!landlordId || isSubmitting) return;

		if (!name || !shortName || !address) {
			toast.error('Vui lòng điền đầy đủ tên, tên viết tắt và địa chỉ');
			return;
		}

		isSubmitting = true;
		const blocksArray = blocksText
			.split(',')
			.map((b) => b.trim())
			.filter(Boolean);
		if (rentalType === 'APARTMENT' && blocksArray.length === 0) {
			toast.error('Chung cư cần có ít nhất một block');
			isSubmitting = false;
			return;
		}

		try {
			const res = await fetch('/api/properties', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					landlordId,
					rentalType,
					name,
					shortName,
					address,
					blocks: blocksArray
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi tạo tòa nhà');

			toast.success(`Đã thêm ${propertyLabel(rentalType)} ${name} thành công`);
			isAddDialogOpen = false;
			// Clear forms
			name = '';
			shortName = '';
			address = '';
			blocksText = '';
			rentalType = enabledRentalTypes[0] ?? 'APARTMENT';
			// Refresh
			fetchProperties(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteProperty(id: string) {
		if (
			!(await confirmPopup({
				title: 'Xóa tòa nhà',
				message:
					'Bạn có chắc chắn muốn xóa tòa nhà này? Tất cả phòng và hóa đơn liên quan sẽ bị xóa!',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;

		try {
			const res = await fetch(`/api/properties?id=${id}`, {
				method: 'DELETE'
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa tòa nhà');

			toast.success('Đã xóa tòa nhà thành công');
			isDetailDrawerOpen = false;
			selectedProperty = null;
			if (landlordId) fetchProperties(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	function calculatePropertyStats(rooms: RoomSummary[]) {
		const total = rooms.length;
		const empty = rooms.filter((r) => r.status === 'empty').length;
		const debt = rooms.filter((r) => r.status === 'debt').length;
		const paid = total - empty - debt;

		return { total, empty, debt, paid };
	}

	function getRoomTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			standard: 'Phòng thường',
			master: 'Phòng master',
			balcony: 'Phòng ban công'
		};
		return labels[type] || type;
	}

	function tapBounce(event: MouseEvent, callback?: () => void) {
		const element = event.currentTarget as HTMLElement;
		if (!element.classList.contains('tap-sink') && !element.classList.contains('tap-bounce')) {
			element.classList.remove('tap-bounce');
			void element.offsetWidth;
			element.classList.add('tap-bounce');
			window.setTimeout(() => element.classList.remove('tap-bounce'), 260);
		}

		if (callback) {
			window.setTimeout(callback, TAP_ACTION_DELAY);
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl font-black text-black sm:text-2xl">Tòa nhà cho thuê</h1>
			<p class="mt-1 text-sm font-bold text-zinc-600">
				{properties.length} tòa nhà, {properties.reduce((sum, p) => sum + p.rooms.length, 0)} phòng
			</p>
		</div>
		<button
			onclick={(e) => tapBounce(e, () => (isAddDialogOpen = true))}
			class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all sm:w-auto"
		>
			Thêm tòa nhà <Plus class="h-4.5 w-4.5" />
		</button>
	</div>

	{#if isLoading}
		<div class="flex h-[50vh] w-full items-center justify-center">
			<div class="flex flex-col items-center gap-3">
				<Loader2 class="h-10 w-10 animate-spin text-black" />
				<p class="font-bold text-zinc-600">Đang tải danh sách tòa nhà...</p>
			</div>
		</div>
	{:else if properties.length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-md">
				<h3 class="text-base font-black text-zinc-400">Chưa có tòa nhà nào</h3>
				<p class="mt-2 text-sm leading-relaxed font-semibold text-zinc-400">
					Bắt đầu bằng cách thêm tòa nhà đầu tiên để thiết lập phòng, dịch vụ và tiền thuê hàng
					tháng.
				</p>
				<button
					onclick={(e) => tapBounce(e, () => (isAddDialogOpen = true))}
					class="mt-5 cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-5 py-2.5 text-sm font-black text-black shadow-secondary transition-all"
				>
					Tạo tòa nhà mới
				</button>
			</div>
		</div>
	{:else}
		<!-- Mobile card list (hidden on sm+) -->
		<div class="divide-y-2 divide-black overflow-hidden rounded-lg border-2 border-black sm:hidden">
			{#each properties as prop}
				{@const stats = calculatePropertyStats(prop.rooms)}
				<!-- Inline stat strip -->
				<div class="space-y-2 p-4">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<h3 class="truncate text-base leading-tight font-black text-black">{prop.name}</h3>
							<p class="mt-0.5 truncate text-xs font-semibold text-zinc-500">
								{rentalTypeLabel(prop.rentalType)} · {prop.shortName} · {prop.address}
							</p>
						</div>
					</div>
					<!-- Compact inline strip -->
					<div
						class="flex items-center divide-x-2 divide-black overflow-hidden rounded-lg border-2 border-black text-center"
					>
						<div class="flex-1 px-2 py-3">
							<p class="text-base font-black text-black">{stats.total}</p>
							<p class="text-[9px] font-bold text-zinc-500">Tổng</p>
						</div>
						<div class="flex-1 px-2 py-3">
							<p class="text-base font-black text-zinc-500">{stats.empty}</p>
							<p class="text-[9px] font-bold text-zinc-500">Trống</p>
						</div>
						<div class="flex-1 px-2 py-3">
							<p class="text-base font-black text-green-600">{stats.paid}</p>
							<p class="text-[9px] font-bold text-zinc-500">Đã đóng</p>
						</div>
						<div class="flex-1 px-2 py-3">
							<p class="text-base font-black text-red-600">{stats.debt}</p>
							<p class="text-[9px] font-bold text-zinc-500">Còn nợ</p>
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold text-zinc-500"
							>Lấp đầy: {stats.total > 0
								? Math.round(((stats.total - stats.empty) / stats.total) * 100)
								: 0}%</span
						>
						<button
							onclick={(e) =>
								tapBounce(e, () => {
									selectedProperty = prop;
									isDetailDrawerOpen = true;
								})}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-3 py-1.5 text-xs font-black text-black shadow-secondary transition-all"
						>
							Chi tiết
						</button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Desktop grid (hidden on mobile) -->
		<div class="hidden gap-6 sm:grid md:grid-cols-2">
			{#each properties as prop}
				{@const stats = calculatePropertyStats(prop.rooms)}
				<div
					onclick={(e) =>
						tapBounce(e, () => {
							selectedProperty = prop;
							isDetailDrawerOpen = true;
						})}
					onkeydown={(e) =>
						e.key === 'Enter' && ((selectedProperty = prop), (isDetailDrawerOpen = true))}
					role="button"
					tabindex="0"
					class="property-card cursor-pointer rounded-lg border-2 border-black bg-white p-5 text-left shadow-secondary transition-all focus:ring-2 focus:ring-blue-300 focus:outline-none"
				>
					<div class="mb-4 flex items-start justify-between">
						<div class="flex min-w-0 items-center gap-3">
							<Building2 class="h-6 w-6 text-blue-500" />
							<div class="min-w-0">
								<h3 class="truncate text-lg leading-tight font-black text-black">{prop.name}</h3>
								<p class="mt-1 truncate text-xs font-semibold text-zinc-600">
									{rentalTypeLabel(prop.rentalType)} · {prop.address}
								</p>
							</div>
						</div>
					</div>

					<!-- Stats mini-table -->
					<div
						class="-mx-5 grid grid-cols-4 gap-2 border-y-2 border-black bg-white px-5 py-3 text-center font-semibold"
					>
						<div>
							<p class="text-xl font-black text-black">{stats.total}</p>
							<p class="mt-0.5 text-[9px] font-bold text-zinc-500">Tổng phòng</p>
						</div>
						<div>
							<p class="text-xl font-black text-zinc-500">{stats.empty}</p>
							<p class="mt-0.5 text-[9px] font-bold text-zinc-500">Còn trống</p>
						</div>
						<div>
							<p class="text-xl font-black text-green-600">{stats.paid}</p>
							<p class="mt-0.5 text-[9px] font-bold text-zinc-500">Đã đóng</p>
						</div>
						<div>
							<p class="text-xl font-black text-red-600">{stats.debt}</p>
							<p class="mt-0.5 text-[9px] font-bold text-zinc-500">Còn nợ</p>
						</div>
					</div>

					<div class="mt-4 flex items-center justify-between font-bold">
						<span class="text-xs text-zinc-600">Tỷ lệ lấp đầy</span>
						<span class="text-sm font-black text-black">
							{stats.total > 0 ? Math.round(((stats.total - stats.empty) / stats.total) * 100) : 0}%
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add Property Dialog -->
	{#if isAddDialogOpen}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex animate-[fade-in_0.2s_ease-out] items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isAddDialogOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isAddDialogOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Dialog Content -->
			<div
				class="relative flex w-full max-w-lg animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Thêm tòa nhà mới</span>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<form onsubmit={handleAddProperty} class="space-y-4 p-6">
					{#if enabledRentalTypes.length > 1}
						<div class="space-y-2">
							<p class="text-xs font-bold text-zinc-600">Loại hình</p>
							<div class="grid grid-cols-2 gap-2">
								{#each RENTAL_TYPE_OPTIONS.filter( (option) => enabledRentalTypes.includes(option.value) ) as option}
									<button
										type="button"
										onclick={() => (rentalType = option.value)}
										class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {rentalType ===
										option.value
											? 'bg-blue-300 text-black'
											: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
									>
										{option.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1">
							<label for="p-name" class="block text-xs font-bold text-zinc-600"
								>Tên {propertyLabel(rentalType)}</label
							>
							<input
								id="p-name"
								type="text"
								bind:value={name}
								required
								placeholder={propertyNamePlaceholder(rentalType)}
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="p-short" class="block text-xs font-bold text-zinc-600">Tên viết tắt</label
							>
							<input
								id="p-short"
								type="text"
								bind:value={shortName}
								required
								placeholder="Ví dụ: HAGL"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
					</div>

					<div class="space-y-1">
						<label for="p-addr" class="block text-xs font-bold text-zinc-600">Địa chỉ</label>
						<input
							id="p-addr"
							type="text"
							bind:value={address}
							required
							placeholder="Nhập địa chỉ chi tiết"
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="space-y-1">
						<label for="p-blocks" class="block text-xs font-bold text-zinc-600"
							>{blockLabel(rentalType)}{rentalType === 'APARTMENT' ? '' : ' (tùy chọn)'}</label
						>
						<input
							id="p-blocks"
							type="text"
							bind:value={blocksText}
							required={rentalType === 'APARTMENT'}
							placeholder={blockPlaceholder(rentalType)}
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="flex justify-end gap-3 pt-3">
						<button
							type="button"
							onclick={() => (isAddDialogOpen = false)}
							class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black transition-all"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-black font-bold text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							Thêm {propertyLabel(rentalType)}
							{#if isSubmitting}
								<Loader2 class="h-4 w-4 animate-spin" />
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Detail Slide-over Drawer -->
	{#if isDetailDrawerOpen && selectedProperty}
		{@const stats = calculatePropertyStats(selectedProperty.rooms)}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
			onclick={() => (isDetailDrawerOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isDetailDrawerOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Drawer Content -->
			<div
				class="flex h-full w-full max-w-md animate-[slide-left_0.2s_ease-out] flex-col justify-between overflow-hidden border-l-2 border-black bg-white"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black"
						>Chi tiết {propertyLabel(selectedProperty.rentalType)}</span
					>
					<button
						onclick={() => (isDetailDrawerOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] p-1 text-black transition-colors hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<div class="flex-1 space-y-5 overflow-y-auto p-6">
					<!-- Main property information -->
					<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
						<h3 class="text-xl leading-tight font-black text-black">{selectedProperty.name}</h3>
						<p class="mt-1 text-xs font-bold text-zinc-500">
							{rentalTypeLabel(selectedProperty.rentalType)} · {selectedProperty.shortName}
						</p>
						<div class="mt-4">
							<p class="text-[10px] font-black text-blue-600">Địa chỉ</p>
							<p class="mt-1 text-sm font-bold text-black">{selectedProperty.address}</p>
						</div>
					</div>

					<!-- Stats breakdown -->
					<div class="space-y-3">
						<h4 class="text-xs font-black text-blue-600">Thống kê phòng</h4>
						<div
							class="grid grid-cols-3 rounded-lg border-2 border-black bg-white p-4 font-semibold text-black shadow-secondary"
						>
							<div class="text-center">
								<p class="text-xl font-black">{stats.total}</p>
								<p class="mt-0.5 text-[10px] leading-tight font-bold text-zinc-500">Tổng phòng</p>
							</div>
							<div class="text-center">
								<p class="text-xl font-black">{stats.total - stats.empty}</p>
								<p class="mt-0.5 text-[10px] leading-tight font-bold text-zinc-500">Đang thuê</p>
							</div>
							<div class="text-center">
								<p class="text-xl font-black">{stats.empty}</p>
								<p class="mt-0.5 text-[10px] leading-tight font-bold text-zinc-500">Trống</p>
							</div>
						</div>
					</div>

					<!-- Blocks -->
					{#if selectedProperty.blocks.length > 0}
						<div class="space-y-1.5">
							<h4 class="text-xs font-black text-blue-600">
								{blockLabel(selectedProperty.rentalType)} ({selectedProperty.blocks.length})
							</h4>
							<div class="flex flex-wrap gap-2">
								{#each selectedProperty.blocks as block}
									<span
										class="rounded-[6px] bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700"
									>
										{block.name}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Room types breakdown -->
					{#if stats.total > 0}
						<div class="space-y-3">
							<h4 class="text-xs font-black text-blue-600">Theo loại phòng</h4>
							<div class="space-y-2.5 font-semibold text-black">
								{#each ['standard', 'master', 'balcony'] as type}
									{@const typeRooms = selectedProperty.rooms.filter((r) => r.roomType === type)}
									{@const typeStats = calculatePropertyStats(typeRooms)}
									{#if typeRooms.length > 0}
										<div class="flex items-center justify-between gap-3 text-sm">
											<span class="text-zinc-600">{getRoomTypeLabel(type)}</span>
											<span class="font-black text-black">
												{typeRooms.length} phòng · {typeStats.empty} trống
											</span>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{:else}
						<div class="rounded-lg bg-zinc-50 px-4 py-8 text-center">
							<p class="text-sm font-bold text-zinc-400">Tòa nhà này chưa có phòng.</p>
							<p class="mt-1 text-xs font-semibold text-zinc-400">
								Bắt đầu bằng cách thêm phòng vào tòa nhà.
							</p>
						</div>
					{/if}
				</div>

				<!-- Action buttons at bottom -->
				<div class="flex shrink-0 items-center gap-3 border-t-2 border-black bg-white p-6">
					<button
						onclick={() => handleDeleteProperty(selectedProperty!.id)}
						class="cursor-pointer p-2.5 text-red-600 transition-colors hover:text-red-800"
						title="Xóa tòa nhà"
					>
						<Trash2 class="h-5 w-5" />
					</button>
					<a
						href="/dashboard/rooms?propertyId={selectedProperty.id}"
						class="flex flex-grow cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-center text-sm font-black text-black shadow-secondary transition-all hover:bg-blue-400"
					>
						Quản lý phòng <Home class="h-4.5 w-4.5" />
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes slide-left {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}
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
