<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		Users,
		Plus,
		X,
		User,
		Phone,
		Mail,
		Calendar,
		DollarSign,
		Loader2,
		Home,
		FileText,
		LogOut
	} from '@lucide/svelte';

	interface Room {
		id: string;
		roomNumber: string;
		property: {
			name: string;
			shortName: string;
		};
	}

	interface Tenant {
		id: string;
		idNumber: string;
		moveInDate: string;
		deposit: number;
		notes: string | null;
		telegramUserId?: string | null;
		user: {
			id: string;
			name: string;
			email: string;
			phone: string;
		};
		rooms: Room[];
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let tenants = $state<Tenant[]>([]);
	let emptyRooms = $state<Room[]>([]);
	let selectedTenant = $state<Tenant | null>(null);

	// Modals & drawers
	let isAddDialogOpen = $state(false);
	let isDetailDrawerOpen = $state(false);
	let isSubmitting = $state(false);

	// Form states
	let email = $state('');
	let phone = $state('');
	let name = $state('');
	let password = $state('123456'); // Default simple password
	let roomId = $state('');
	let idNumber = $state('');
	let moveInDate = $state(new Date().toISOString().split('T')[0]);
	let deposit = $state('');
	let notes = $state('');
	let initialElectricity = $state('0');
	let initialWater = $state('0');

	// Telegram Link Generation
	let isGeneratingLink = $state(false);
	let generatedLink = $state<string | null>(null);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchTenants(session.landlordProfileId);
		fetchEmptyRooms(session.landlordProfileId);
	});

	async function fetchTenants(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/tenants?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) tenants = data;
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách khách: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function fetchEmptyRooms(profileId: string) {
		try {
			const propRes = await fetch(`/api/properties?landlordId=${profileId}`);
			const propData = await propRes.json();

			if (propRes.ok) {
				const roomsList: Room[] = [];
				for (const prop of propData) {
					const roomRes = await fetch(`/api/rooms?propertyId=${prop.id}`);
					const roomData = await roomRes.json();
					if (roomRes.ok) {
						roomData
							.filter((r: any) => r.status === 'empty')
							.forEach((r: any) => {
								roomsList.push({
									id: r.id,
									roomNumber: r.roomNumber,
									property: {
										name: prop.name,
										shortName: prop.shortName
									}
								});
							});
					}
				}
				emptyRooms = roomsList;
				if (emptyRooms.length > 0) {
					roomId = emptyRooms[0].id;
				}
			}
		} catch (e) {
			// Ignore
		}
	}

	async function handleAddTenant(e: SubmitEvent) {
		e.preventDefault();
		if (!landlordId || isSubmitting) return;

		if (!email || !phone || !name || !roomId || !idNumber || !moveInDate || deposit === '') {
			toast.error('Vui lòng nhập đầy đủ các trường thông tin bắt buộc');
			return;
		}

		isSubmitting = true;
		try {
			const res = await fetch('/api/tenants', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					phone,
					password,
					name,
					roomId,
					idNumber,
					moveInDate,
					deposit: Number(deposit),
					notes,
					initialElectricity: Number(initialElectricity),
					initialWater: Number(initialWater)
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi thêm khách thuê');

			toast.success(`Đã đăng ký và bàn giao phòng cho khách ${name}`);
			isAddDialogOpen = false;

			// Clear forms
			email = '';
			phone = '';
			name = '';
			password = '123456';
			idNumber = '';
			deposit = '';
			notes = '';
			initialElectricity = '0';
			initialWater = '0';

			// Refresh
			fetchTenants(landlordId);
			fetchEmptyRooms(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleCheckout(rId: string) {
		if (
			!(await confirmPopup({
				title: 'Trả phòng',
				message: 'Bạn có chắc chắn muốn trả phòng cho khách này?',
				confirmLabel: 'Trả phòng',
				tone: 'warning'
			}))
		)
			return;

		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: rId, action: 'checkout' })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi trả phòng');

			toast.success('Đã trả phòng thành công');
			isDetailDrawerOpen = false;
			selectedTenant = null;
			if (landlordId) {
				fetchTenants(landlordId);
				fetchEmptyRooms(landlordId);
			}
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function generateInviteLink(tId: string) {
		isGeneratingLink = true;
		try {
			const res = await fetch('/api/tenant-invites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tenantId: tId })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tạo link');

			generatedLink = data.link;
			toast.success('Tạo link mời thành công');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isGeneratingLink = false;
		}
	}

	async function copyLink(link: string) {
		try {
			await navigator.clipboard.writeText(link);
			toast.success('Đã copy link mời');
		} catch (e) {
			toast.error('Lỗi khi copy link');
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl font-black text-black sm:text-2xl">Quản Lý Khách Thuê</h1>
			<p class="mt-1 text-xs font-bold text-zinc-600 sm:text-sm">
				Hồ sơ khách hàng, tiền đặt cọ và lịch bàn giao phòng
			</p>
		</div>
		<button
			onclick={() => (isAddDialogOpen = true)}
			class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all sm:w-auto sm:justify-start"
		>
			Thêm khách thuê <Plus class="h-4 w-4" />
		</button>
	</div>

	<!-- Quick stats -->
	<!-- Mobile: 1-line inline strip -->
	<div
		class="flex items-center divide-x-2 divide-black overflow-hidden rounded-lg border-2 border-black text-center sm:hidden"
	>
		<div class="flex-1 px-2 py-3">
			<p class="text-[9px] font-bold text-zinc-400">Khách thuê</p>
			<p class="mt-0.5 text-xs font-black text-black">{tenants.length} người</p>
		</div>
		<div class="flex-1 px-2 py-3">
			<p class="text-[9px] font-bold text-zinc-400">Tiền cọc giữ</p>
			<p class="mt-0.5 truncate text-xs font-black text-black">
				{formatCurrency(tenants.reduce((sum, t) => sum + t.deposit, 0))}
			</p>
		</div>
	</div>
	<!-- Desktop: stat cards -->
	<div class="hidden gap-3 sm:grid sm:grid-cols-2">
		<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
			<Users class="mb-2 h-5 w-5 text-blue-500" />
			<p class="text-[10px] font-bold text-zinc-500">Khách thuê</p>
			<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">{tenants.length} người</h3>
		</div>
		<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
			<DollarSign class="mb-2 h-5 w-5 text-blue-500" />
			<p class="text-[10px] font-bold text-zinc-500">Tiền cọc giữ</p>
			<h3 class="mt-0.5 truncate text-base font-black text-black sm:text-xl">
				{formatCurrency(tenants.reduce((sum, t) => sum + t.deposit, 0))}
			</h3>
		</div>
	</div>

	{#if isLoading}
		<div class="flex h-[40vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if tenants.length === 0}
		<div
			class="mx-auto max-w-md rounded-lg border-2 border-black bg-white p-12 text-center shadow-secondary"
		>
			<Users class="h-7 w-7" />
			<h3 class="text-lg font-black text-black">Chưa có khách thuê nào</h3>
			<p class="mt-2 text-sm font-semibold text-zinc-600">
				Đăng ký khách thuê trực tiếp vào phòng trọ để bắt đầu quản lý hợp đồng.
			</p>
		</div>
	{:else}
		<!-- Tenants List -->
		<div class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
			<!-- Mobile card list -->
			<div class="divide-y-2 divide-black bg-white sm:hidden">
				{#each tenants as tenant}
					{@const activeRoom = tenant.rooms[0]}
					<div class="space-y-2 p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm font-black text-black">{tenant.user.name}</p>
								<p class="mt-0.5 text-xs font-bold text-zinc-500">{tenant.user.phone}</p>
							</div>
							{#if activeRoom}
								<span class="shrink-0 text-xs font-black text-blue-600">
									{activeRoom.property.shortName} - P.{activeRoom.roomNumber}
								</span>
							{:else}
								<span class="shrink-0 text-xs font-black text-red-500">Chưa có phòng</span>
							{/if}
						</div>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold text-zinc-500">
								Cọ: {formatCurrency(tenant.deposit)}
							</span>
							<button
								onclick={() =>
									window.setTimeout(() => {
										selectedTenant = tenant;
										generatedLink = null;
										isDetailDrawerOpen = true;
									}, 200)}
								class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-3 py-1.5 text-xs font-bold text-black shadow-secondary transition-all"
							>
								Hồ sơ
							</button>
						</div>
					</div>
				{/each}
			</div>
			<!-- Desktop table -->
			<div class="hidden overflow-x-auto bg-white sm:block">
				<table class="w-full border-collapse text-left text-sm">
					<thead>
						<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
							<th class="px-4 py-3">Tên khách thuê</th>
							<th class="px-4 py-3">Số điện thoại</th>
							<th class="px-4 py-3">Đang ở phòng</th>
							<th class="px-4 py-3">Ngày nhận phòng</th>
							<th class="px-4 py-3">Tiền đặt cọ</th>
							<th class="px-4 py-3">Số CCCD</th>
							<th class="px-4 py-3 text-right">Hồ sơ</th>
						</tr>
					</thead>
					<tbody>
						{#each tenants as tenant}
							{@const activeRoom = tenant.rooms[0]}
							<tr
								class="border-b border-black/15 font-semibold text-black transition-all hover:bg-slate-50"
							>
								<td class="px-4 py-4 font-black">{tenant.user.name}</td>
								<td class="px-4 py-4">{tenant.user.phone}</td>
								<td class="px-4 py-4">
									{#if activeRoom}
										<span class="font-black text-blue-600">
											{activeRoom.property.shortName} - Phòng {activeRoom.roomNumber}
										</span>
									{:else}
										<span class="font-black text-red-500">Chưa nhận phòng</span>
									{/if}
								</td>
								<td class="px-4 py-4">{new Date(tenant.moveInDate).toLocaleDateString('vi-VN')}</td>
								<td class="px-4 py-4 font-black">{formatCurrency(tenant.deposit)}</td>
								<td class="px-4 py-4 font-mono">{tenant.idNumber}</td>
								<td class="px-4 py-4 text-right">
									<button
										onclick={() =>
											window.setTimeout(() => {
												selectedTenant = tenant;
												generatedLink = null;
												isDetailDrawerOpen = true;
											}, 200)}
										class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-3 py-1.5 text-xs font-bold text-black shadow-secondary transition-all"
									>
										Hồ sơ
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Add Tenant Dialog -->
	{#if isAddDialogOpen}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isAddDialogOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isAddDialogOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Dialog Content: Brutallist macOS Window style -->
			<div
				class="relative flex max-h-[90vh] w-full max-w-xl animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
			>
				<!-- Windows Header style -->
				<div
					class="flex shrink-0 items-center gap-2 border-b-2 border-black bg-zinc-50 px-4 py-3 select-none"
				>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-red-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-yellow-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-green-500"></div>
					<span class="ml-2 text-xs font-black font-bold text-zinc-500"
						>Đăng ký & Bàn giao phòng</span
					>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				{#if emptyRooms.length === 0}
					<div class="space-y-3 p-8 text-center">
						<p class="text-zinc-650 font-bold">Tòa nhà của bạn không có phòng nào trống!</p>
						<p class="text-xs font-semibold text-zinc-500">
							Vui lòng tạo phòng trọ trống trước hoặc trả phòng phòng hiện tại.
						</p>
						<button
							onclick={() => (isAddDialogOpen = false)}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold shadow-secondary transition-all"
						>
							Quay lại
						</button>
					</div>
				{:else}
					<form onsubmit={handleAddTenant} class="max-h-[70vh] space-y-4 overflow-y-auto p-6">
						<!-- Account Info section -->
						<div class="space-y-3">
							<h3 class="border-b border-black/15 pb-1.5 text-xs font-black text-zinc-500">
								1. Thông tin đăng nhập tài khoản
							</h3>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label for="t-name" class="block text-[10px] font-bold text-zinc-600"
										>Họ và tên khách</label
									>
									<input
										id="t-name"
										type="text"
										bind:value={name}
										required
										placeholder="Nguyễn Văn A"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-phone" class="block text-[10px] font-bold text-zinc-600"
										>Số điện thoại</label
									>
									<input
										id="t-phone"
										type="tel"
										bind:value={phone}
										required
										placeholder="SĐT đăng nhập"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label for="t-email" class="block text-[10px] font-bold text-zinc-600"
										>Email liên hệ</label
									>
									<input
										id="t-email"
										type="email"
										bind:value={email}
										required
										placeholder="email@gmail.com"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-pass" class="block text-[10px] font-bold text-zinc-600"
										>Mật khẩu truy cập</label
									>
									<input
										id="t-pass"
										type="password"
										bind:value={password}
										required
										placeholder="Mật khẩu mặc định"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>
						</div>

						<!-- Profile Info section -->
						<div class="space-y-3">
							<h3 class="border-b border-black/15 pb-1.5 text-xs font-black text-zinc-500">
								2. Hồ sơ hợp đồng & cọc
							</h3>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label for="t-room" class="block text-[10px] font-bold text-zinc-600"
										>Chọn phòng nhận bàn giao</label
									>
									<select
										id="t-room"
										bind:value={roomId}
										required
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									>
										{#each emptyRooms as room}
											<option value={room.id}>
												{room.property.shortName} - Phòng {room.roomNumber}
											</option>
										{/each}
									</select>
								</div>
								<div class="space-y-1">
									<label for="t-cccd" class="block text-[10px] font-bold text-zinc-600"
										>Số CCCD / Hộ chiếu</label
									>
									<input
										id="t-cccd"
										type="text"
										bind:value={idNumber}
										required
										placeholder="Nhập 12 số CCCD"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label for="t-date" class="block text-[10px] font-bold text-zinc-600"
										>Ngày bàn giao nhận phòng</label
									>
									<input
										id="t-date"
										type="date"
										bind:value={moveInDate}
										required
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-dep" class="block text-[10px] font-bold text-zinc-600"
										>Số tiền cọc đã đóng (đ)</label
									>
									<input
										id="t-dep"
										type="number"
										bind:value={deposit}
										required
										placeholder="Ví dụ: 3000000"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>
						</div>

						<!-- Initial Meter readings -->
						<div class="space-y-3">
							<h3 class="border-b border-black/15 pb-1.5 text-xs font-black text-zinc-500">
								3. Chỉ số điện nước đầu kỳ
							</h3>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label for="t-elec" class="block text-[10px] font-bold text-zinc-600"
										>Chỉ số Điện đầu kỳ (kWh)</label
									>
									<input
										id="t-elec"
										type="number"
										bind:value={initialElectricity}
										required
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-center text-xs font-black text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-water" class="block text-[10px] font-bold text-zinc-600"
										>Chỉ số Nước đầu kỳ (m³)</label
									>
									<input
										id="t-water"
										type="number"
										bind:value={initialWater}
										required
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-center text-xs font-black text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>
						</div>

						<div class="space-y-1">
							<label for="t-notes" class="block text-[10px] font-bold text-zinc-600"
								>Ghi chú hợp đồng</label
							>
							<textarea
								id="t-notes"
								bind:value={notes}
								placeholder="Thuê dài hạn 12 tháng, giữ xe máy..."
								rows="2"
								class="w-full rounded-lg border-2 border-black bg-white p-2.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							></textarea>
						</div>

						<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
							<button
								type="button"
								onclick={() => (isAddDialogOpen = false)}
								class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-all"
							>
								Hủy
							</button>
							<button
								type="submit"
								disabled={isSubmitting}
								class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
							>
								Đăng ký khách thuê
								{#if isSubmitting}
									<Loader2 class="h-4.5 w-4.5 animate-spin" />
								{/if}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Detail Slide-over Drawer -->
	{#if isDetailDrawerOpen && selectedTenant}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
			onclick={() => (isDetailDrawerOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isDetailDrawerOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Drawer Content: Brutallist Panel border-l-2 -->
			<div
				class="flex h-full w-full max-w-md animate-[slide-left_0.2s_ease-out] flex-col justify-between overflow-hidden border-l-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
			>
				<!-- Windows Header style -->
				<div
					class="flex shrink-0 items-center gap-2 border-b-2 border-black bg-zinc-50 px-4 py-3 select-none"
				>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-red-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-yellow-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-green-500"></div>
					<span class="ml-2 text-xs font-black font-bold text-zinc-500">Hồ sơ khách thuê</span>
					<button
						onclick={() => (isDetailDrawerOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<div class="flex-1 space-y-6 overflow-y-auto p-6">
					<!-- Drawer Header Title -->
					<div class="flex items-center gap-3 border-b-2 border-black pb-4">
						<div
							class="shrink-0 rounded-lg border-2 border-black bg-white p-2.5 text-black shadow-secondary"
						>
							<User class="h-6 w-6" />
						</div>
						<div>
							<h3 class="text-lg leading-tight font-black text-black">
								{selectedTenant.user.name}
							</h3>
							<p class="mt-1 text-xs font-bold text-zinc-600">Hồ sơ khách thuê Roomio</p>
						</div>
					</div>

					<!-- Contact info details -->
					<div class="space-y-3">
						<h4 class="text-xs font-black text-zinc-500">Thông tin liên hệ</h4>
						<div class="space-y-2.5 divide-y divide-black/15 text-sm font-semibold text-black">
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<Phone class="h-4 w-4 text-black" />
									Số điện thoại
								</span>
								<span class="font-black">{selectedTenant.user.phone}</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<Mail class="h-4 w-4 text-black" />
									Email liên hệ
								</span>
								<span class="font-black">{selectedTenant.user.email}</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<FileText class="h-4 w-4 text-black" />
									CCCD / Hộ chiếu
								</span>
								<span class="font-mono font-black">{selectedTenant.idNumber}</span>
							</div>
						</div>
					</div>

					<!-- Lease Details -->
					<div class="space-y-3">
						<h4 class="text-xs font-black text-zinc-500">Hợp đồng thuê trọ</h4>
						<div class="space-y-2.5 divide-y divide-black/15 text-sm font-semibold text-black">
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<Home class="h-4 w-4 text-black" />
									Phòng đang ở
								</span>
								{#if selectedTenant.rooms[0]}
									<span class="font-black text-blue-600">
										{selectedTenant.rooms[0].property.shortName} - Phòng {selectedTenant.rooms[0]
											.roomNumber}
									</span>
								{:else}
									<span class="font-black text-red-500">Chưa ở phòng nào</span>
								{/if}
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<Calendar class="h-4 w-4 text-black" />
									Ngày dọn vào ở
								</span>
								<span class="font-black">
									{new Date(selectedTenant.moveInDate).toLocaleDateString('vi-VN')}
								</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
									<DollarSign class="h-4 w-4 text-black" />
									Tiền đặt cọc giữ
								</span>
								<span class="font-black text-green-600"
									>{formatCurrency(selectedTenant.deposit)}</span
								>
							</div>
						</div>
					</div>

					<!-- Notes -->
					<div class="space-y-2">
						<h4 class="text-xs font-black text-zinc-500">Ghi chú / Thỏa thuận riêng</h4>
						<div
							class="rounded-lg border-2 border-black bg-white p-3 text-xs leading-relaxed font-semibold text-black shadow-secondary"
						>
							{selectedTenant.notes || 'Không ghi nhận thỏa thuận đặc biệt nào.'}
						</div>
					</div>

					<!-- Telegram Invite Link -->
					<div class="space-y-2">
						<h4 class="text-xs font-black text-zinc-500">Trạng thái tài khoản</h4>
						<div class="flex flex-col gap-2 text-xs font-semibold text-black">
							{#if selectedTenant.telegramUserId}
								<div class="flex items-center gap-1.5 font-black text-green-600">
									<span class="h-2 w-2 rounded-full bg-green-500"></span> Đã liên kết Telegram
								</div>
								<p class="text-[10px] text-zinc-500">ID: {selectedTenant.telegramUserId}</p>
							{:else}
								<div class="mb-1 flex items-center gap-1.5 font-bold text-zinc-500">
									<span class="h-2 w-2 rounded-full bg-zinc-400"></span> Chưa liên kết Telegram
								</div>
								<button
									onclick={() => generateInviteLink(selectedTenant!.id)}
									disabled={isGeneratingLink}
									class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-black bg-[#2AABEE] py-2 text-xs font-black text-white transition-all hover:bg-[#229ED9]"
								>
									Tạo Link Mời
									{#if isGeneratingLink}
										<Loader2 class="h-3.5 w-3.5 animate-spin" />
									{/if}
								</button>
								{#if generatedLink}
									<div class="mt-1 rounded-md border-2 border-black bg-zinc-50 p-2">
										<p class="mb-2 font-mono text-[10px] break-all text-black select-all">
											{generatedLink}
										</p>
										<button
											onclick={() => copyLink(generatedLink!)}
											class="hover:bg-zinc-150 w-full cursor-pointer rounded border border-black bg-white px-2 py-1 text-[10px] font-bold text-black shadow-primary active:translate-y-px"
										>
											Bấm để Copy
										</button>
									</div>
								{/if}
							{/if}
						</div>
					</div>
				</div>

				<!-- Checkout action at bottom -->
				<div class="bg-zinc-150 flex shrink-0 gap-3 border-t-2 border-black p-6">
					{#if selectedTenant.rooms[0]}
						<button
							onclick={() => handleCheckout(selectedTenant!.rooms[0].id)}
							class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-red-200 py-2.5 text-center text-xs font-black text-red-800 shadow-secondary transition-all hover:bg-red-300"
						>
							Trả phòng (Checkout) <LogOut class="h-4 w-4" />
						</button>
					{/if}
					<button
						onclick={() => (isDetailDrawerOpen = false)}
						class="hover:bg-zinc-150 flex-1 cursor-pointer rounded-[6px] border-2 border-black bg-white py-2.5 text-center text-xs font-black text-black transition-all"
					>
						Đóng
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
