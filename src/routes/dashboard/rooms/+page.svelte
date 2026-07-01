<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import RoomioSelect from '$lib/RoomioSelect.svelte';
	import {
		Home,
		Building2,
		X,
		User,
		Receipt,
		Zap,
		Droplet,
		Wifi,
		Trash2,
		Wrench,
		FileText,
		Check,
		Loader2,
		LogOut,
		CheckCircle2,
		ArrowRight,
		LayoutGrid,
		List,
		Search
	} from '@lucide/svelte';

	interface Service {
		id: string;
		name: string;
		type: string;
		defaultRate: number;
	}

	interface ServiceConfig {
		id: string;
		serviceId: string;
		service: Service;
		customRate: number | null;
		quantity: number;
	}

	interface MeterReading {
		id: string;
		serviceId: string;
		month: string;
		prevValue: number;
		currValue: number;
		recordedAt: string;
	}

	interface RoomAsset {
		id: string;
		name: string;
		code: string | null;
		status: string;
		notes: string | null;
	}

	interface Tenant {
		id: string;
		user: {
			name: string;
			phone: string;
			email: string;
		};
		idNumber: string;
		moveInDate: string;
		deposit: number;
	}

	interface Room {
		id: string;
		propertyId: string;
		blockId: string | null;
		roomNumber: string;
		roomCode: string | null;
		roomType: string;
		floor: number | null;
		status: string;
		monthlyRent: number;
		area: number | null;
		debtAmount: number;
		tenantId: string | null;
		tenant: Tenant | null;
		services: ServiceConfig[];
		meterReadings: MeterReading[];
		assets: RoomAsset[];
	}

	interface Property {
		id: string;
		name: string;
		shortName: string;
		rentalType: string;
		blocks: { id: string; name: string }[];
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let properties = $state<Property[]>([]);
	let rooms = $state<Room[]>([]);
	let enabledRentalTypes = $state<string[]>(['APARTMENT']);

	// Filtering states
	let selectedPropertyId = $state('');
	let selectedBlockId = $state('all');
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

	// Detail Modal / Drawer states
	let selectedRoom = $state<Room | null>(null);
	let isDetailOpen = $state(false);
	let activeTab = $state<'general' | 'services' | 'meters' | 'assets'>('general');

	// Add Room Dialog states
	let isAddDialogOpen = $state(false);
	let newRoomNumber = $state('');
	let newRoomCode = $state('');
	let newUnitNumber = $state('');
	let newRoomType = $state('standard');
	let newFloor = $state('');
	let newMonthlyRent = $state('');
	let newArea = $state('');
	let newBlockId = $state('');
	let isCreatingRoom = $state(false);
	let selectedUnitCode = $state(''); // '' = tạo căn mới; khác '' = thêm phòng vào căn đã có
	let quickPropertyName = $state('');
	let quickPropertyShortName = $state('');
	let quickPropertyAddress = $state('');
	let quickPropertyBlocksText = $state('');
	let quickPropertyRentalType = $state('APARTMENT');
	let isCreatingProperty = $state(false);

	// Meter Form states
	let meterServiceId = $state('');
	let meterMonth = $state(new Date().toISOString().slice(0, 7)); // YYYY-MM
	let meterPrev = $state('');
	let meterCurr = $state('');
	let isLoggingMeter = $state(false);

	// Asset Form states
	let assetName = $state('');
	let assetCode = $state('');
	let assetStatus = $state('good');
	let assetNotes = $state('');
	let editingAssetId = $state<string | null>(null);
	let isAddingAsset = $state(false);
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
			quickPropertyRentalType = enabledRentalTypes[0] ?? 'APARTMENT';
		}

		// Parse query params (e.g. from building details click)
		const propertyParam = page.url.searchParams.get('propertyId');
		if (propertyParam) {
			selectedPropertyId = propertyParam;
		}

		fetchSettings();
		loadInitialData(session.landlordProfileId);
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
			// Không chặn màn phòng nếu tải cấu hình tài khoản lỗi.
		}
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

	function openAddRoomDialog() {
		selectedUnitCode = '';
		newBlockId = getActiveProperty()?.blocks[0]?.id ?? '';
		isAddDialogOpen = true;
	}

	function openRoomDetail(room: Room) {
		selectedRoom = room;
		activeTab = 'general';
		isDetailOpen = true;
	}

	async function loadInitialData(profileId: string) {
		isLoading = true;
		try {
			// Fetch properties first
			const propRes = await fetch(`/api/properties?landlordId=${profileId}`);
			const propData = await propRes.json();

			if (propRes.ok) {
				properties = propData;
				if (properties.length > 0 && !selectedPropertyId) {
					selectedPropertyId = properties[0].id;
				}
				newBlockId = getActiveProperty()?.blocks[0]?.id ?? '';
			}

			if (selectedPropertyId) {
				await fetchRooms(selectedPropertyId);
			}
		} catch (e: any) {
			toast.error('Lỗi khi tải dữ liệu: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function fetchRooms(propertyId: string) {
		if (!propertyId) return;
		try {
			const blockFilter = selectedBlockId !== 'all' ? `&blockId=${selectedBlockId}` : '';
			const res = await fetch(`/api/rooms?propertyId=${propertyId}${blockFilter}`);
			const data = await res.json();
			if (res.ok) rooms = data;
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách phòng: ' + e.message);
		}
	}

	// Handle building select change
	$effect(() => {
		if (selectedPropertyId) {
			fetchRooms(selectedPropertyId);
		}
	});

	// Handle block filter change
	$effect(() => {
		if (selectedPropertyId && selectedBlockId) {
			fetchRooms(selectedPropertyId);
		}
	});

	async function handleAddRoom(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedPropertyId || isCreatingRoom) return;

		if (!newMonthlyRent) {
			toast.error('Vui lòng điền giá thuê');
			return;
		}

		let submittedRoomNumber: string;
		let submittedRoomCode: string | null;
		let submitBlockId: string | null;
		let submitFloor: number | null;
		const isApartmentRoomForm = activeRentalType() === 'APARTMENT';

		if (selectedUnitCode) {
			// Thêm phòng vào CĂN đã tồn tại — kế thừa block/tầng từ phòng cùng căn
			submittedRoomNumber = newRoomNumber.trim();
			const sibling = rooms.find((r) => getRoomUnitKey(r) === selectedUnitCode);
			submittedRoomCode = sibling?.roomCode ?? null;
			submitBlockId = sibling?.blockId ?? null;
			submitFloor = sibling?.floor ?? (newFloor ? Number(newFloor) : null);
			if (!submittedRoomNumber) {
				toast.error('Vui lòng nhập tên phòng mới trong căn');
				return;
			}
		} else {
			submittedRoomNumber = newRoomNumber.trim();
			submittedRoomCode = isApartmentRoomForm
				? normalizeUnitNumber(newUnitNumber)
				: newRoomCode.trim() || null;
			submitBlockId = newBlockId || null;
			submitFloor = newFloor ? Number(newFloor) : null;

			if (
				isApartmentRoomForm &&
				(!newBlockId || !newFloor || !newUnitNumber || !submittedRoomCode)
			) {
				toast.error('Vui lòng chọn block, nhập tầng và số căn');
				return;
			}
			if (!submittedRoomNumber) {
				toast.error(
					isApartmentRoomForm ? 'Vui lòng nhập mã phòng trong căn' : 'Vui lòng điền số phòng'
				);
				return;
			}
		}

		isCreatingRoom = true;
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					propertyId: selectedPropertyId,
					blockId: submitBlockId,
					roomNumber: submittedRoomNumber,
					roomCode: submittedRoomCode,
					unitNumber: isApartmentRoomForm ? normalizeUnitNumber(newUnitNumber) : undefined,
					roomType: newRoomType,
					floor: submitFloor,
					monthlyRent: Number(newMonthlyRent),
					area: newArea ? Number(newArea) : null
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi tạo phòng');

			toast.success(`Đã thêm phòng ${submittedRoomNumber} thành công`);
			isAddDialogOpen = false;
			// Clear forms
			newRoomNumber = '';
			newRoomCode = '';
			newUnitNumber = '';
			newFloor = '';
			newMonthlyRent = '';
			newArea = '';
			newBlockId = '';
			selectedUnitCode = '';

			// Refresh
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreatingRoom = false;
		}
	}

	async function handleCheckout(roomId: string) {
		if (
			!(await confirmPopup({
				title: 'Trả phòng',
				message: 'Bạn có chắc chắn muốn trả phòng cho khách này? Các khoản nợ sẽ được xóa về 0.',
				confirmLabel: 'Trả phòng',
				tone: 'warning'
			}))
		)
			return;

		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: roomId, action: 'checkout' })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi trả phòng');

			toast.success('Đã trả phòng thành công');
			isDetailOpen = false;
			selectedRoom = null;
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function saveServiceConfig(
		roomId: string,
		configs: { serviceId: string; customRate: string | null; quantity: number }[]
	) {
		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: roomId, action: 'updateServiceConfig', configs })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi lưu dịch vụ');

			toast.success('Đã cập nhật biểu phí riêng của phòng');
			selectedRoom = data;
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function handleLogMeter(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedRoom || isLoggingMeter) return;

		if (!meterServiceId || !meterMonth || meterCurr === '' || meterPrev === '') {
			toast.error('Vui lòng nhập đầy đủ chỉ số');
			return;
		}

		isLoggingMeter = true;
		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: selectedRoom.id,
					action: 'updateMeters',
					serviceId: meterServiceId,
					month: meterMonth,
					prevValue: Number(meterPrev),
					currValue: Number(meterCurr)
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi ghi chỉ số');

			toast.success('Đã lưu chỉ số đo lường thành công');
			selectedRoom = data;
			meterCurr = '';
			meterPrev = '';
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isLoggingMeter = false;
		}
	}

	async function handleAddAsset(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedRoom || isAddingAsset) return;

		if (!assetName) {
			toast.error('Vui lòng nhập tên thiết bị');
			return;
		}

		isAddingAsset = true;
		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: selectedRoom.id,
					action: 'updateAsset',
					assetId: editingAssetId,
					name: assetName,
					code: assetCode || null,
					status: assetStatus,
					notes: assetNotes || null
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi thêm thiết bị');

			toast.success(
				editingAssetId ? 'Đã cập nhật thiết bị bàn giao phòng' : 'Đã thêm thiết bị bàn giao phòng'
			);
			selectedRoom = data;
			resetAssetForm();
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isAddingAsset = false;
		}
	}

	function editAsset(asset: RoomAsset) {
		editingAssetId = asset.id;
		assetName = asset.name;
		assetCode = asset.code || '';
		assetStatus = asset.status;
		assetNotes = asset.notes || '';
	}

	function resetAssetForm() {
		editingAssetId = null;
		assetName = '';
		assetCode = '';
		assetStatus = 'good';
		assetNotes = '';
	}

	async function handleDeleteAsset(assetId: string) {
		if (!selectedRoom) return;
		if (
			!(await confirmPopup({
				title: 'Xóa thiết bị',
				message: 'Bạn muốn thu hồi/xóa thiết bị này?',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;

		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: selectedRoom.id,
					action: 'deleteAsset',
					assetId
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi xóa thiết bị');

			toast.success('Đã xóa thiết bị');
			selectedRoom = data;
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	function getActiveProperty() {
		return properties.find((p) => p.id === selectedPropertyId);
	}

	function getActiveBlocks() {
		return getActiveProperty()?.blocks ?? [];
	}

	function normalizeUnitNumber(value: string) {
		const raw = value.trim().toUpperCase().replace(/\s+/g, '');
		if (!raw) return '';
		return raw;
	}

	function buildApartmentUnitDisplay(blockId: string, floorValue: string, unitValue: string) {
		const blockName = getActiveBlocks()
			.find((block) => block.id === blockId)
			?.name.trim();
		const floorNumber = Number(floorValue);
		const unitNumber = normalizeUnitNumber(unitValue);
		if (!blockName || !Number.isFinite(floorNumber) || !unitNumber) return null;
		return `${blockName.toUpperCase()} · Tầng ${Math.trunc(floorNumber)} · Căn ${unitNumber}`;
	}

	function newApartmentUnitPreview() {
		return buildApartmentUnitDisplay(newBlockId, newFloor, newUnitNumber);
	}

	function selectProperty(propertyId: string) {
		selectedPropertyId = propertyId;
		selectedBlockId = 'all';
		selectedUnitCode = '';
		newBlockId = getActiveProperty()?.blocks[0]?.id ?? '';
	}

	function selectBlock(blockId: string) {
		selectedBlockId = blockId;
	}

	function activeRentalType() {
		return getActiveProperty()?.rentalType ?? 'APARTMENT';
	}

	function propertyLabel() {
		const type = activeRentalType();
		if (type === 'MOTEL') return 'Khu trọ';
		if (type === 'SERVICED_APARTMENT') return 'Căn hộ dịch vụ';
		if (type === 'DORM') return 'KTX / Sleepbox';
		return 'Tòa nhà';
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

	async function createQuickPropertyForRoom() {
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
			selectedPropertyId = data.id;
			selectedBlockId = 'all';
			newBlockId = data.blocks?.[0]?.id ?? '';
			resetQuickPropertyForm();
			toast.success('Đã tạo tòa nhà, giờ thêm phòng luôn được rồi');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreatingProperty = false;
		}
	}

	function blockLabel() {
		const type = activeRentalType();
		if (type === 'MOTEL') return 'Dãy';
		if (type === 'SERVICED_APARTMENT') return 'Tầng / khu';
		if (type === 'DORM') return 'Phòng / khu';
		return 'Block';
	}

	function roomCodeLabel() {
		const type = activeRentalType();
		if (type === 'MOTEL') return 'Mã phòng';
		if (type === 'DORM') return 'Mã giường / box';
		return 'Mã căn hộ';
	}

	// Gom các phòng trong property hiện tại theo MÃ CĂN (một mã căn có thể chứa nhiều phòng)
	function existingUnits() {
		const map = new Map<string, Room[]>();
		for (const r of rooms) {
			const key = getRoomUnitKey(r);
			const list = map.get(key) ?? [];
			list.push(r);
			map.set(key, list);
		}
		return [...map.entries()]
			.map(([key, rs]) => ({ key, label: getRoomCardMeta(rs[0]) || getRoomCode(rs[0]), rooms: rs }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	function unitRoomNames(key: string) {
		return (existingUnits().find((u) => u.key === key)?.rooms ?? [])
			.map((r) => r.roomNumber)
			.join(', ');
	}

	function selectedUnitLabel() {
		return existingUnits().find((u) => u.key === selectedUnitCode)?.label ?? selectedUnitCode;
	}

	function getRoomBlockName(room: Room) {
		return getActiveProperty()?.blocks.find((block) => block.id === room.blockId)?.name ?? '';
	}

	function getRoomCode(room: Room) {
		return room.roomCode || room.roomNumber;
	}

	function getRoomUnitKey(room: Room) {
		return [room.blockId || '', room.floor ?? '', getRoomCode(room)].join('|');
	}

	function getRoomShortName(room: Room) {
		return room.roomNumber;
	}

	function getRoomCardMeta(room: Room) {
		if (activeRentalType() === 'APARTMENT') {
			const code = room.roomCode || '';
			return [
				getRoomBlockName(room),
				room.floor ? `Tầng ${room.floor}` : '',
				code ? `Căn ${code}` : ''
			]
				.filter(Boolean)
				.join(' · ');
		}
		return [getRoomBlockName(room), getRoomCode(room)].filter(Boolean).join(' · ');
	}

	function getRoomCodeAlias(room: Room) {
		if (activeRentalType() !== 'APARTMENT') return '';
		return [getRoomBlockName(room), room.floor ?? '', room.roomCode ?? ''].filter(Boolean).join('');
	}

	function roomStatusLabel(status: string) {
		if (status === 'empty') return 'Trống';
		if (status === 'paid') return 'Đã đóng';
		return 'Còn nợ';
	}

	function normalizeSearch(value: string) {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.replace(/Đ/g, 'd')
			.toLowerCase()
			.trim();
	}

	let visibleRooms = $derived.by(() => {
		const query = normalizeSearch(searchQuery);
		if (!query) return rooms;

		return rooms.filter((room) => {
			const tenant = room.tenant?.user;
			const content = [
				room.roomNumber,
				room.roomCode ?? '',
				getRoomShortName(room),
				getRoomCardMeta(room),
				getRoomCodeAlias(room),
				getRoomBlockName(room),
				getRoomTypeLabel(room.roomType),
				roomStatusLabel(room.status),
				room.floor ? `Tầng ${room.floor}` : '',
				room.area ? `${room.area}m2` : '',
				String(room.monthlyRent),
				formatCurrency(room.monthlyRent),
				String(room.debtAmount),
				tenant?.name ?? '',
				tenant?.phone ?? '',
				tenant?.email ?? ''
			].join(' ');

			return normalizeSearch(content).includes(query);
		});
	});

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}

	function serviceTypeLabel(type: string) {
		if (type === 'METERED') return 'Tự nhập chỉ số';
		if (type === 'MANUAL_AMOUNT') return 'Tự nhập số tiền';
		if (type === 'FLAT_PERSON') return 'Khoán theo người';
		if (type === 'FLAT_VEHICLE') return 'Khoán theo xe';
		return 'Khoán theo phòng';
	}

	function getRoomTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			standard: 'Phòng thường',
			master: 'Phòng master',
			balcony: 'Phòng ban công'
		};
		return labels[type] || type;
	}
</script>

<div class="space-y-6">
	<div class="flex justify-start">
		<button
			onclick={(e) => tapBounce(e, openAddRoomDialog)}
			class="flex w-full cursor-pointer items-center justify-center rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-bold text-black shadow-secondary transition-[transform,box-shadow] sm:w-auto"
		>
			Thêm phòng
		</button>
	</div>

	<!-- Filter bar -->
	<div class="space-y-3">
		<div class="grid gap-3 xl:grid-cols-[minmax(220px,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
			<div class="space-y-1">
				<label for="room-search" class="block text-[10px] font-black text-zinc-500">Tìm phòng</label
				>
				<div class="relative">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
					/>
					<input
						id="room-search"
						type="search"
						bind:value={searchQuery}
						placeholder="A1, tầng 16, căn 04, tên khách..."
						class="h-12 w-full rounded-lg border-2 border-black bg-white pr-9 pl-9 text-sm font-bold text-black placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-300 focus:outline-none"
					/>
					{#if searchQuery}
						<button
							type="button"
							onclick={() => (searchQuery = '')}
							aria-label="Xóa tìm kiếm"
							class="absolute top-1/2 right-2 -translate-y-1/2 rounded-[6px] p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>

			<div class="space-y-1">
				<span class="block text-[10px] font-black text-zinc-500">{propertyLabel()}</span>
				<RoomioSelect
					bind:value={selectedPropertyId}
					onchange={selectProperty}
					options={properties.map((property) => ({
						value: property.id,
						label: property.name
					}))}
					placeholder="Chọn tòa nhà"
					class="[&_button]:h-12"
				/>
			</div>

			{#if getActiveProperty() && getActiveProperty()!.blocks.length > 0}
				<div class="space-y-1">
					<span class="block text-[10px] font-black text-zinc-500">{blockLabel()}</span>
					<RoomioSelect
						bind:value={selectedBlockId}
						onchange={selectBlock}
						options={[
							{ value: 'all', label: `Tất cả ${blockLabel().toLowerCase()}` },
							...getActiveProperty()!.blocks.map((block) => ({
								value: block.id,
								label: block.name
							}))
						]}
						class="[&_button]:h-12"
					/>
				</div>
			{/if}

			<div class="space-y-1">
				<span class="block text-[10px] font-black text-zinc-500">Kiểu xem</span>
				<div
					class="grid h-12 grid-cols-2 rounded-lg border-2 border-black bg-white p-1 shadow-secondary lg:min-w-56"
				>
					<button
						type="button"
						onclick={(e) => tapBounce(e, () => (viewMode = 'grid'))}
						class="flex h-full items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-black transition-colors {viewMode ===
						'grid'
							? 'bg-blue-100 text-black'
							: 'text-zinc-500 hover:bg-zinc-100 hover:text-black'}"
						aria-pressed={viewMode === 'grid'}
					>
						<LayoutGrid class="h-4 w-4" />
						Lưới
					</button>
					<button
						type="button"
						onclick={(e) => tapBounce(e, () => (viewMode = 'list'))}
						class="flex h-full items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-black transition-colors {viewMode ===
						'list'
							? 'bg-blue-100 text-black'
							: 'text-zinc-500 hover:bg-zinc-100 hover:text-black'}"
						aria-pressed={viewMode === 'list'}
					>
						<List class="h-4 w-4" />
						Danh sách
					</button>
				</div>
			</div>
		</div>

		<!-- Quick Legend -->
		<div class="flex flex-wrap gap-4 px-1 text-xs font-bold text-zinc-600 select-none">
			<div class="flex items-center gap-1.5">
				<span class="h-3.5 w-3.5 rounded-md border-2 border-black bg-white"></span>
				<span>Phòng trống</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-3.5 w-3.5 rounded-md border-2 border-black bg-green-200"></span>
				<span>Đã đóng đủ</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-3.5 w-3.5 rounded-md border-2 border-black bg-red-200"></span>
				<span>Chưa thanh toán</span>
			</div>
		</div>
	</div>

	{#if isLoading}
		<div class="flex h-[40vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if properties.length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">Chưa có tòa nhà</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					Bấm thêm phòng để tạo nhanh tòa nhà trước, rồi thêm phòng ngay trong cùng cửa sổ.
				</p>
			</div>
		</div>
	{:else if rooms.length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">{propertyLabel()} này chưa có phòng</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					Bắt đầu bằng cách tạo các phòng trọ để thêm thông tin khách thuê.
				</p>
			</div>
		</div>
	{:else if visibleRooms.length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">Không tìm thấy phòng</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					Thử tìm bằng mã căn, block, tên khách hoặc số điện thoại khác.
				</p>
			</div>
		</div>
	{:else if viewMode === 'grid'}
		<div
			class="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each visibleRooms as room}
				{@const statusColor =
					room.status === 'empty'
						? 'border-black bg-white'
						: room.status === 'paid'
							? 'border-black bg-green-200'
							: 'border-black bg-red-200'}
				{@const statusBadge =
					room.status === 'empty'
						? 'text-zinc-500'
						: room.status === 'paid'
							? 'text-green-800'
							: 'text-red-800'}

				<button
					onclick={(e) => tapBounce(e, () => openRoomDetail(room))}
					class="room-card flex h-32 cursor-pointer flex-col items-start justify-between rounded-lg border-2 p-4 text-left shadow-secondary transition-[transform,box-shadow] focus:ring-2 focus:ring-blue-300 focus:outline-none {statusColor}"
				>
					<div class="w-full min-w-0">
						<span
							class="room-card-number block max-w-full truncate text-xl leading-none font-black text-black"
							>{getRoomShortName(room)}</span
						>
						<p class="mt-1 text-[9px] font-black text-zinc-600">
							{getRoomTypeLabel(room.roomType)}
						</p>
						{#if getRoomCardMeta(room)}
							<p class="mt-0.5 truncate text-[9px] font-black text-zinc-500">
								{getRoomCardMeta(room)}
							</p>
						{/if}
					</div>

					<div class="mt-2 flex w-full items-end justify-between border-t border-black/15 pt-2">
						<span class="text-[10px] font-black {statusBadge}">
							{roomStatusLabel(room.status)}
						</span>
						<span class="text-xs font-black text-black">{formatCurrency(room.monthlyRent)}</span>
					</div>
				</button>
			{/each}
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
			<div
				class="hidden grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_1fr_90px] gap-3 border-b-2 border-black bg-zinc-50 px-4 py-3 text-[10px] font-black text-zinc-500 md:grid"
			>
				<span>Phòng</span>
				<span>Loại</span>
				<span>Khách thuê</span>
				<span>Trạng thái</span>
				<span>Giá thuê</span>
				<span>Công nợ</span>
				<span class="text-right">Thao tác</span>
			</div>

			<div class="divide-y-2 divide-black">
				{#each visibleRooms as room}
					{@const statusBg =
						room.status === 'empty'
							? 'bg-white'
							: room.status === 'paid'
								? 'bg-green-50'
								: 'bg-red-50'}
					{@const statusPill =
						room.status === 'empty'
							? 'bg-white text-zinc-600'
							: room.status === 'paid'
								? 'bg-green-200 text-green-900'
								: 'bg-red-200 text-red-900'}
					{@const statusLabel = roomStatusLabel(room.status)}
					<div
						class="grid gap-3 px-4 py-3 text-sm font-bold md:grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_1fr_90px] md:items-center {statusBg}"
					>
						<div>
							<p class="truncate text-lg leading-none font-black text-black">
								Phòng {getRoomShortName(room)}
							</p>
							{#if getRoomCardMeta(room)}
								<p class="mt-1 truncate text-[10px] font-black text-zinc-500">
									{getRoomCardMeta(room)}
								</p>
							{/if}
							{#if room.floor}
								<p class="mt-1 text-[10px] font-black text-zinc-500">Tầng {room.floor}</p>
							{/if}
						</div>

						<p class="text-zinc-700">{getRoomTypeLabel(room.roomType)}</p>

						<div class="min-w-0">
							<p class="truncate text-black">
								{room.tenant ? room.tenant.user.name : 'Chưa có khách'}
							</p>
							{#if room.tenant}
								<p class="mt-0.5 truncate text-xs font-semibold text-zinc-500">
									{room.tenant.user.phone}
								</p>
							{/if}
						</div>

						<span
							class="w-fit rounded-md border-2 border-black px-2 py-1 text-[10px] font-black {statusPill}"
						>
							{statusLabel}
						</span>

						<p class="text-black">{formatCurrency(room.monthlyRent)}</p>
						<p class={room.debtAmount > 0 ? 'text-red-700' : 'text-zinc-500'}>
							{formatCurrency(room.debtAmount)}
						</p>

						<button
							onclick={(e) => tapBounce(e, () => openRoomDetail(room))}
							class="w-full rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black shadow-secondary transition-[background-color,transform,box-shadow] hover:bg-blue-400 md:w-auto"
						>
							Chi tiết
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Add Room Dialog -->
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
				class="relative flex w-full max-w-lg animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Tạo phòng trọ mới</span>
					<button
						onclick={(e) => tapBounce(e, () => (isAddDialogOpen = false))}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				{#if properties.length === 0}
					<div class="space-y-4 p-6">
						<div class="rounded-lg border-2 border-black bg-blue-50 p-3">
							<p class="text-sm font-black text-black">Tạo tòa nhà trước trong cùng flow</p>
							<p class="mt-1 text-xs font-bold text-zinc-600">
								Tạo xong, form thêm phòng sẽ hiện ngay ở bước kế tiếp.
							</p>
						</div>

						{#if enabledRentalTypes.length > 1}
							<div class="space-y-2">
								<p class="text-xs font-bold text-zinc-600">Loại hình</p>
								<div class="grid grid-cols-2 gap-2">
									{#each RENTAL_TYPE_OPTIONS.filter( (option) => enabledRentalTypes.includes(option.value) ) as option}
										<button
											type="button"
											onclick={() => (quickPropertyRentalType = option.value)}
											class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {quickPropertyRentalType ===
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
								<label for="quick-p-name" class="block text-xs font-bold text-zinc-600"
									>Tên {quickPropertyLabel()}</label
								>
								<input
									id="quick-p-name"
									type="text"
									bind:value={quickPropertyName}
									placeholder={quickPropertyNamePlaceholder()}
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label for="quick-p-short" class="block text-xs font-bold text-zinc-600"
									>Tên viết tắt</label
								>
								<input
									id="quick-p-short"
									type="text"
									bind:value={quickPropertyShortName}
									placeholder="Ví dụ: HAGL3"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
								/>
							</div>
						</div>

						<div class="space-y-1">
							<label for="quick-p-address" class="block text-xs font-bold text-zinc-600"
								>Địa chỉ</label
							>
							<input
								id="quick-p-address"
								type="text"
								bind:value={quickPropertyAddress}
								placeholder="Nhập địa chỉ chi tiết"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
							/>
						</div>

						<div class="space-y-1">
							<label for="quick-p-blocks" class="block text-xs font-bold text-zinc-600"
								>{quickBlockLabel()}{quickPropertyRentalType === 'APARTMENT'
									? ''
									: ' (tùy chọn)'}</label
							>
							<input
								id="quick-p-blocks"
								type="text"
								bind:value={quickPropertyBlocksText}
								placeholder={quickBlockPlaceholder()}
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
							/>
						</div>

						<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
							<button
								type="button"
								onclick={(e) => tapBounce(e, () => (isAddDialogOpen = false))}
								class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-all"
							>
								Hủy
							</button>
							<button
								type="button"
								disabled={isCreatingProperty}
								onclick={(e) => tapBounce(e, createQuickPropertyForRoom)}
								class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
							>
								Tạo tòa nhà
								{#if isCreatingProperty}
									<Loader2 class="h-4 w-4 animate-spin" />
								{/if}
							</button>
						</div>
					</div>
				{:else}
					<form onsubmit={handleAddRoom} class="space-y-4 p-6">
						{#if existingUnits().length > 0}
							<div class="space-y-1">
								<label for="r-unit-sel" class="block text-xs font-bold text-zinc-600">Căn hộ</label>
								<RoomioSelect
									id="r-unit-sel"
									bind:value={selectedUnitCode}
									options={[
										{ value: '', label: 'Tạo căn mới' },
										...existingUnits().map((unit) => ({
											value: unit.key,
											label: `${unit.label} · ${unit.rooms.length} phòng`
										}))
									]}
								/>
							</div>
						{/if}

						{#if selectedUnitCode}
							<div class="space-y-1">
								<label for="r-name" class="block text-xs font-bold text-zinc-600"
									>Tên phòng mới trong căn {selectedUnitLabel()}</label
								>
								<input
									id="r-name"
									type="text"
									bind:value={newRoomNumber}
									required
									placeholder="Ví dụ: Phòng 2, Master, Giường A..."
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
								/>
							</div>
							<div
								class="rounded-lg border-2 border-black bg-blue-50 px-3 py-2 text-xs font-bold text-black"
							>
								Phòng đang có trong căn: {unitRoomNames(selectedUnitCode) || '--'}
							</div>
						{:else if activeRentalType() === 'APARTMENT'}
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-1">
									<label for="r-num" class="block text-xs font-bold text-zinc-600"
										>Mã phòng trong căn</label
									>
									<input
										id="r-num"
										type="text"
										bind:value={newRoomNumber}
										required
										placeholder="Ví dụ: Master, Phòng 2, Bed A"
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="r-block" class="block text-xs font-bold text-zinc-600">Block</label>
									<RoomioSelect
										id="r-block"
										bind:value={newBlockId}
										required
										options={[
											{ value: '', label: 'Chọn block' },
											...getActiveBlocks().map((block) => ({
												value: block.id,
												label: block.name
											}))
										]}
									/>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-1">
									<label for="r-unit" class="block text-xs font-bold text-zinc-600">Số căn</label>
									<input
										id="r-unit"
										type="text"
										inputmode="text"
										bind:value={newUnitNumber}
										required
										placeholder="Ví dụ: 04"
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="r-floor" class="block text-xs font-bold text-zinc-600">Tầng</label>
									<input
										id="r-floor"
										type="number"
										bind:value={newFloor}
										required
										placeholder="16"
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
							</div>
							<div
								class="rounded-lg border-2 border-black bg-blue-50 px-3 py-2 text-xs font-bold text-black"
							>
								Vị trí căn:
								<span class="font-black"
									>{newApartmentUnitPreview() || 'Chọn block, tầng và số căn'}</span
								>
							</div>
						{:else}
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-1">
									<label for="r-num" class="block text-xs font-bold text-zinc-600">Số phòng</label>
									<input
										id="r-num"
										type="text"
										bind:value={newRoomNumber}
										required
										placeholder="Ví dụ: 101, A2"
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
								<div class="space-y-1">
									<label for="r-code" class="block text-xs font-bold text-zinc-600"
										>{roomCodeLabel()} (tùy chọn)</label
									>
									<input
										id="r-code"
										type="text"
										bind:value={newRoomCode}
										placeholder="Ví dụ: CH-101"
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-1">
								<label for="r-type" class="block text-xs font-bold text-zinc-600">Loại phòng</label>
								<RoomioSelect
									id="r-type"
									bind:value={newRoomType}
									options={[
										{ value: 'standard', label: 'Phòng thường' },
										{ value: 'master', label: 'Phòng master' },
										{ value: 'balcony', label: 'Phòng ban công' }
									]}
								/>
							</div>
							{#if activeRentalType() !== 'APARTMENT'}
								<div class="space-y-1">
									<label for="r-floor" class="block text-xs font-bold text-zinc-600">Tầng</label>
									<input
										id="r-floor"
										type="number"
										bind:value={newFloor}
										placeholder="1, 2, 3..."
										class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
									/>
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-1">
								<label for="r-rent" class="block text-xs font-bold text-zinc-600"
									>Giá thuê tháng (đ)</label
								>
								<input
									id="r-rent"
									type="number"
									bind:value={newMonthlyRent}
									required
									placeholder="Ví dụ: 3000000"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label for="r-area" class="block text-xs font-bold text-zinc-600"
									>Diện tích (m²)</label
								>
								<input
									id="r-area"
									type="number"
									bind:value={newArea}
									placeholder="Ví dụ: 25"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold focus:outline-none"
								/>
							</div>
						</div>

						{#if activeRentalType() !== 'APARTMENT' && getActiveProperty() && getActiveProperty()!.blocks.length > 0}
							<div class="space-y-1">
								<label for="r-block" class="block text-xs font-bold text-zinc-600"
									>{blockLabel()}</label
								>
								<RoomioSelect
									id="r-block"
									bind:value={newBlockId}
									options={[
										{ value: '', label: `Không có ${blockLabel().toLowerCase()}` },
										...getActiveProperty()!.blocks.map((block) => ({
											value: block.id,
											label: block.name
										}))
									]}
								/>
							</div>
						{/if}

						<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
							<button
								type="button"
								onclick={(e) => tapBounce(e, () => (isAddDialogOpen = false))}
								class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-all"
							>
								Hủy
							</button>
							<button
								type="submit"
								disabled={isCreatingRoom}
								class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
							>
								Thêm phòng
								{#if isCreatingRoom}
									<Loader2 class="h-4 w-4 animate-spin" />
								{/if}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Room Detail Drawer Slide-over: Brutallist Panel with macOS Header -->
	{#if isDetailOpen && selectedRoom}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
			onclick={() => (isDetailOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isDetailOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Drawer Content -->
			<div
				class="flex h-full w-full max-w-[920px] animate-[slide-left_0.2s_ease-out] flex-col justify-between overflow-hidden border-l-2 border-black bg-white shadow-primary sm:w-[85vw] lg:w-[52vw]"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black"
						>Quản lý Phòng {selectedRoom.roomNumber}</span
					>
					<button
						onclick={(e) => tapBounce(e, () => (isDetailOpen = false))}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<div class="flex min-h-0 flex-1 flex-col p-6">
					<div class="flex min-h-0 flex-1 flex-col">
						<!-- Header Title Info -->
						<div class="flex shrink-0 items-center gap-3">
							<Home class="h-6 w-6 text-blue-500" />
							<div>
								<h3 class="text-lg leading-none font-black text-black">
									Phòng {selectedRoom.roomNumber}
								</h3>
								<p class="mt-1.5 text-xs font-bold text-zinc-600">
									{getRoomCardMeta(selectedRoom) ? `${getRoomCardMeta(selectedRoom)} | ` : ''}Loại:
									{getRoomTypeLabel(selectedRoom.roomType)} | Diện tích: {selectedRoom.area ||
										'--'}m² | Tầng: {selectedRoom.floor || '--'}
								</p>
							</div>
						</div>

						<!-- Tab Selector inside Drawer -->
						<div
							class="mt-4 flex shrink-0 gap-1 rounded-lg border-2 border-b border-black border-black/15 bg-white/50 p-1 select-none"
						>
							<button
								onclick={(e) => tapBounce(e, () => (activeTab = 'general'))}
								class="flex-1 cursor-pointer rounded-[6px] py-1.5 text-xs font-black transition-all {activeTab ===
								'general'
									? 'border border-black bg-blue-300 text-black'
									: 'border border-transparent text-zinc-500 hover:text-black'}"
							>
								Chung
							</button>
							<button
								onclick={(e) => tapBounce(e, () => (activeTab = 'services'))}
								class="flex-1 cursor-pointer rounded-[6px] py-1.5 text-xs font-black transition-all {activeTab ===
								'services'
									? 'border border-black bg-blue-300 text-black'
									: 'border border-transparent text-zinc-500 hover:text-black'}"
							>
								Dịch vụ
							</button>
							<button
								onclick={(e) => tapBounce(e, () => (activeTab = 'meters'))}
								class="flex-1 cursor-pointer rounded-[6px] py-1.5 text-xs font-black transition-all {activeTab ===
								'meters'
									? 'border border-black bg-blue-300 text-black'
									: 'border border-transparent text-zinc-500 hover:text-black'}"
							>
								Ghi số
							</button>
							<button
								onclick={(e) => tapBounce(e, () => (activeTab = 'assets'))}
								class="flex-1 cursor-pointer rounded-[6px] py-1.5 text-xs font-black transition-all {activeTab ===
								'assets'
									? 'border border-black bg-blue-300 text-black'
									: 'border border-transparent text-zinc-500 hover:text-black'}"
							>
								Tài sản
							</button>
						</div>

						<!-- Tab Content Scrollable -->
						<div class="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
							<!-- GENERAL TAB -->
							{#if activeTab === 'general'}
								<div class="space-y-4">
									<!-- Status Card -->
									<div
										class="flex items-center justify-between rounded-lg border-2 border-black p-4 shadow-secondary {selectedRoom.status ===
										'empty'
											? 'bg-white'
											: selectedRoom.status === 'paid'
												? 'bg-green-200'
												: 'bg-red-200'}"
									>
										<div>
											<span class="text-xs font-black text-zinc-600">Trạng thái phòng</span>
											<h4
												class="mt-1 text-sm font-black {selectedRoom.status === 'empty'
													? 'text-zinc-700'
													: selectedRoom.status === 'paid'
														? 'text-green-850'
														: 'text-red-850'}"
											>
												{selectedRoom.status === 'empty'
													? 'Đang trống'
													: selectedRoom.status === 'paid'
														? 'Đã đóng tiền'
														: 'Còn nợ tiền nhà'}
											</h4>
										</div>
										{#if selectedRoom.status !== 'empty'}
											<div class="text-right">
												<span class="text-xs font-black text-zinc-600">Số tiền đang nợ</span>
												<p class="text-red-650 mt-1 text-lg font-black">
													{formatCurrency(selectedRoom.debtAmount)}
												</p>
											</div>
										{/if}
									</div>

									<!-- Tenant Details -->
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<h4 class="text-sm font-black text-blue-600">Thông tin khách thuê</h4>
										{#if selectedRoom.tenant}
											<div class="grid grid-cols-2 gap-3 text-sm font-semibold">
												<div>
													<p class="text-xs font-bold text-zinc-400">Họ và tên</p>
													<p class="font-bold text-black">{selectedRoom.tenant.user.name}</p>
												</div>
												<div>
													<p class="text-xs font-bold text-zinc-400">Số điện thoại</p>
													<p class="font-bold text-black">{selectedRoom.tenant.user.phone}</p>
												</div>
												<div>
													<p class="text-xs font-bold text-zinc-400">Ngày dọn vào</p>
													<p class="font-bold text-black">
														{new Date(selectedRoom.tenant.moveInDate).toLocaleDateString('vi-VN')}
													</p>
												</div>
												<div>
													<p class="text-xs font-bold text-zinc-400">Tiền đặt cọc</p>
													<p class="text-green-650 font-black">
														{formatCurrency(selectedRoom.tenant.deposit)}
													</p>
												</div>
											</div>
										{:else}
											<div class="space-y-3 py-4 text-center">
												<p class="text-sm font-semibold text-zinc-500">
													Chưa có thông tin khách thuê phòng này.
												</p>
												<a
													href="/dashboard/tenants"
													class="inline-flex rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
												>
													Đến trang Thêm khách thuê <ArrowRight class="h-3.5 w-3.5" />
												</a>
											</div>
										{/if}
									</div>
								</div>

								<!-- SERVICES TAB -->
							{:else if activeTab === 'services'}
								<div class="space-y-4">
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<div class="flex items-center justify-between border-b pb-2">
											<h4 class="text-xs font-black text-zinc-500">Dịch vụ phòng trọ sử dụng</h4>
											<span class="text-[10px] font-bold text-zinc-400"
												>Nhấn Lưu để đổi biểu phí riêng</span
											>
										</div>

										<div class="divide-y divide-zinc-200">
											{#each selectedRoom.services as config}
												<div
													class="flex flex-col items-start justify-between gap-3 py-3 sm:flex-row sm:items-center"
												>
													<div>
														<p class="text-sm font-bold text-black">{config.service.name}</p>
														<p class="mt-0.5 text-xs font-semibold text-zinc-500">
															Giá chuẩn: {formatCurrency(config.service.defaultRate)} | Loại: {serviceTypeLabel(
																config.service.type
															)}
														</p>
													</div>
													<div class="flex items-center gap-2">
														<div class="space-y-1">
															<span class="block text-[9px] font-black text-zinc-400"
																>Giá riêng (đ)</span
															>
															<input
																type="number"
																placeholder="Kế thừa"
																value={config.customRate}
																oninput={(e) => {
																	const val = (e.target as HTMLInputElement).value;
																	config.customRate = val === '' ? null : Number(val);
																}}
																class="w-24 rounded-lg border-2 border-black bg-white px-2 py-1 text-xs font-bold focus:outline-none"
															/>
														</div>

														{#if config.service.type.startsWith('FLAT_')}
															<div class="space-y-1">
																<span class="block text-[9px] font-black text-zinc-400"
																	>Số lượng</span
																>
																<input
																	type="number"
																	bind:value={config.quantity}
																	min="1"
																	class="w-16 rounded-lg border-2 border-black bg-white px-2 py-1 text-xs font-bold focus:outline-none"
																/>
															</div>
														{/if}
													</div>
												</div>
											{/each}
										</div>

										<div class="flex justify-end border-t pt-3">
											<button
												onclick={(e) =>
													tapBounce(e, () =>
														saveServiceConfig(
															selectedRoom!.id,
															selectedRoom!.services.map((s) => ({
																serviceId: s.serviceId,
																customRate: s.customRate === null ? null : s.customRate.toString(),
																quantity: s.quantity
															}))
														)
													)}
												class="cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
											>
												Lưu cấu hình dịch vụ
											</button>
										</div>
									</div>
								</div>

								<!-- METERS TAB -->
							{:else if activeTab === 'meters'}
								<div class="space-y-4">
									<!-- Log Meter Reading Form -->
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<h4 class="text-sm font-black text-blue-600">Nhập chỉ số điện/nước mới</h4>
										<form onsubmit={handleLogMeter} class="space-y-3">
											<div class="grid grid-cols-2 gap-3">
												<div class="space-y-1">
													<label for="m-serv" class="block text-[10px] font-black text-zinc-500"
														>Dịch vụ</label
													>
													<RoomioSelect
														id="m-serv"
														bind:value={meterServiceId}
														required
														options={[
															{ value: '', label: 'Chọn dịch vụ' },
															...selectedRoom.services
																.filter((service) => service.service.type === 'METERED')
																.map((service) => ({
																	value: service.serviceId,
																	label: service.service.name
																}))
														]}
														compact
													/>
												</div>
												<div class="space-y-1">
													<label for="m-month" class="block text-[10px] font-black text-zinc-500"
														>Tháng ghi</label
													>
													<input
														id="m-month"
														type="month"
														bind:value={meterMonth}
														required
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:outline-none"
													/>
												</div>
											</div>

											<div class="grid grid-cols-2 gap-3">
												<div class="space-y-1">
													<label for="m-prev" class="block text-[10px] font-black text-zinc-500"
														>Chỉ số cũ</label
													>
													<input
														id="m-prev"
														type="number"
														bind:value={meterPrev}
														required
														placeholder="Số cũ"
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-black text-black focus:outline-none"
													/>
												</div>
												<div class="space-y-1">
													<label for="m-curr" class="block text-[10px] font-black text-zinc-500"
														>Chỉ số mới</label
													>
													<input
														id="m-curr"
														type="number"
														bind:value={meterCurr}
														required
														placeholder="Số mới"
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-black text-black focus:outline-none"
													/>
												</div>
											</div>

											<div class="flex justify-end pt-2">
												<button
													type="submit"
													disabled={isLoggingMeter}
													class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
												>
													Ghi chỉ số
													{#if isLoggingMeter}
														<Loader2 class="h-3 w-3 animate-spin" />
													{/if}
												</button>
											</div>
										</form>
									</div>

									<!-- Readings History -->
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<h4 class="text-sm font-black text-blue-600">Lịch sử ghi số</h4>
										{#if selectedRoom.meterReadings.length === 0}
											<p class="py-2 text-center text-xs font-semibold text-zinc-400">
												Chưa có lịch sử đo lường nào.
											</p>
										{:else}
											<div class="overflow-x-auto">
												<table class="w-full border-collapse text-left text-xs">
													<thead>
														<tr class="border-b-2 border-black bg-zinc-50 font-black text-zinc-500">
															<th class="px-3 py-2">Tháng</th>
															<th class="px-3 py-2">Dịch vụ</th>
															<th class="px-3 py-2">Chỉ số Cũ - Mới</th>
															<th class="px-3 py-2">Tiêu thụ</th>
															<th class="px-3 py-2 text-right">Ngày ghi</th>
														</tr>
													</thead>
													<tbody>
														{#each selectedRoom.meterReadings as read}
															{@const sName =
																selectedRoom.services.find((s) => s.serviceId === read.serviceId)
																	?.service.name || 'Dịch vụ'}
															<tr class="border-zinc-150 border-b font-semibold text-zinc-600">
																<td class="px-3 py-2 font-black text-black">{read.month}</td>
																<td class="px-3 py-2 text-zinc-800">{sName}</td>
																<td class="px-3 py-2">{read.prevValue} → {read.currValue}</td>
																<td class="px-3 py-2 font-black text-black"
																	>{read.currValue - read.prevValue}</td
																>
																<td class="px-3 py-2 text-right text-zinc-400"
																	>{new Date(read.recordedAt).toLocaleDateString('vi-VN')}</td
																>
															</tr>
														{/each}
													</tbody>
												</table>
											</div>
										{/if}
									</div>
								</div>

								<!-- ASSETS TAB -->
							{:else if activeTab === 'assets'}
								<div class="space-y-4">
									<!-- Add Asset Form -->
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<h4 class="text-sm font-black text-blue-600">
											{editingAssetId ? 'Sửa thiết bị bàn giao' : 'Thêm thiết bị bàn giao mới'}
										</h4>
										<form onsubmit={handleAddAsset} class="space-y-3">
											<div class="grid grid-cols-2 gap-3">
												<div class="space-y-1">
													<label for="a-name" class="block text-[10px] font-black text-zinc-500"
														>Tên thiết bị</label
													>
													<input
														id="a-name"
														type="text"
														bind:value={assetName}
														required
														placeholder="Ví dụ: Máy điều hòa LG"
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold focus:outline-none"
													/>
												</div>
												<div class="space-y-1">
													<label for="a-code" class="block text-[10px] font-black text-zinc-500"
														>Mã kiểm kê (Tùy chọn)</label
													>
													<input
														id="a-code"
														type="text"
														bind:value={assetCode}
														placeholder="Ví dụ: ML-01"
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold focus:outline-none"
													/>
												</div>
											</div>

											<div class="grid grid-cols-2 gap-3">
												<div class="space-y-1">
													<label for="a-status" class="block text-[10px] font-black text-zinc-500"
														>Tình trạng</label
													>
													<RoomioSelect
														id="a-status"
														bind:value={assetStatus}
														options={[
															{ value: 'good', label: 'Hoạt động tốt' },
															{ value: 'broken', label: 'Đã hỏng' },
															{ value: 'need_maintenance', label: 'Cần bảo trì' }
														]}
														compact
													/>
												</div>
												<div class="space-y-1">
													<label for="a-notes" class="block text-[10px] font-black text-zinc-500"
														>Ghi chú thêm</label
													>
													<input
														id="a-notes"
														type="text"
														bind:value={assetNotes}
														placeholder="Hao mòn nhẹ, mới mua..."
														class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold focus:outline-none"
													/>
												</div>
											</div>

											<div class="flex justify-end gap-2 pt-2">
												{#if editingAssetId}
													<button
														type="button"
														onclick={(e) => tapBounce(e, resetAssetForm)}
														class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-black text-black"
													>
														Hủy sửa
													</button>
												{/if}
												<button
													type="submit"
													disabled={isAddingAsset}
													class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
												>
													{editingAssetId ? 'Lưu thiết bị' : 'Bàn giao thiết bị'}
													{#if isAddingAsset}
														<Loader2 class="h-3 w-3 animate-spin" />
													{/if}
												</button>
											</div>
										</form>
									</div>

									<!-- Assets List -->
									<div
										class="space-y-3 rounded-lg border-2 border-black bg-white p-4 shadow-secondary"
									>
										<h4 class="text-sm font-black text-blue-600">
											Danh sách thiết bị ({selectedRoom.assets.length})
										</h4>
										{#if selectedRoom.assets.length === 0}
											<p class="py-2 text-center text-xs font-semibold text-zinc-400">
												Phòng này chưa bàn giao thiết bị nào.
											</p>
										{:else}
											<div class="divide-y divide-zinc-200">
												{#each selectedRoom.assets as asset}
													<div
														class="flex items-center justify-between py-2.5 text-xs font-semibold"
													>
														<div>
															<p class="font-black text-black">{asset.name}</p>
															<p class="mt-0.5 text-[10px] text-zinc-400">
																Mã: {asset.code || 'không có'} | Ghi chú: {asset.notes || '--'}
															</p>
														</div>
														<div class="flex items-center gap-3">
															<span
																class="rounded-full border border-black px-2 py-0.5 text-[9px] font-black {asset.status ===
																'good'
																	? 'bg-green-200 text-green-800'
																	: asset.status === 'broken'
																		? 'bg-red-200 text-red-800'
																		: 'bg-amber-200 text-amber-800'}"
															>
																{asset.status === 'good'
																	? 'Tốt'
																	: asset.status === 'broken'
																		? 'Hỏng'
																		: 'Bảo trì'}
															</span>
															<button
																onclick={(e) => tapBounce(e, () => editAsset(asset))}
																class="cursor-pointer rounded-[6px] border border-black bg-white px-2 py-1 text-[10px] font-black text-black transition-colors"
															>
																Sửa
															</button>
															<button
																onclick={(e) => tapBounce(e, () => handleDeleteAsset(asset.id))}
																class="cursor-pointer rounded-lg border border-transparent p-1.5 text-red-500 transition-colors hover:bg-red-50"
															>
																<Trash2 class="h-4 w-4" />
															</button>
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Action buttons at bottom -->
					<div class="flex shrink-0 gap-3 border-t-2 border-black pt-4">
						{#if selectedRoom.tenantId}
							<button
								onclick={(e) => tapBounce(e, () => handleCheckout(selectedRoom!.id))}
								class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-red-200 py-2.5 text-center text-xs font-black text-red-800 shadow-secondary transition-all hover:bg-red-300"
							>
								Khách trả phòng (Checkout)
								<LogOut class="h-4 w-4" />
							</button>
						{/if}
						<button
							onclick={(e) => tapBounce(e, () => (isDetailOpen = false))}
							class="hover:bg-zinc-150 flex-1 cursor-pointer rounded-[6px] border-2 border-black bg-white py-2.5 text-center text-xs font-black text-black shadow-secondary transition-all"
						>
							Đóng
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.room-card-number {
		display: inline-block;
		transform-origin: left center;
		transition: color 160ms ease;
	}

	.room-card:hover .room-card-number {
		color: #2563eb;
		animation: room-number-pop 320ms ease-out;
	}

	@keyframes room-number-pop {
		0% {
			transform: scale(1);
		}
		45% {
			transform: scale(1.16);
		}
		72% {
			transform: scale(0.98);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes slide-left {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
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
