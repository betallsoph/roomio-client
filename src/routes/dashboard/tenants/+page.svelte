<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import { X, Loader2 } from '@lucide/svelte';
	import { uploadImage } from '$lib/upload';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	interface Room {
		id: string;
		blockId?: string | null;
		roomNumber: string;
		roomCode?: string | null;
		floor?: number | null;
		block?: Block | null;
		property: {
			name: string;
			shortName: string;
			rentalType?: string;
		};
	}

	interface Block {
		id: string;
		name: string;
	}

	interface PropertyOption {
		id: string;
		name: string;
		shortName: string;
		rentalType: string;
		blocks: Block[];
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

	interface ContractRow {
		id: string;
		startDate: string;
		endDate: string;
		monthlyRent: number;
		deposit: number;
		fileUrl: string | null;
		status: string;
		notes: string | null;
		room: { roomNumber: string };
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let tenants = $state<Tenant[]>([]);
	let emptyRooms = $state<Room[]>([]);
	let properties = $state<PropertyOption[]>([]);
	let enabledRentalTypes = $state<string[]>(['APARTMENT']);
	let selectedTenant = $state<Tenant | null>(null);

	// Hợp đồng của khách đang xem (gộp từ trang Hợp đồng cũ vào tenant detail)
	let tenantContracts = $state<ContractRow[]>([]);
	let loadingContracts = $state(false);
	let showContractForm = $state(false);
	let savingContract = $state(false);
	let uploadingContractFile = $state(false);
	let cForm = $state({
		startDate: '',
		endDate: '',
		monthlyRent: 0,
		deposit: 0,
		fileUrl: '',
		notes: ''
	});
	const todayStr = new Date().toISOString().split('T')[0];
	const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
	let roomAssignMode = $state<'existing' | 'new'>('existing');
	let quickPropertyId = $state('');
	let quickBlockId = $state('');
	let quickRoomCode = $state('');
	let quickUnitNumber = $state('');
	let quickRoomNumber = $state('');
	let quickFloor = $state('');
	let quickMonthlyRent = $state('');
	let quickArea = $state('');
	let quickRoomType = $state('standard');
	let quickPropertyName = $state('');
	let quickPropertyShortName = $state('');
	let quickPropertyAddress = $state('');
	let quickPropertyBlocksText = $state('');
	let quickPropertyRentalType = $state('APARTMENT');
	let isCreatingProperty = $state(false);
	const RENTAL_TYPE_OPTIONS = [
		{ value: 'APARTMENT', label: 'Chung cư' },
		{ value: 'MOTEL', label: 'Phòng trọ' },
		{ value: 'SERVICED_APARTMENT', label: 'Căn hộ dịch vụ' },
		{ value: 'DORM', label: 'KTX / Sleepbox' }
	];

	// Telegram Link Generation
	let isGeneratingLink = $state(false);
	let generatedLink = $state<string | null>(null);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		if (session.enabledRentalTypes) {
			enabledRentalTypes = parseRentalTypes(session.enabledRentalTypes);
			quickPropertyRentalType = enabledRentalTypes[0] ?? 'APARTMENT';
		}
		fetchSettings();
		fetchTenants(session.landlordProfileId);
		fetchEmptyRooms(session.landlordProfileId);
	});

	function parseRentalTypes(value: string | null | undefined) {
		const parsed = (value || 'APARTMENT')
			.split(',')
			.map((type) => type.trim())
			.filter(Boolean);
		return parsed.length > 0 ? parsed : ['APARTMENT'];
	}

	async function fetchSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (!res.ok) return;
			enabledRentalTypes = parseRentalTypes(data.enabledRentalTypes);
			if (!enabledRentalTypes.includes(quickPropertyRentalType)) {
				quickPropertyRentalType = enabledRentalTypes[0] ?? 'APARTMENT';
			}
		} catch {
			// Không chặn trang khách thuê nếu tải cấu hình tài khoản lỗi.
		}
	}

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
				properties = propData.map((prop: any) => ({
					id: prop.id,
					name: prop.name,
					shortName: prop.shortName,
					rentalType: prop.rentalType ?? 'APARTMENT',
					blocks: prop.blocks ?? []
				}));
				if (!quickPropertyId && properties.length > 0) {
					quickPropertyId = properties[0].id;
					quickBlockId = properties[0].blocks[0]?.id ?? '';
				}

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
									blockId: r.blockId,
									roomNumber: r.roomNumber,
									roomCode: r.roomCode,
									floor: r.floor,
									block: r.block,
									property: {
										name: prop.name,
										shortName: prop.shortName,
										rentalType: prop.rentalType
									}
								});
							});
					}
				}
				emptyRooms = roomsList;
				if (emptyRooms.length > 0) {
					roomId = emptyRooms[0].id;
					roomAssignMode = 'existing';
				} else {
					roomId = '';
					roomAssignMode = 'new';
				}
			}
		} catch (e) {
			// Ignore
		}
	}

	function selectedQuickProperty() {
		return properties.find((property) => property.id === quickPropertyId) ?? null;
	}

	function quickPropertyIsApartment() {
		return selectedQuickProperty()?.rentalType === 'APARTMENT';
	}

	function normalizeUnitNumber(value: string) {
		const raw = value.trim().toUpperCase().replace(/\s+/g, '');
		if (!raw) return '';
		return raw;
	}

	function buildQuickApartmentUnitDisplay() {
		const blockName = selectedQuickProperty()?.blocks.find(
			(block) => block.id === quickBlockId
		)?.name;
		const floorNumber = Number(quickFloor);
		const unitNumber = normalizeUnitNumber(quickUnitNumber);
		if (!blockName || !Number.isFinite(floorNumber) || !unitNumber) return null;
		return `${blockName.trim().toUpperCase()} · Tầng ${Math.trunc(floorNumber)} · Căn ${unitNumber}`;
	}

	function selectQuickProperty(propertyId: string) {
		quickPropertyId = propertyId;
		const property = selectedQuickProperty();
		quickBlockId = property?.blocks[0]?.id ?? '';
	}

	function roomOptionLabel(room: Room) {
		return `${room.property.shortName} - Phòng ${room.roomNumber}${roomLocationLabel(room)}`;
	}

	function tenantRoomLabel(room: Room) {
		return `${room.property.shortName} - Phòng ${room.roomNumber}${roomLocationLabel(room)}`;
	}

	function roomLocationLabel(room: Room) {
		if (room.property.rentalType === 'APARTMENT') {
			const parts = [
				room.block?.name,
				room.floor ? `Tầng ${room.floor}` : '',
				room.roomCode ? `Căn ${room.roomCode}` : ''
			].filter(Boolean);
			return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
		}
		return room.roomCode ? ` · ${room.roomCode}` : '';
	}

	function resetTenantForm() {
		email = '';
		phone = '';
		name = '';
		password = '123456';
		idNumber = '';
		deposit = '';
		notes = '';
		initialElectricity = '0';
		initialWater = '0';
		quickRoomCode = '';
		quickUnitNumber = '';
		quickRoomNumber = '';
		quickFloor = '';
		quickMonthlyRent = '';
		quickArea = '';
		quickRoomType = 'standard';
	}

	function quickPropertyLabel(type = quickPropertyRentalType) {
		if (type === 'MOTEL') return 'khu trọ';
		if (type === 'SERVICED_APARTMENT') return 'tòa nhà căn hộ dịch vụ';
		if (type === 'DORM') return 'khu KTX / sleepbox';
		return 'tòa nhà';
	}

	function quickBlockLabel(type = quickPropertyRentalType) {
		if (type === 'MOTEL') return 'Dãy';
		if (type === 'SERVICED_APARTMENT') return 'Tầng / khu';
		if (type === 'DORM') return 'Phòng / khu';
		return 'Block';
	}

	function quickPropertyNamePlaceholder(type = quickPropertyRentalType) {
		if (type === 'MOTEL') return 'Ví dụ: Khu trọ An Bình';
		if (type === 'SERVICED_APARTMENT') return 'Ví dụ: CHDV Nguyễn Trãi';
		if (type === 'DORM') return 'Ví dụ: Sleepbox Cầu Giấy';
		return 'Ví dụ: Hoàng Anh Gia Lai 3';
	}

	function quickBlockPlaceholder(type = quickPropertyRentalType) {
		if (type === 'MOTEL') return 'Ví dụ: Dãy A, Dãy B';
		if (type === 'SERVICED_APARTMENT') return 'Ví dụ: Tầng 1, Tầng 2';
		if (type === 'DORM') return 'Ví dụ: Phòng nam, Phòng nữ';
		return 'Ví dụ: A1, A2, B1, B2';
	}

	function resetQuickPropertyForm() {
		quickPropertyName = '';
		quickPropertyShortName = '';
		quickPropertyAddress = '';
		quickPropertyBlocksText = '';
		quickPropertyRentalType = enabledRentalTypes[0] ?? 'APARTMENT';
	}

	async function createQuickPropertyForTenant() {
		if (!landlordId || isCreatingProperty) return;
		if (!quickPropertyName || !quickPropertyShortName || !quickPropertyAddress) {
			toast.error('Vui lòng nhập đủ tên, tên viết tắt và địa chỉ tòa nhà');
			return;
		}
		const blocks = quickPropertyBlocksText
			.split(',')
			.map((block) => block.trim())
			.filter(Boolean);
		if (quickPropertyRentalType === 'APARTMENT' && blocks.length === 0) {
			toast.error('Chung cư cần có ít nhất một block');
			return;
		}

		isCreatingProperty = true;
		try {
			const res = await fetch('/api/properties', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rentalType: quickPropertyRentalType,
					name: quickPropertyName,
					shortName: quickPropertyShortName,
					address: quickPropertyAddress,
					blocks
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tạo tòa nhà');

			properties = [...properties, data];
			quickPropertyId = data.id;
			quickBlockId = data.blocks?.[0]?.id ?? '';
			roomAssignMode = 'new';
			resetQuickPropertyForm();
			toast.success('Đã tạo tòa nhà, giờ tạo phòng cho khách luôn được rồi');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreatingProperty = false;
		}
	}

	async function handleAddTenant(e: SubmitEvent) {
		e.preventDefault();
		if (!landlordId || isSubmitting) return;

		if (!email || !phone || !name || !idNumber || !moveInDate || deposit === '') {
			toast.error('Vui lòng nhập đầy đủ các trường thông tin bắt buộc');
			return;
		}
		if (roomAssignMode === 'existing' && !roomId) {
			toast.error('Vui lòng chọn phòng nhận bàn giao');
			return;
		}
		if (roomAssignMode === 'new') {
			if (!quickPropertyId || !quickRoomNumber || !quickMonthlyRent) {
				toast.error('Vui lòng nhập đủ tòa nhà, mã phòng và giá thuê để tạo phòng');
				return;
			}
			if (
				quickPropertyIsApartment() &&
				(!quickBlockId || !quickUnitNumber || !quickFloor || !buildQuickApartmentUnitDisplay())
			) {
				toast.error('Chung cư cần chọn block, nhập tầng và số căn');
				return;
			}
		}

		isSubmitting = true;
		let createdRoomIdForRollback: string | null = null;
		try {
			let targetRoomId = roomId;
			if (roomAssignMode === 'new') {
				const apartmentUnit = quickPropertyIsApartment()
					? normalizeUnitNumber(quickUnitNumber)
					: null;
				const createRoomRes = await fetch('/api/rooms', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						propertyId: quickPropertyId,
						blockId: quickBlockId || null,
						roomNumber: quickRoomNumber,
						roomCode: apartmentUnit || quickRoomCode || null,
						unitNumber: quickPropertyIsApartment()
							? normalizeUnitNumber(quickUnitNumber)
							: undefined,
						roomType: quickRoomType,
						floor: quickFloor ? Number(quickFloor) : null,
						monthlyRent: Number(quickMonthlyRent),
						area: quickArea ? Number(quickArea) : null
					})
				});
				const createdRoom = await createRoomRes.json();
				if (!createRoomRes.ok) throw new Error(createdRoom.error || 'Lỗi tạo phòng');
				targetRoomId = createdRoom.id;
				createdRoomIdForRollback = createdRoom.id;
			}

			const res = await fetch('/api/tenants', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					phone,
					password,
					name,
					roomId: targetRoomId,
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
			createdRoomIdForRollback = null;

			toast.success(`Đã đăng ký và bàn giao phòng cho khách ${name}`);
			isAddDialogOpen = false;

			resetTenantForm();

			// Refresh
			fetchTenants(landlordId);
			fetchEmptyRooms(landlordId);
		} catch (err: any) {
			if (createdRoomIdForRollback) {
				await fetch(`/api/rooms?id=${createdRoomIdForRollback}`, { method: 'DELETE' }).catch(
					() => {}
				);
			}
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

	// Tự tải hợp đồng mỗi khi mở/đổi khách đang xem trong drawer
	$effect(() => {
		if (selectedTenant) loadTenantContracts(selectedTenant.id);
	});

	async function loadTenantContracts(tenantId: string) {
		loadingContracts = true;
		showContractForm = false;
		try {
			const res = await fetch(`/api/contracts?tenantId=${tenantId}`);
			const data = await res.json();
			tenantContracts = res.ok ? data : [];
		} catch {
			tenantContracts = [];
		} finally {
			loadingContracts = false;
		}
	}

	function openContractForm() {
		cForm = {
			startDate: todayStr,
			endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
			monthlyRent: 0,
			deposit: selectedTenant?.deposit ?? 0,
			fileUrl: '',
			notes: ''
		};
		showContractForm = true;
	}

	async function handleContractFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploadingContractFile = true;
		try {
			cForm.fileUrl = await uploadImage(file);
			toast.success('Đã tải file hợp đồng lên');
		} catch (e: any) {
			toast.error(e.message || 'Lỗi upload file');
		} finally {
			uploadingContractFile = false;
			input.value = '';
		}
	}

	async function createTenantContract() {
		const room = selectedTenant?.rooms[0];
		if (!selectedTenant || !room) {
			toast.error('Khách chưa ở phòng nào để lập hợp đồng');
			return;
		}
		if (!cForm.startDate || !cForm.endDate || !cForm.monthlyRent) {
			toast.error('Vui lòng nhập ngày bắt đầu/kết thúc và tiền thuê');
			return;
		}
		savingContract = true;
		try {
			const res = await fetch('/api/contracts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId: selectedTenant.id,
					roomId: room.id,
					startDate: cForm.startDate,
					endDate: cForm.endDate,
					monthlyRent: Number(cForm.monthlyRent),
					deposit: Number(cForm.deposit),
					fileUrl: cForm.fileUrl || null,
					notes: cForm.notes || null
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tạo hợp đồng');
			toast.success('Đã tạo hợp đồng');
			showContractForm = false;
			await loadTenantContracts(selectedTenant.id);
		} catch (e: any) {
			toast.error(e.message);
		} finally {
			savingContract = false;
		}
	}

	async function terminateTenantContract(c: ContractRow) {
		if (
			!(await confirmPopup({
				title: 'Chấm dứt hợp đồng',
				message: 'Chấm dứt hợp đồng này?',
				confirmLabel: 'Chấm dứt',
				tone: 'warning'
			}))
		)
			return;
		const res = await fetch('/api/contracts', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: c.id, status: 'terminated' })
		});
		if (res.ok) {
			toast.success('Đã chấm dứt hợp đồng');
			if (selectedTenant) await loadTenantContracts(selectedTenant.id);
		} else {
			toast.error('Lỗi cập nhật hợp đồng');
		}
	}

	async function deleteTenantContract(c: ContractRow) {
		if (
			!(await confirmPopup({
				title: 'Xóa hợp đồng',
				message: 'Xóa hẳn hợp đồng này? Không thể hoàn tác.',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;
		const res = await fetch(`/api/contracts?id=${c.id}`, { method: 'DELETE' });
		if (res.ok) {
			toast.success('Đã xóa hợp đồng');
			if (selectedTenant) await loadTenantContracts(selectedTenant.id);
		} else {
			toast.error('Lỗi xóa hợp đồng');
		}
	}

	function contractBadge(c: ContractRow) {
		if (c.status === 'terminated') return { text: 'Đã chấm dứt', cls: 'bg-zinc-200 text-zinc-600' };
		if (c.endDate < todayStr) return { text: 'Hết hạn', cls: 'bg-red-200 text-red-800' };
		if (c.status === 'active' && c.endDate <= in30DaysStr)
			return { text: 'Sắp hết hạn', cls: 'bg-yellow-200 text-yellow-800' };
		return { text: 'Hiệu lực', cls: 'bg-green-200 text-green-800' };
	}
</script>

<div class="space-y-6">
	<div class="flex justify-end">
		<button
			onclick={() => (isAddDialogOpen = true)}
			class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all sm:w-auto sm:justify-start"
		>
			Thêm khách thuê
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
			<p class="text-[10px] font-bold text-zinc-500">Khách thuê</p>
			<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">{tenants.length} người</h3>
		</div>
		<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
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
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">Chưa có khách thuê nào</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					Đăng ký khách thuê trực tiếp vào phòng trọ để bắt đầu quản lý hợp đồng.
				</p>
			</div>
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
								<span class="max-w-[48%] shrink-0 truncate text-xs font-black text-blue-600">
									{tenantRoomLabel(activeRoom)}
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
											{tenantRoomLabel(activeRoom)}
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
			<!-- Dialog Content -->
			<div
				class="relative flex max-h-[90vh] w-full max-w-xl animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Đăng ký & Bàn giao phòng</span>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<form onsubmit={handleAddTenant} class="max-h-[70vh] space-y-4 overflow-y-auto p-6">
					<!-- Account Info section -->
					<div class="space-y-3">
						<h3 class="text-sm font-black text-blue-600">1. Thông tin đăng nhập tài khoản</h3>
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
						<h3 class="text-sm font-black text-blue-600">2. Hồ sơ hợp đồng & cọc</h3>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								disabled={emptyRooms.length === 0}
								onclick={() => (roomAssignMode = 'existing')}
								class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors disabled:opacity-40 {roomAssignMode ===
								'existing'
									? 'bg-blue-300 text-black'
									: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
							>
								Chọn phòng có sẵn
							</button>
							<button
								type="button"
								onclick={() => (roomAssignMode = 'new')}
								class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {roomAssignMode ===
								'new'
									? 'bg-blue-300 text-black'
									: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
							>
								Tạo phòng mới
							</button>
						</div>
						<div class="grid grid-cols-2 gap-3">
							{#if roomAssignMode === 'existing'}
								<div class="space-y-1">
									<label for="t-room" class="block text-[10px] font-bold text-zinc-600"
										>Chọn phòng nhận bàn giao</label
									>
									<RoomioSelect
										id="t-room"
										bind:value={roomId}
										required
										options={emptyRooms.map((room) => ({
											value: room.id,
											label: roomOptionLabel(room)
										}))}
										compact
									/>
								</div>
							{:else if properties.length > 0}
								<div class="space-y-1">
									<label for="t-property" class="block text-[10px] font-bold text-zinc-600"
										>Tòa nhà</label
									>
									<RoomioSelect
										id="t-property"
										bind:value={quickPropertyId}
										onchange={() => selectQuickProperty(quickPropertyId)}
										required
										options={properties.map((property) => ({
											value: property.id,
											label: `${property.shortName} - ${property.name}`
										}))}
										compact
									/>
								</div>
							{:else}
								<div class="col-span-2 space-y-3 rounded-lg border-2 border-black bg-blue-50 p-3">
									<div>
										<p class="text-xs font-black text-black">Chưa có tòa nhà</p>
										<p class="mt-0.5 text-[10px] font-bold text-zinc-600">
											Tạo nhanh tòa nhà ở đây rồi tiếp tục tạo phòng cho khách.
										</p>
									</div>
									{#if enabledRentalTypes.length > 1}
										<div class="grid grid-cols-2 gap-2">
											{#each RENTAL_TYPE_OPTIONS.filter( (option) => enabledRentalTypes.includes(option.value) ) as option}
												<button
													type="button"
													onclick={() => (quickPropertyRentalType = option.value)}
													class="rounded-[6px] border-2 border-black px-2 py-1.5 text-[10px] font-black transition-colors {quickPropertyRentalType ===
													option.value
														? 'bg-blue-300 text-black'
														: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
												>
													{option.label}
												</button>
											{/each}
										</div>
									{/if}
									<div class="grid grid-cols-2 gap-2">
										<input
											type="text"
											bind:value={quickPropertyName}
											placeholder={quickPropertyNamePlaceholder()}
											class="rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
										/>
										<input
											type="text"
											bind:value={quickPropertyShortName}
											placeholder="Tên viết tắt"
											class="rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
										/>
										<input
											type="text"
											bind:value={quickPropertyAddress}
											placeholder="Địa chỉ"
											class="col-span-2 rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
										/>
										<input
											type="text"
											bind:value={quickPropertyBlocksText}
											placeholder={`${quickBlockLabel()} - ${quickBlockPlaceholder()}`}
											class="col-span-2 rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
										/>
									</div>
									<button
										type="button"
										disabled={isCreatingProperty}
										onclick={createQuickPropertyForTenant}
										class="flex w-full items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black shadow-secondary transition-colors hover:bg-blue-400 disabled:opacity-50"
									>
										Tạo {quickPropertyLabel()}
										{#if isCreatingProperty}
											<Loader2 class="h-4 w-4 animate-spin" />
										{/if}
									</button>
								</div>
							{/if}
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
						{#if roomAssignMode === 'new'}
							<div class="grid grid-cols-2 gap-3">
								{#if quickPropertyIsApartment()}
									<div class="space-y-1">
										<label for="t-block" class="block text-[10px] font-bold text-zinc-600"
											>Block</label
										>
										<RoomioSelect
											id="t-block"
											bind:value={quickBlockId}
											required
											options={[
												{ value: '', label: 'Chọn block' },
												...(selectedQuickProperty()?.blocks ?? []).map((block) => ({
													value: block.id,
													label: block.name
												}))
											]}
											compact
										/>
									</div>
									<div class="space-y-1">
										<label for="t-unit-number" class="block text-[10px] font-bold text-zinc-600"
											>Số căn</label
										>
										<input
											id="t-unit-number"
											type="text"
											inputmode="text"
											bind:value={quickUnitNumber}
											required
											placeholder="04"
											class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
										/>
									</div>
								{/if}
								<div class="space-y-1">
									<label for="t-room-name" class="block text-[10px] font-bold text-zinc-600"
										>{quickPropertyIsApartment() ? 'Mã phòng trong căn' : 'Số phòng'}</label
									>
									<input
										id="t-room-name"
										type="text"
										bind:value={quickRoomNumber}
										required
										placeholder={quickPropertyIsApartment() ? 'Master, Phòng 2...' : '101'}
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								{#if quickPropertyIsApartment()}
									<div
										class="col-span-2 rounded-lg border-2 border-black bg-blue-50 px-3 py-2 text-xs font-bold text-black"
									>
										Vị trí căn:
										<span class="font-black">
											{buildQuickApartmentUnitDisplay() || 'Chọn block, tầng và số căn'}
										</span>
									</div>
								{/if}
								<div class="space-y-1">
									<label for="t-room-floor" class="block text-[10px] font-bold text-zinc-600"
										>Tầng</label
									>
									<input
										id="t-room-floor"
										type="number"
										bind:value={quickFloor}
										required={quickPropertyIsApartment()}
										placeholder="16"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-room-rent" class="block text-[10px] font-bold text-zinc-600"
										>Giá thuê tháng</label
									>
									<input
										id="t-room-rent"
										type="number"
										bind:value={quickMonthlyRent}
										required
										placeholder="8000000"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="t-room-type" class="block text-[10px] font-bold text-zinc-600"
										>Loại phòng</label
									>
									<RoomioSelect
										id="t-room-type"
										bind:value={quickRoomType}
										options={[
											{ value: 'standard', label: 'Phòng thường' },
											{ value: 'master', label: 'Phòng master' },
											{ value: 'balcony', label: 'Phòng ban công' }
										]}
										compact
									/>
								</div>
								<div class="space-y-1">
									<label for="t-room-area" class="block text-[10px] font-bold text-zinc-600"
										>Diện tích</label
									>
									<input
										id="t-room-area"
										type="number"
										bind:value={quickArea}
										placeholder="50"
										class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
									/>
								</div>
							</div>
						{/if}

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
						<h3 class="text-sm font-black text-blue-600">3. Chỉ số điện nước đầu kỳ</h3>
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
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Hồ sơ khách thuê</span>
					<button
						onclick={() => (isDetailDrawerOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<div class="flex-1 space-y-6 overflow-y-auto p-6">
					<!-- Drawer Header Title -->
					<div>
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
								<span class="text-xs font-bold text-zinc-500">Số điện thoại</span>
								<span class="font-black">{selectedTenant.user.phone}</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="text-xs font-bold text-zinc-500">Email liên hệ</span>
								<span class="font-black">{selectedTenant.user.email}</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="text-xs font-bold text-zinc-500">CCCD / Hộ chiếu</span>
								<span class="font-mono font-black">{selectedTenant.idNumber}</span>
							</div>
						</div>
					</div>

					<!-- Lease Details -->
					<div class="space-y-3">
						<h4 class="text-xs font-black text-zinc-500">Hợp đồng thuê trọ</h4>
						<div class="space-y-2.5 divide-y divide-black/15 text-sm font-semibold text-black">
							<div class="flex items-center justify-between py-2">
								<span class="text-xs font-bold text-zinc-500">Phòng đang ở</span>
								{#if selectedTenant.rooms[0]}
									<span class="font-black text-blue-600">
										{tenantRoomLabel(selectedTenant.rooms[0])}
									</span>
								{:else}
									<span class="font-black text-red-500">Chưa ở phòng nào</span>
								{/if}
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="text-xs font-bold text-zinc-500">Ngày dọn vào ở</span>
								<span class="font-black">
									{new Date(selectedTenant.moveInDate).toLocaleDateString('vi-VN')}
								</span>
							</div>
							<div class="flex items-center justify-between py-2">
								<span class="text-xs font-bold text-zinc-500">Tiền đặt cọc giữ</span>
								<span class="font-black text-green-600"
									>{formatCurrency(selectedTenant.deposit)}</span
								>
							</div>
						</div>
					</div>

					<!-- Hợp đồng (gộp từ trang Hợp đồng cũ) -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h4 class="text-xs font-black text-zinc-500">Hợp đồng</h4>
							{#if !showContractForm}
								<button
									onclick={openContractForm}
									class="flex items-center gap-1 rounded-[6px] border-2 border-black bg-blue-300 px-2.5 py-1 text-[11px] font-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
								>
									Tạo HĐ
								</button>
							{/if}
						</div>

						{#if loadingContracts}
							<div class="flex justify-center py-4">
								<Loader2 class="h-5 w-5 animate-spin text-zinc-400" />
							</div>
						{:else if tenantContracts.length === 0 && !showContractForm}
							<p
								class="rounded-lg border-2 border-dashed border-black/30 bg-white p-3 text-xs font-bold text-zinc-400"
							>
								Chưa có hợp đồng nào cho khách này.
							</p>
						{:else if tenantContracts.length > 0}
							<div class="space-y-2">
								{#each tenantContracts as c (c.id)}
									{@const badge = contractBadge(c)}
									<div class="rounded-lg border-2 border-black bg-white p-3 shadow-secondary">
										<div class="flex items-center justify-between gap-2">
											<span
												class="rounded border-2 border-black px-1.5 text-[10px] font-black {badge.cls}"
												>{badge.text}</span
											>
											<div class="flex items-center gap-1.5">
												{#if c.fileUrl}
													<a
														href={c.fileUrl}
														target="_blank"
														rel="noreferrer"
														class="rounded-[6px] border-2 border-black bg-white px-2 py-1 text-[10px] font-black hover:bg-zinc-50"
														>File</a
													>
												{/if}
												{#if c.status === 'active'}
													<button
														onclick={() => terminateTenantContract(c)}
														title="Chấm dứt"
														class="rounded-[6px] border-2 border-black bg-yellow-200 px-2 py-1 text-[10px] font-black"
													>
														Chấm dứt
													</button>
												{/if}
												<button
													onclick={() => deleteTenantContract(c)}
													title="Xóa"
													class="rounded-[6px] border-2 border-black bg-red-200 px-2 py-1 text-[10px] font-black text-red-800"
												>
													Xóa
												</button>
											</div>
										</div>
										<p class="mt-1.5 text-[11px] font-bold text-zinc-600">
											{c.startDate} → {c.endDate} · {formatCurrency(c.monthlyRent)}/tháng · cọc {formatCurrency(
												c.deposit
											)}
										</p>
										{#if c.notes}
											<p class="mt-1 text-[11px] font-semibold text-zinc-400">{c.notes}</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if showContractForm}
							<div class="space-y-2 rounded-lg border-2 border-black bg-blue-50 p-3">
								<div class="grid grid-cols-2 gap-2">
									<label class="block text-[10px] font-black text-zinc-500"
										>Bắt đầu
										<input
											type="date"
											bind:value={cForm.startDate}
											class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold"
										/>
									</label>
									<label class="block text-[10px] font-black text-zinc-500"
										>Kết thúc
										<input
											type="date"
											bind:value={cForm.endDate}
											class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold"
										/>
									</label>
									<label class="block text-[10px] font-black text-zinc-500"
										>Tiền thuê/tháng
										<input
											type="number"
											bind:value={cForm.monthlyRent}
											class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold"
										/>
									</label>
									<label class="block text-[10px] font-black text-zinc-500"
										>Tiền cọc
										<input
											type="number"
											bind:value={cForm.deposit}
											class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold"
										/>
									</label>
								</div>
								<label class="block text-[10px] font-black text-zinc-500"
									>File hợp đồng (ảnh scan)
									<input
										type="file"
										accept="image/*"
										onchange={handleContractFile}
										class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold file:hidden"
									/>
								</label>
								{#if uploadingContractFile}
									<p class="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
										<Loader2 class="h-3 w-3 animate-spin" /> Đang tải...
									</p>
								{:else if cForm.fileUrl}
									<img
										src={cForm.fileUrl}
										alt="File HĐ"
										class="h-16 rounded border-2 border-black"
									/>
								{/if}
								<label class="block text-[10px] font-black text-zinc-500"
									>Ghi chú
									<textarea
										bind:value={cForm.notes}
										rows="2"
										class="mt-1 w-full rounded-[6px] border-2 border-black px-2 py-1.5 text-xs font-bold"
									></textarea>
								</label>
								<div class="flex gap-2">
									<button
										onclick={createTenantContract}
										disabled={savingContract || uploadingContractFile}
										class="flex-1 rounded-[6px] border-2 border-black bg-blue-300 py-2 text-xs font-black shadow-secondary disabled:opacity-50"
										>{savingContract ? 'Đang lưu...' : 'Lưu hợp đồng'}</button
									>
									<button
										onclick={() => (showContractForm = false)}
										class="rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black"
										>Hủy</button
									>
								</div>
							</div>
						{/if}
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
							Trả phòng (Checkout)
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
