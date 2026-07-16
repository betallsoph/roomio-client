<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import RoomioSelect from '$lib/RoomioSelect.svelte';
	import {
		RENTAL_TYPE_OPTIONS,
		parseRentalTypes,
		propertyLabel as rentalPropertyLabel,
		blockLabel as rentalBlockLabel,
		propertyNamePlaceholder,
		propertyHeadingLabel,
		blockPlaceholder,
		roomCodeLabel as rentalRoomCodeLabel
	} from '$lib/rental-types';
	import { X, Trash2, Loader2, LayoutGrid, List, Search } from '@lucide/svelte';

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

	interface PaymentAccount {
		id: string;
		name: string;
		provider: string;
		isDefault: boolean;
		bankName: string;
		bankCode: string;
		accountNumber: string;
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
		paymentAccountId?: string | null;
		paymentAccount?: PaymentAccount | null;
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
	let paymentAccounts = $state<PaymentAccount[]>([]);
	let enabledRentalTypes = $state<string[]>(['APARTMENT']);

	// Filtering states
	let selectedPropertyId = $state('');
	let selectedBlockId = $state('all');
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

	// Detail Modal / Drawer states
	let selectedRoom = $state<Room | null>(null);
	let isDetailOpen = $state(false);
	let detailPaymentAccountId = $state('');

	// Add Room Dialog states
	let isAddDialogOpen = $state(false);
	let isPropertyDialogOpen = $state(false);
	let returnToRoomAfterProperty = $state(false);
	let newRoomNumber = $state('');
	let newRoomCode = $state('');
	let newUnitNumber = $state('');
	let newRoomType = $state('standard');
	let newFloor = $state('');
	let newMonthlyRent = $state('');
	let newArea = $state('');
	let newBlockId = $state('');
	let newPaymentAccountId = $state('');
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
		newPaymentAccountId = defaultPaymentAccountId();
		isAddDialogOpen = true;
	}

	function openPropertyDialogFromRoom() {
		returnToRoomAfterProperty = true;
		isAddDialogOpen = false;
		isPropertyDialogOpen = true;
	}

	function closePropertyDialog() {
		isPropertyDialogOpen = false;
		if (returnToRoomAfterProperty) {
			returnToRoomAfterProperty = false;
			isAddDialogOpen = true;
		}
	}

	function openRoomDetail(room: Room) {
		selectedRoom = room;
		detailPaymentAccountId = room.paymentAccountId ?? defaultPaymentAccountId();
		isDetailOpen = true;
	}

	async function loadInitialData(profileId: string) {
		isLoading = true;
		try {
			await fetchPaymentAccounts();
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

	async function fetchPaymentAccounts() {
		try {
			const res = await fetch('/api/payment-accounts');
			const data = await res.json();
			if (res.ok) {
				paymentAccounts = data.accounts ?? [];
				if (!newPaymentAccountId) newPaymentAccountId = defaultPaymentAccountId();
			}
		} catch {
			// Không chặn trang phòng nếu tải tài khoản nhận tiền lỗi.
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
					isApartmentRoomForm
						? 'Vui lòng nhập mã phòng trong căn'
						: isWholeUnit()
							? 'Vui lòng nhập tên căn/nhà'
							: 'Vui lòng điền số phòng'
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
					roomType: isWholeUnit() ? 'standard' : newRoomType,
					floor: submitFloor,
					monthlyRent: Number(newMonthlyRent),
					area: newArea ? Number(newArea) : null,
					paymentAccountId: newPaymentAccountId || null
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi tạo phòng');

			toast.success(
				isWholeUnit()
					? `Đã thêm căn/nhà ${submittedRoomNumber} thành công`
					: `Đã thêm phòng ${submittedRoomNumber} thành công`
			);
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
			newPaymentAccountId = defaultPaymentAccountId();

			// Refresh
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreatingRoom = false;
		}
	}

	async function handleCheckout(roomId: string) {
		const checkoutNoun = isWholeUnit() ? 'căn/nhà' : 'phòng';
		if (
			!(await confirmPopup({
				title: isWholeUnit() ? 'Trả căn/nhà' : 'Trả phòng',
				message: `Bạn có chắc chắn muốn trả ${checkoutNoun} cho khách này? Các khoản nợ sẽ được xóa về 0.`,
				confirmLabel: isWholeUnit() ? 'Trả căn/nhà' : 'Trả phòng',
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

			toast.success(isWholeUnit() ? 'Đã trả căn/nhà thành công' : 'Đã trả phòng thành công');
			isDetailOpen = false;
			selectedRoom = null;
			fetchRooms(selectedPropertyId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function updateRoomPaymentAccount() {
		if (!selectedRoom || !detailPaymentAccountId) return;
		try {
			const res = await fetch('/api/rooms', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: selectedRoom.id,
					paymentAccountId: detailPaymentAccountId
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không đổi được tài khoản nhận tiền');
			selectedRoom = data;
			fetchRooms(selectedPropertyId);
			toast.success('Đã đổi tài khoản nhận tiền của phòng');
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

	function defaultPaymentAccountId() {
		return paymentAccounts.find((account) => account.isDefault)?.id ?? paymentAccounts[0]?.id ?? '';
	}

	function paymentAccountOptions() {
		return paymentAccounts.map((account) => ({
			value: account.id,
			label: `${account.name}${account.isDefault ? ' · mặc định' : ''}`
		}));
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
		isDetailOpen = false;
		selectedRoom = null;
	}

	function selectBlock(blockId: string) {
		selectedBlockId = blockId;
		isDetailOpen = false;
		selectedRoom = null;
	}

	function activeRentalType() {
		return getActiveProperty()?.rentalType ?? 'APARTMENT';
	}

	function isWholeUnit() {
		return activeRentalType() === 'WHOLE_UNIT';
	}

	function addRoomButtonLabel() {
		return isWholeUnit() ? 'Thêm căn / nhà' : 'Thêm phòng';
	}

	function addRoomModalTitle() {
		return isWholeUnit() ? 'Thêm căn / nhà mới' : 'Tạo phòng trọ mới';
	}

	function addRoomSubmitLabel() {
		return isWholeUnit() ? 'Thêm căn / nhà' : 'Thêm phòng';
	}

	function emptyRoomsMessage() {
		const type = activeRentalType();
		if (type === 'APARTMENT') {
			return 'Chưa có phòng nào trong căn hộ này. Thêm căn trước, rồi thêm phòng share trong căn.';
		}
		if (type === 'MOTEL') {
			return 'Chưa có phòng nào. Thêm phòng đầu tiên cho khu trọ/CHDV.';
		}
		if (type === 'DORM') {
			return 'Chưa có phòng/box nào.';
		}
		if (type === 'WHOLE_UNIT') {
			return 'Chưa có căn/nhà nào trong danh mục. Thêm căn/nhà đầu tiên.';
		}
		return 'Bắt đầu bằng cách tạo các phòng trọ để thêm thông tin khách thuê.';
	}

	function propertyLabel() {
		return propertyHeadingLabel(activeRentalType());
	}

	function quickPropertyLabel(type = quickPropertyRentalType) {
		return rentalPropertyLabel(type);
	}

	function quickBlockLabel(type = quickPropertyRentalType) {
		return rentalBlockLabel(type);
	}

	function quickPropertyNamePlaceholder(type = quickPropertyRentalType) {
		return propertyNamePlaceholder(type);
	}

	function quickBlockPlaceholder(type = quickPropertyRentalType) {
		return blockPlaceholder(type);
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
			isPropertyDialogOpen = false;
			if (returnToRoomAfterProperty) {
				returnToRoomAfterProperty = false;
				isAddDialogOpen = true;
			}
			toast.success('Đã tạo tòa nhà, giờ thêm phòng luôn được rồi');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreatingProperty = false;
		}
	}

	function blockLabel() {
		return rentalBlockLabel(activeRentalType());
	}

	function roomCodeLabel() {
		return rentalRoomCodeLabel(activeRentalType());
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

<div
	class="space-y-6 transition-[padding] duration-200 {isDetailOpen
		? 'rooms-split-open xl:pr-[calc(clamp(26rem,27vw,32rem)+1.5rem)]'
		: ''}"
>
	<div class="flex justify-start">
		<button
			onclick={(e) => tapBounce(e, openAddRoomDialog)}
			class="toolbar-action flex w-full cursor-pointer items-center justify-center rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-bold text-black shadow-secondary transition-[transform,box-shadow] sm:w-auto"
		>
			<span class="toolbar-action-label">{addRoomButtonLabel()}</span>
		</button>
	</div>

	<!-- Filter bar -->
	<div class="space-y-3">
		<div
			class="grid gap-3 {isDetailOpen
				? 'xl:grid-cols-2'
				: 'xl:grid-cols-[minmax(220px,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'}"
		>
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
					Bấm thêm phòng để tạo tòa nhà trước, xong hệ thống sẽ quay lại màn thêm phòng.
				</p>
			</div>
		</div>
	{:else if rooms.length === 0}
		<div class="flex min-h-[44vh] items-center justify-center text-center">
			<div class="max-w-sm">
				<h3 class="text-base font-black text-zinc-400">
					{isWholeUnit() ? 'Chưa có căn/nhà nào' : `${propertyLabel()} này chưa có phòng`}
				</h3>
				<p class="mt-2 text-sm font-semibold text-zinc-400">
					{emptyRoomsMessage()}
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
		<div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,12rem))] justify-start gap-4">
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
					class="room-card flex aspect-[3/2] cursor-pointer flex-col items-start justify-between rounded-lg border-2 p-4 text-left shadow-secondary transition-[transform,box-shadow] focus:ring-2 focus:ring-blue-300 focus:outline-none {statusColor} {selectedRoom?.id ===
						room.id && isDetailOpen
						? 'ring-2 ring-blue-400 ring-offset-2'
						: ''}"
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
				class="hidden gap-3 border-b-2 border-black bg-zinc-50 px-4 py-3 text-xs font-black text-zinc-600 md:grid {isDetailOpen
					? 'md:grid-cols-[1.2fr_1.5fr_1fr]'
					: 'md:grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_1fr]'}"
			>
				<span>Phòng</span>
				<span class:hidden={isDetailOpen}>Loại</span>
				<span>Khách thuê</span>
				<span>Trạng thái</span>
				<span class:hidden={isDetailOpen}>Giá thuê</span>
				<span class:hidden={isDetailOpen}>Công nợ</span>
			</div>

			<div class="divide-y-2 divide-black">
				{#each visibleRooms as room}
					{@const statusHover =
						room.status === 'empty'
							? 'hover:bg-zinc-50 focus:bg-zinc-50'
							: room.status === 'paid'
								? 'hover:bg-green-50 focus:bg-green-50'
								: 'hover:bg-red-50 focus:bg-red-50'}
					{@const selectedStatusBg =
						room.status === 'empty'
							? 'bg-zinc-50'
							: room.status === 'paid'
								? 'bg-green-50'
								: 'bg-red-50'}
					{@const statusText =
						room.status === 'empty'
							? 'text-zinc-500'
							: room.status === 'paid'
								? 'text-green-700'
								: 'text-red-700'}
					{@const statusLabel = roomStatusLabel(room.status)}
					<button
						type="button"
						onclick={() => openRoomDetail(room)}
						class="grid w-full cursor-pointer gap-3 px-4 py-3 text-left text-sm font-bold transition-colors focus:outline-none md:items-center {statusHover} {isDetailOpen
							? 'md:grid-cols-[1.2fr_1.5fr_1fr]'
							: 'md:grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_1fr]'} {selectedRoom?.id === room.id &&
						isDetailOpen
							? selectedStatusBg
							: 'bg-white'}"
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

						<p class:hidden={isDetailOpen} class="text-zinc-700">
							{getRoomTypeLabel(room.roomType)}
						</p>

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

						<span class="w-fit text-sm font-black {statusText}">
							{statusLabel}
						</span>

						<p class:hidden={isDetailOpen} class="text-black">
							{formatCurrency(room.monthlyRent)}
						</p>
						<p
							class:hidden={isDetailOpen}
							class={room.debtAmount > 0 ? 'text-red-700' : 'text-zinc-500'}
						>
							{formatCurrency(room.debtAmount)}
						</p>
					</button>
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
					<span class="text-base font-black text-black">{addRoomModalTitle()}</span>
					<button
						onclick={(e) => tapBounce(e, () => (isAddDialogOpen = false))}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				{#if properties.length === 0}
					<div class="space-y-4 p-6">
						<div class="rounded-lg bg-blue-50 p-4">
							<p class="text-sm font-black text-black">Chưa có tòa nhà nào để thêm phòng.</p>
							<p class="mt-1 text-xs font-bold text-zinc-600">
								Tạo tòa nhà ở modal riêng, xong hệ thống sẽ quay lại màn thêm phòng này.
							</p>
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
								onclick={(e) => tapBounce(e, openPropertyDialogFromRoom)}
								class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all"
							>
								<span class="modal-action-label">Tạo tòa nhà</span>
							</button>
						</div>
					</div>
				{:else}
					<form onsubmit={handleAddRoom} class="space-y-4 p-6">
						{#if existingUnits().length > 0 && !isWholeUnit()}
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
									<label for="r-num" class="block text-xs font-bold text-zinc-600"
										>{isWholeUnit() ? 'Tên căn/nhà' : 'Số phòng'}</label
									>
									<input
										id="r-num"
										type="text"
										bind:value={newRoomNumber}
										required
										placeholder={isWholeUnit()
											? 'Ví dụ: Căn A1205, Nhà Bình Thạnh'
											: 'Ví dụ: 101, A2'}
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
							{#if !isWholeUnit()}
								<div class="space-y-1">
									<label for="r-type" class="block text-xs font-bold text-zinc-600"
										>Loại phòng</label
									>
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
							{/if}
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

						{#if paymentAccounts.length > 0}
							<div class="space-y-1">
								<label for="r-payment-account" class="block text-xs font-bold text-zinc-600"
									>Tài khoản nhận tiền</label
								>
								<RoomioSelect
									id="r-payment-account"
									bind:value={newPaymentAccountId}
									options={paymentAccountOptions()}
									placeholder="Chọn tài khoản nhận tiền"
								/>
							</div>
						{/if}

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
								class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all disabled:opacity-50"
							>
								<span class="modal-action-label">{addRoomSubmitLabel()}</span>
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

	{#if isPropertyDialogOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={closePropertyDialog}
			onkeydown={(e) => e.key === 'Escape' && closePropertyDialog()}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex w-full max-w-lg animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Tạo tòa nhà</span>
					<button
						onclick={closePropertyDialog}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
						aria-label="Đóng"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<div class="space-y-4 p-6">
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
										{#each option.lines as line}<span class="block">{line}</span>{/each}
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
							onclick={closePropertyDialog}
							class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-all"
						>
							Hủy
						</button>
						<button
							type="button"
							disabled={isCreatingProperty}
							onclick={(e) => tapBounce(e, createQuickPropertyForRoom)}
							class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all disabled:opacity-50"
						>
							<span class="modal-action-label">Tạo tòa nhà</span>
							{#if isCreatingProperty}
								<Loader2 class="h-4 w-4 animate-spin" />
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Room Detail Drawer Slide-over: Brutallist Panel with macOS Header -->
	{#if isDetailOpen && selectedRoom}
		<!-- Overlay -->
		<div
			class="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm xl:pointer-events-none xl:bg-transparent xl:backdrop-blur-none"
			onclick={() => (isDetailOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isDetailOpen = false)}
			role="button"
			tabindex="0"
		>
			<!-- Drawer Content -->
			<div
				class="flex h-full w-full max-w-[920px] animate-[slide-left_0.2s_ease-out] flex-col justify-between overflow-hidden border-l-2 border-black bg-white shadow-primary sm:w-[85vw] lg:w-[52vw] xl:pointer-events-auto xl:w-[clamp(26rem,27vw,32rem)] xl:max-w-none"
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
						<div class="shrink-0">
							<h3 class="text-xl leading-tight font-black text-blue-600">
								Phòng {selectedRoom.roomNumber}
							</h3>
							<p class="mt-1.5 text-xs leading-relaxed font-bold text-zinc-600">
								{getRoomCardMeta(selectedRoom)
									? `${getRoomCardMeta(selectedRoom)} · `
									: ''}{getRoomTypeLabel(selectedRoom.roomType)}
								· {selectedRoom.area || '--'}m² · Tầng {selectedRoom.floor || '--'}
							</p>
						</div>

						<div class="min-h-0 flex-1 space-y-6 overflow-y-auto py-5">
							<section
								class="rounded-lg border-2 border-black px-4 py-3 {selectedRoom.status === 'empty'
									? 'bg-white'
									: selectedRoom.status === 'paid'
										? 'bg-green-50'
										: 'bg-red-50'}"
							>
								<div class="flex items-start justify-between gap-4">
									<div>
										<p class="text-xs font-bold text-zinc-500">Trạng thái phòng</p>
										<p
											class="mt-1 text-lg font-black {selectedRoom.status === 'empty'
												? 'text-zinc-800'
												: selectedRoom.status === 'paid'
													? 'text-green-700'
													: 'text-red-700'}"
										>
											{selectedRoom.status === 'empty'
												? 'Đang trống'
												: selectedRoom.status === 'paid'
													? 'Đã đóng tiền'
													: 'Còn nợ tiền nhà'}
										</p>
									</div>
									{#if selectedRoom.status !== 'empty'}
										<div class="text-right">
											<p class="text-xs font-bold text-zinc-500">Số tiền đang nợ</p>
											<p
												class="mt-1 text-lg font-black {selectedRoom.debtAmount > 0
													? 'text-red-650'
													: 'text-black'}"
											>
												{formatCurrency(selectedRoom.debtAmount)}
											</p>
										</div>
									{/if}
								</div>
							</section>

							<section class="space-y-3">
								<h4 class="text-sm font-black text-blue-600">Khách đang ở</h4>
								{#if selectedRoom.tenant}
									<div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
										<div>
											<p class="text-xs font-bold text-zinc-500">Họ và tên</p>
											<p class="mt-0.5 font-black text-black">{selectedRoom.tenant.user.name}</p>
										</div>
										<div>
											<p class="text-xs font-bold text-zinc-500">Số điện thoại</p>
											<p class="mt-0.5 font-black text-black">{selectedRoom.tenant.user.phone}</p>
										</div>
										<div>
											<p class="text-xs font-bold text-zinc-500">Ngày dọn vào</p>
											<p class="mt-0.5 font-black text-black">
												{new Date(selectedRoom.tenant.moveInDate).toLocaleDateString('vi-VN')}
											</p>
										</div>
										<div>
											<p class="text-xs font-bold text-zinc-500">Tiền đặt cọc</p>
											<p class="text-green-650 mt-0.5 font-black">
												{formatCurrency(selectedRoom.tenant.deposit)}
											</p>
										</div>
									</div>
								{:else}
									<div class="rounded-lg bg-blue-50 px-4 py-5 text-center">
										<p class="text-sm font-bold text-zinc-500">Phòng này đang trống.</p>
										<a
											href="/dashboard/tenants"
											class="modal-action mt-3 inline-flex rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
										>
											<span class="modal-action-label">Thêm khách thuê</span>
										</a>
									</div>
								{/if}
							</section>

							{#if paymentAccounts.length > 0}
								<section class="space-y-3">
									<h4 class="text-sm font-black text-blue-600">Tài khoản nhận tiền</h4>
									<div class="flex gap-2">
										<div class="min-w-0 flex-1">
											<RoomioSelect
												id="room-detail-payment-account"
												bind:value={detailPaymentAccountId}
												options={paymentAccountOptions()}
												compact
											/>
										</div>
										<button
											type="button"
											onclick={(e) => tapBounce(e, () => void updateRoomPaymentAccount())}
											class="modal-action shrink-0 cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black shadow-secondary transition-all"
										>
											<span class="modal-action-label">Lưu</span>
										</button>
									</div>
									<p class="text-[11px] font-bold text-zinc-500">
										Hóa đơn mới của phòng này sẽ dùng tài khoản đang chọn.
									</p>
								</section>
							{/if}

							<section class="space-y-3 border-t border-zinc-200 pt-5">
								<div class="flex items-end justify-between gap-3">
									<div>
										<h4 class="text-sm font-black text-blue-600">Dịch vụ tính tiền</h4>
										<p class="mt-1 text-[11px] font-bold text-zinc-500">
											Giá riêng chỉ áp dụng cho phòng này.
										</p>
									</div>
									{#if selectedRoom.services.length > 0}
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
											class="modal-action cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black shadow-secondary transition-all"
										>
											<span class="modal-action-label">Lưu dịch vụ</span>
										</button>
									{/if}
								</div>

								{#if selectedRoom.services.length === 0}
									<p
										class="rounded-lg bg-zinc-50 px-4 py-4 text-center text-xs font-bold text-zinc-400"
									>
										Phòng này chưa gắn dịch vụ tính tiền.
									</p>
								{:else}
									<div class="divide-y divide-zinc-200">
										{#each selectedRoom.services as config}
											<div
												class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
											>
												<div>
													<p class="text-sm font-black text-black">{config.service.name}</p>
													<p class="mt-0.5 text-xs font-bold text-zinc-500">
														Giá chuẩn {formatCurrency(config.service.defaultRate)} · {serviceTypeLabel(
															config.service.type
														)}
													</p>
												</div>
												<div class="flex items-end gap-2">
													<label class="block text-[10px] font-black text-zinc-500">
														Giá riêng
														<input
															type="number"
															placeholder="Kế thừa"
															value={config.customRate}
															oninput={(e) => {
																const val = (e.target as HTMLInputElement).value;
																config.customRate = val === '' ? null : Number(val);
															}}
															class="mt-1 w-24 rounded-lg border-2 border-black bg-white px-2 py-1.5 text-xs font-bold text-black focus:outline-none"
														/>
													</label>

													{#if config.service.type.startsWith('FLAT_')}
														<label class="block text-[10px] font-black text-zinc-500">
															Số lượng
															<input
																type="number"
																bind:value={config.quantity}
																min="1"
																class="mt-1 w-16 rounded-lg border-2 border-black bg-white px-2 py-1.5 text-xs font-bold text-black focus:outline-none"
															/>
														</label>
													{/if}
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</section>

							<section class="space-y-3 border-t border-zinc-200 pt-5">
								<h4 class="text-sm font-black text-blue-600">Ghi chỉ số</h4>
								{#if selectedRoom.services.filter((service) => service.service.type === 'METERED').length === 0}
									<p
										class="rounded-lg bg-zinc-50 px-4 py-4 text-center text-xs font-bold text-zinc-400"
									>
										Phòng này chưa có dịch vụ điện/nước dạng nhập chỉ số.
									</p>
								{:else}
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

										<div class="flex justify-end">
											<button
												type="submit"
												disabled={isLoggingMeter}
												class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
											>
												<span class="modal-action-label">Ghi chỉ số</span>
												{#if isLoggingMeter}
													<Loader2 class="h-3 w-3 animate-spin" />
												{/if}
											</button>
										</div>
									</form>
								{/if}

								<div>
									<p class="mb-1.5 text-xs font-black text-zinc-500">Lịch sử gần đây</p>
									{#if selectedRoom.meterReadings.length === 0}
										<p class="py-2 text-xs font-bold text-zinc-400">Chưa có lịch sử ghi số.</p>
									{:else}
										<div class="divide-y divide-zinc-200">
											{#each selectedRoom.meterReadings.slice(0, 4) as read}
												{@const sName =
													selectedRoom.services.find((s) => s.serviceId === read.serviceId)?.service
														.name || 'Dịch vụ'}
												<div class="flex items-center justify-between gap-3 py-2 text-xs font-bold">
													<div>
														<p class="font-black text-black">{sName} · {read.month}</p>
														<p class="mt-0.5 text-zinc-500">
															{read.prevValue} → {read.currValue} · tiêu thụ {read.currValue -
																read.prevValue}
														</p>
													</div>
													<p class="shrink-0 text-zinc-400">
														{new Date(read.recordedAt).toLocaleDateString('vi-VN')}
													</p>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</section>

							<section class="space-y-3 border-t border-zinc-200 pt-5">
								<div class="flex items-end justify-between gap-3">
									<div>
										<h4 class="text-sm font-black text-blue-600">Tài sản bàn giao</h4>
										<p class="mt-1 text-[11px] font-bold text-zinc-500">
											Ghi nhanh đồ đạc để tiện bàn giao và checkout.
										</p>
									</div>
								</div>

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
												>Mã kiểm kê</label
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
												>Ghi chú</label
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

									<div class="flex justify-end gap-2">
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
											class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
										>
											<span class="modal-action-label">
												{editingAssetId ? 'Lưu thiết bị' : 'Thêm tài sản'}
											</span>
											{#if isAddingAsset}
												<Loader2 class="h-3 w-3 animate-spin" />
											{/if}
										</button>
									</div>
								</form>

								{#if selectedRoom.assets.length === 0}
									<p
										class="rounded-lg bg-zinc-50 px-4 py-4 text-center text-xs font-bold text-zinc-400"
									>
										Phòng này chưa bàn giao tài sản nào.
									</p>
								{:else}
									<div class="divide-y divide-zinc-200">
										{#each selectedRoom.assets as asset}
											<div class="flex items-center justify-between gap-3 py-2.5 text-xs font-bold">
												<div>
													<p class="font-black text-black">{asset.name}</p>
													<p class="mt-0.5 text-zinc-500">
														{asset.code || 'Không mã'} · {asset.notes || 'Không ghi chú'}
													</p>
												</div>
												<div class="flex items-center gap-3">
													<span
														class="text-[10px] font-black {asset.status === 'good'
															? 'text-green-700'
															: asset.status === 'broken'
																? 'text-red-700'
																: 'text-amber-700'}"
													>
														{asset.status === 'good'
															? 'Tốt'
															: asset.status === 'broken'
																? 'Hỏng'
																: 'Bảo trì'}
													</span>
													<button
														onclick={(e) => tapBounce(e, () => editAsset(asset))}
														class="cursor-pointer text-[10px] font-black text-blue-600"
													>
														Sửa
													</button>
													<button
														onclick={(e) => tapBounce(e, () => handleDeleteAsset(asset.id))}
														class="cursor-pointer text-red-500"
													>
														<Trash2 class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</section>
						</div>
					</div>

					<!-- Action buttons at bottom -->
					<div class="flex shrink-0 gap-3 border-t-2 border-black pt-4">
						{#if selectedRoom.tenantId}
							<button
								onclick={(e) => tapBounce(e, () => handleCheckout(selectedRoom!.id))}
								class="flex flex-1 cursor-pointer items-center justify-center rounded-[6px] border-2 border-black bg-red-200 py-2.5 text-center text-xs font-black text-red-800 shadow-secondary transition-all hover:bg-red-300"
							>
								Khách trả phòng
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
