<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		Eye,
		Loader2,
		Lock,
		LogOut,
		Plug,
		Plus,
		Search,
		Sliders,
		Unlock,
		UserPlus,
		X
	} from '@lucide/svelte';

	let { landlordId }: { landlordId?: string } = $props();

	interface LandlordMetrics {
		totalProperties: number;
		totalRooms: number;
		occupiedRooms: number;
		debtRooms: number;
		activeStaff: number;
		activeServices: number;
		unpaidInvoices: number;
		overdueInvoices: number;
		unpaidAmount: number;
		collectedAmount: number;
		currentMonthCollectedAmount: number;
		payosApplied: number;
		payosUnmatched: number;
		payosAppliedAmount: number;
		queuedNotifications: number;
		lastPaymentAt: string | null;
	}

	interface SubscriptionQuote {
		tier: string;
		period: 'MONTHLY' | 'YEARLY';
		minRooms: number;
		maxRooms: number | null;
		pricingGroups: ('STANDARD' | 'COLIVING')[];
		monthlyPrice: number | null;
		periodPrice: number | null;
		roomCount: number;
		overCapacity: boolean;
		requiresContact: boolean;
	}

	interface Landlord {
		id: string;
		userId: string;
		subscriptionType: string;
		subscriptionPeriod: 'MONTHLY' | 'YEARLY';
		subValidUntil: string | null;
		companyName: string | null;
		enabledRentalTypes: string;
		user: {
			id: string;
			name: string;
			email: string;
			phone: string;
			isActive: boolean;
			createdAt: string;
		};
		properties: {
			id: string;
			name: string;
			rentalType: string;
			_count: {
				rooms: number;
			};
		}[];
		subscriptionQuote: SubscriptionQuote;
		metrics: LandlordMetrics;
	}

	let adminName = $state('');
	let isLoading = $state(true);
	let landlords = $state<Landlord[]>([]);
	let selectedLandlord = $state<Landlord | null>(null);
	let isEditOpen = $state(false);
	let isCreateOpen = $state(false);
	let subType = $state('FREE');
	let subPeriod = $state<'MONTHLY' | 'YEARLY'>('MONTHLY');
	let editRentalTypes = $state<string[]>(['APARTMENT']);
	let isSaving = $state(false);
	let isCreating = $state(false);
	let searchQuery = $state('');
	let planFilter = $state('all');
	let statusFilter = $state('all');
	let createForm = $state({
		name: '',
		companyName: '',
		email: '',
		phone: '',
		password: '',
		subscriptionType: 'FREE',
		subscriptionPeriod: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
		enabledRentalTypes: ['APARTMENT']
	});

	// PayOS riêng cho từng chủ trọ — super-admin cấu hình hộ (cầm tay onboarding)
	let isPayosOpen = $state(false);
	let payosTarget = $state<Landlord | null>(null);
	let payosConnected = $state(false);
	let payosClientIdSaved = $state<string | null>(null);
	let payosBusy = $state(false);
	let pClientId = $state('');
	let pApiKey = $state('');
	let pChecksumKey = $state('');

	async function openPayosDialog(landlord: Landlord) {
		payosTarget = landlord;
		pClientId = '';
		pApiKey = '';
		pChecksumKey = '';
		payosConnected = false;
		payosClientIdSaved = null;
		isPayosOpen = true;
		try {
			const res = await fetch(`/api/payos-connect?landlordId=${landlord.id}`);
			const data = await res.json();
			if (res.ok) {
				payosConnected = data.connected;
				payosClientIdSaved = data.clientId;
			}
		} catch {
			// Bỏ qua lỗi tải trạng thái
		}
	}

	async function connectPayos() {
		if (!payosTarget || payosBusy) return;
		if (!pClientId || !pApiKey || !pChecksumKey) {
			toast.error('Cần đủ Client ID, API Key và Checksum Key');
			return;
		}
		payosBusy = true;
		try {
			const res = await fetch('/api/payos-connect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'connect',
					landlordId: payosTarget.id,
					clientId: pClientId,
					apiKey: pApiKey,
					checksumKey: pChecksumKey
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi kết nối PayOS');
			payosConnected = true;
			payosClientIdSaved = pClientId;
			pApiKey = '';
			pChecksumKey = '';
			if (data.webhookRegistered) toast.success('Đã kết nối PayOS & đăng ký webhook');
			else
				toast.success(
					'Đã lưu khóa PayOS' + (data.warning ? ` — webhook chưa đăng ký (${data.warning})` : '')
				);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			payosBusy = false;
		}
	}

	async function disconnectPayos() {
		if (!payosTarget) return;
		if (
			!(await confirmPopup({
				title: 'Ngắt kết nối PayOS',
				message: 'Ngắt PayOS của chủ trọ này? Sẽ quay về VietQR + xác nhận thủ công.',
				confirmLabel: 'Ngắt kết nối',
				tone: 'danger'
			}))
		)
			return;
		payosBusy = true;
		try {
			const res = await fetch('/api/payos-connect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'disconnect', landlordId: payosTarget.id })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi ngắt kết nối');
			payosConnected = false;
			payosClientIdSaved = null;
			toast.success('Đã ngắt kết nối PayOS');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			payosBusy = false;
		}
	}

	const RENTAL_TYPE_OPTIONS = [
		{ value: 'APARTMENT', label: 'Chung cư' },
		{ value: 'MOTEL', label: 'Phòng trọ' },
		{ value: 'SERVICED_APARTMENT', label: 'Căn hộ dịch vụ' },
		{ value: 'DORM', label: 'KTX / Sleepbox' },
		{ value: 'COLIVING', label: 'Co-living / share căn' }
	];

	const SUBSCRIPTION_TIER_OPTIONS = [
		{ value: 'FREE', label: 'Free', range: 'Tối đa 3 phòng' },
		{ value: 'ROOMS_4_10', label: '4–10 phòng', range: 'Tối đa 10 phòng' },
		{ value: 'ROOMS_11_25', label: '11–25 phòng', range: 'Tối đa 25 phòng' },
		{ value: 'ROOMS_26_50', label: '26–50 phòng', range: 'Tối đa 50 phòng' },
		{ value: 'ROOMS_51_100', label: '51–100 phòng', range: 'Tối đa 100 phòng' },
		{ value: 'ROOMS_101_PLUS', label: 'Trên 100 phòng', range: 'Báo giá riêng' }
	];

	const STANDARD_TIER_PRICES: Record<string, number | null> = {
		FREE: 0,
		ROOMS_4_10: 149_000,
		ROOMS_11_25: 349_000,
		ROOMS_26_50: 699_000,
		ROOMS_51_100: 1_399_000,
		ROOMS_101_PLUS: null
	};
	const COLIVING_TIER_PRICES: Record<string, number | null> = {
		FREE: 0,
		ROOMS_4_10: 129_000,
		ROOMS_11_25: 319_000,
		ROOMS_26_50: 629_000,
		ROOMS_51_100: 1_199_000,
		ROOMS_101_PLUS: null
	};

	function selectedTierPrice(tier: string, rentalTypes: string[], period: 'MONTHLY' | 'YEARLY') {
		if (tier === 'ROOMS_101_PLUS') return null;
		const hasStandard = rentalTypes.some((type) => type !== 'COLIVING');
		const hasColiving = rentalTypes.includes('COLIVING');
		const monthly =
			(hasStandard ? (STANDARD_TIER_PRICES[tier] ?? 0) : 0) +
			(hasColiving ? (COLIVING_TIER_PRICES[tier] ?? 0) : 0);
		return monthly * (period === 'YEARLY' ? 12 : 1);
	}

	function formatSelectedTierPrice(
		tier: string,
		rentalTypes: string[],
		period: 'MONTHLY' | 'YEARLY'
	) {
		const price = selectedTierPrice(tier, rentalTypes, period);
		if (price === null) return 'Liên hệ';
		if (price === 0) return 'Miễn phí';
		return `${new Intl.NumberFormat('vi-VN').format(price)}đ/${period === 'YEARLY' ? 'năm' : 'tháng'}`;
	}

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) {
			goto('/login');
			return;
		}

		const session = JSON.parse(sessionStr);
		if (session.role !== 'SUPER_ADMIN') {
			toast.error('Bạn không có quyền truy cập trang quản trị hệ thống');
			goto('/login');
			return;
		}

		adminName = session.name;
		fetchLandlords();
	});

	async function fetchLandlords() {
		isLoading = true;
		try {
			const res = await fetch('/api/super-admin');
			const data = await res.json();
			if (res.status === 401) {
				localStorage.removeItem('roomio_user');
				toast.error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
				await goto('/login');
				return;
			}
			if (!res.ok) throw new Error(data.error || 'Lỗi khi tải danh sách chủ trọ');

			landlords = data;
			selectedLandlord = landlordId
				? (data.find((landlord: Landlord) => landlord.id === landlordId) ?? null)
				: null;
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách chủ trọ: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function handleToggleStatus(userId: string, currentActive: boolean) {
		const actionLabel = currentActive ? 'Khóa' : 'Mở khóa';
		if (
			!(await confirmPopup({
				title: `${actionLabel} tài khoản`,
				message: `Bạn có chắc muốn ${actionLabel.toLowerCase()} tài khoản chủ trọ này?`,
				confirmLabel: actionLabel,
				tone: currentActive ? 'danger' : 'default'
			}))
		)
			return;

		try {
			const res = await fetch('/api/super-admin', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, isActive: !currentActive })
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');

			toast.success(`Đã ${actionLabel.toLowerCase()} tài khoản chủ trọ`);
			fetchLandlords();
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function handleUpdateSubscription(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedLandlord || isSaving) return;

		isSaving = true;
		try {
			const res = await fetch('/api/super-admin', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					landlordId: selectedLandlord.id,
					subscriptionType: subType,
					subscriptionPeriod: subPeriod,
					enabledRentalTypes: editRentalTypes
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật gói dịch vụ');

			toast.success(`Đã cập nhật gói dịch vụ cho ${selectedLandlord.user.name}`);
			isEditOpen = false;
			fetchLandlords();
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSaving = false;
		}
	}

	function handleLogout() {
		fetch('/api/auth', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'logout' })
		}).catch(() => {});
		localStorage.removeItem('roomio_user');
		toast.success('Đã đăng xuất tài khoản quản trị');
		goto('/login');
	}

	function openSubscriptionDialog(landlord: Landlord) {
		selectedLandlord = landlord;
		subType = landlord.subscriptionType;
		subPeriod = landlord.subscriptionPeriod;
		editRentalTypes = parseRentalTypes(landlord.enabledRentalTypes);
		isEditOpen = true;
	}

	function openCreateDialog() {
		createForm = {
			name: '',
			companyName: '',
			email: '',
			phone: '',
			password: '',
			subscriptionType: 'FREE',
			subscriptionPeriod: 'MONTHLY',
			enabledRentalTypes: ['APARTMENT']
		};
		isCreateOpen = true;
	}

	async function handleCreateLandlord(e: SubmitEvent) {
		e.preventDefault();
		if (isCreating) return;

		if (!createForm.name || !createForm.email || !createForm.phone || !createForm.password) {
			toast.error('Vui lòng nhập đủ tên, email, số điện thoại và mật khẩu');
			return;
		}
		if (createForm.password.length < 6) {
			toast.error('Mật khẩu phải dài ít nhất 6 ký tự');
			return;
		}

		isCreating = true;
		try {
			const res = await fetch('/api/super-admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(createForm)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không tạo được tài khoản chủ trọ');

			toast.success(`Đã tạo tài khoản chủ trọ cho ${data.name}`);
			isCreateOpen = false;
			await fetchLandlords();
			await goto(`/admin/landlords/${data.id}`);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isCreating = false;
		}
	}

	function isSubscriptionExpired(landlord: Landlord) {
		if (!landlord.subValidUntil) return false;
		return new Date(landlord.subValidUntil) < new Date();
	}

	const filteredLandlords = $derived(() => {
		const query = searchQuery.trim().toLowerCase();
		return landlords.filter((landlord) => {
			const matchesQuery =
				!query ||
				landlord.user.name.toLowerCase().includes(query) ||
				(landlord.companyName && landlord.companyName.toLowerCase().includes(query)) ||
				landlord.user.email.toLowerCase().includes(query) ||
				landlord.user.phone.includes(query);

			const matchesPlan = planFilter === 'all' || landlord.subscriptionType === planFilter;
			const matchesStatus =
				statusFilter === 'all' ||
				(statusFilter === 'active' && landlord.user.isActive && !isSubscriptionExpired(landlord)) ||
				(statusFilter === 'locked' && !landlord.user.isActive) ||
				(statusFilter === 'expired' && isSubscriptionExpired(landlord));

			return matchesQuery && matchesPlan && matchesStatus;
		});
	});

	const platformStats = $derived(() => {
		return {
			activeLandlords: landlords.filter((landlord) => landlord.user.isActive).length,
			paidLandlords: landlords.filter((landlord) => landlord.subscriptionType !== 'FREE').length,
			monthlySubscriptionRevenue: landlords.reduce(
				(sum, landlord) => sum + (landlord.subscriptionQuote.monthlyPrice ?? 0),
				0
			),
			totalRooms: landlords.reduce((sum, landlord) => sum + landlord.metrics.totalRooms, 0),
			collectedAmount: landlords.reduce(
				(sum, landlord) => sum + landlord.metrics.collectedAmount,
				0
			),
			currentMonthCollectedAmount: landlords.reduce(
				(sum, landlord) => sum + landlord.metrics.currentMonthCollectedAmount,
				0
			),
			unpaidAmount: landlords.reduce((sum, landlord) => sum + landlord.metrics.unpaidAmount, 0),
			overdueInvoices: landlords.reduce(
				(sum, landlord) => sum + landlord.metrics.overdueInvoices,
				0
			),
			payosIssues: landlords.reduce((sum, landlord) => sum + landlord.metrics.payosUnmatched, 0)
		};
	});

	function formatCurrency(amount: number) {
		if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
		if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} triệu`;
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}

	function formatSubscriptionPrice(quote: SubscriptionQuote) {
		if (quote.periodPrice === null) return 'Liên hệ';
		if (quote.periodPrice === 0) return 'Miễn phí';
		return `${formatCurrency(quote.periodPrice)}/${quote.period === 'YEARLY' ? 'năm' : 'tháng'}`;
	}

	function pricingGroupsLabel(groups: SubscriptionQuote['pricingGroups']) {
		if (groups.length === 2) return 'Bảng chuẩn + Co-living';
		return groups[0] === 'COLIVING' ? 'Bảng Co-living' : 'Bảng trọ / CHDV / Sleepbox';
	}

	function pricingTierLabel(quote: SubscriptionQuote) {
		return quote.maxRooms === null
			? `Từ ${quote.minRooms} phòng`
			: `${quote.minRooms}–${quote.maxRooms} phòng`;
	}

	function subscriptionTierLabel(tier: string) {
		return SUBSCRIPTION_TIER_OPTIONS.find((option) => option.value === tier)?.label ?? tier;
	}

	function formatDate(value: string | null) {
		if (!value) return 'Không giới hạn';
		return new Date(value).toLocaleDateString('vi-VN');
	}

	function planBadgeClass(plan: string) {
		if (plan === 'ROOMS_101_PLUS') return 'bg-amber-100 text-amber-900';
		if (plan !== 'FREE') return 'bg-blue-100 text-blue-800';
		return 'bg-zinc-100 text-zinc-600';
	}

	function accountStatusLabel(landlord: Landlord) {
		if (!landlord.user.isActive) return 'Đã khóa';
		if (isSubscriptionExpired(landlord)) return 'Hết hạn gói';
		return 'Đang hoạt động';
	}

	function accountStatusClass(landlord: Landlord) {
		if (!landlord.user.isActive) return 'bg-red-100 text-red-800';
		if (isSubscriptionExpired(landlord)) return 'bg-yellow-100 text-yellow-900';
		return 'bg-green-100 text-green-800';
	}

	function parseRentalTypes(value: string | null | undefined) {
		const parsed = (value || 'APARTMENT')
			.split(',')
			.map((type) => type.trim())
			.filter(Boolean);
		return parsed.length > 0 ? parsed : ['APARTMENT'];
	}

	function rentalTypesLabel(value: string | null | undefined) {
		const enabled = parseRentalTypes(value);
		return RENTAL_TYPE_OPTIONS.filter((option) => enabled.includes(option.value))
			.map((option) => option.label)
			.join(', ');
	}

	function toggleEditRentalType(type: string) {
		if (editRentalTypes.includes(type)) {
			if (editRentalTypes.length === 1) return;
			editRentalTypes = editRentalTypes.filter((item) => item !== type);
			return;
		}
		editRentalTypes = [...editRentalTypes, type];
	}

	function toggleCreateRentalType(type: string) {
		const current = createForm.enabledRentalTypes;
		if (current.includes(type)) {
			if (current.length === 1) return;
			createForm = {
				...createForm,
				enabledRentalTypes: current.filter((item) => item !== type)
			};
			return;
		}
		createForm = {
			...createForm,
			enabledRentalTypes: [...current, type]
		};
	}
</script>

<div class="min-h-screen bg-white text-black">
	<header class="border-b-2 border-black bg-white">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
			<div class="min-w-0">
				<img src="/brand/roomio-wordmark-blue600.png" alt="Roomio" class="h-auto w-32" />
			</div>

			<div class="flex shrink-0 items-center gap-3">
				<span class="hidden text-sm font-bold text-zinc-500 sm:block">{adminName}</span>
				{#if landlordId}
					<button onclick={() => goto('/admin')} class="roomio-button-white px-3 py-2 text-xs">
						<ChevronLeft class="h-4 w-4" /> Danh sách chủ trọ
					</button>
				{:else}
					<button onclick={openCreateDialog} class="roomio-button px-3 py-2 text-xs">
						<Plus class="h-4 w-4" /> Tạo chủ trọ
					</button>
				{/if}
				<button onclick={handleLogout} class="roomio-button-white px-3 py-2 text-xs">
					Đăng xuất <LogOut class="h-4 w-4" />
				</button>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl space-y-5 px-5 py-6 sm:px-6">
		{#if !landlordId}
			<section class="flex flex-wrap gap-x-8 gap-y-3 text-sm font-bold">
				<div>
					<span class="text-zinc-500">Chủ trọ hoạt động</span>
					<span class="ml-2 text-lg font-black"
						>{platformStats().activeLandlords}/{landlords.length}</span
					>
				</div>
				<div>
					<span class="text-zinc-500">Tài khoản trả phí</span>
					<span class="ml-2 text-lg font-black">{platformStats().paidLandlords}</span>
				</div>
				<div>
					<span class="text-zinc-500">Phí Roomio dự kiến</span>
					<span class="ml-2 text-lg font-black">
						{formatCurrency(platformStats().monthlySubscriptionRevenue)}/tháng
					</span>
				</div>
				<div>
					<span class="text-zinc-500">Phòng quản lý</span>
					<span class="ml-2 text-lg font-black">{platformStats().totalRooms}</span>
				</div>
				<div>
					<span class="text-zinc-500">Đã ghi nhận</span>
					<span class="ml-2 text-lg font-black"
						>{formatCurrency(platformStats().collectedAmount)}</span
					>
				</div>
				<div>
					<span class="text-zinc-500">Cần soát</span>
					<span class="ml-2 text-lg font-black">{platformStats().payosIssues} PayOS</span>
				</div>
			</section>
		{/if}

		{#if !landlordId}
			<section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(520px,auto)_auto]">
				<label
					class="flex min-w-0 items-center gap-2 rounded-[6px] border-2 border-black px-3 py-2"
				>
					<Search class="h-4 w-4 shrink-0 text-zinc-500" />
					<input
						bind:value={searchQuery}
						type="text"
						placeholder="Tìm chủ trọ, thương hiệu, email hoặc số điện thoại"
						class="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
					/>
				</label>

				<div
					class="grid grid-cols-4 gap-1 rounded-lg border-2 border-black bg-white p-1 text-xs font-black"
				>
					{#each [{ value: 'all', label: 'Tất cả gói' }, ...SUBSCRIPTION_TIER_OPTIONS.map( (option) => ({ value: option.value, label: option.label }) )] as plan}
						<button
							onclick={() => (planFilter = plan.value)}
							class="rounded-[5px] px-2 py-2 transition-colors {planFilter === plan.value
								? 'bg-blue-300 text-black'
								: 'text-zinc-500 hover:bg-zinc-100'}"
						>
							{plan.label}
						</button>
					{/each}
				</div>

				<div
					class="grid grid-cols-4 gap-1 rounded-lg border-2 border-black bg-white p-1 text-xs font-black"
				>
					{#each [{ value: 'all', label: 'Tất cả' }, { value: 'active', label: 'Đang chạy' }, { value: 'locked', label: 'Đã khóa' }, { value: 'expired', label: 'Hết hạn' }] as status}
						<button
							onclick={() => (statusFilter = status.value)}
							class="rounded-[5px] px-3 py-2 transition-colors {statusFilter === status.value
								? 'bg-blue-300 text-black'
								: 'text-zinc-500 hover:bg-zinc-100'}"
						>
							{status.label}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if isLoading}
			<div class="flex h-[44vh] items-center justify-center">
				<Loader2 class="h-10 w-10 animate-spin text-black" />
			</div>
		{:else}
			<section class={landlordId ? 'mx-auto max-w-4xl' : ''}>
				{#if !landlordId}
					<div class="min-w-0">
						{#if filteredLandlords().length === 0}
							<div class="rounded-lg bg-blue-50 p-10 text-center">
								<p class="text-sm font-bold text-zinc-600">Không có chủ trọ nào khớp bộ lọc.</p>
							</div>
						{:else}
							<div class="overflow-x-auto rounded-lg border-2 border-black">
								<div
									class="grid w-full min-w-[760px] grid-cols-[minmax(240px,1fr)_110px_110px_130px_150px_24px] bg-zinc-50 px-4 py-3 text-xs font-black text-zinc-500"
								>
									<span>Chủ trọ</span>
									<span>Gói</span>
									<span>Phòng</span>
									<span>Chưa thu</span>
									<span>Trạng thái</span>
								</div>
								{#each filteredLandlords() as landlord}
									<button
										onclick={() => goto(`/admin/landlords/${landlord.id}`)}
										class="grid w-full min-w-[760px] grid-cols-[minmax(240px,1fr)_110px_110px_130px_150px_24px] items-center gap-0 border-t-2 border-black bg-white px-4 py-3 text-left text-sm font-bold transition-colors hover:bg-blue-50"
									>
										<span class="min-w-0">
											<span class="block truncate text-base font-black">{landlord.user.name}</span>
											<span class="mt-0.5 block truncate text-xs text-zinc-500">
												{landlord.companyName || 'Chưa đặt thương hiệu'} · {landlord.user.email}
											</span>
										</span>
										<span class="min-w-0">
											<span
												class="block w-fit rounded-full px-2.5 py-1 text-[10px] font-black {planBadgeClass(
													landlord.subscriptionType
												)}"
											>
												{subscriptionTierLabel(landlord.subscriptionType)}
											</span>
											<span class="mt-1 block truncate text-[10px] text-zinc-500">
												{formatSubscriptionPrice(landlord.subscriptionQuote)}
											</span>
										</span>
										<span>{landlord.metrics.occupiedRooms}/{landlord.metrics.totalRooms}</span>
										<span>{formatCurrency(landlord.metrics.unpaidAmount)}</span>
										<span
											class="w-fit rounded-full px-2.5 py-1 text-[10px] font-black {accountStatusClass(
												landlord
											)}"
										>
											{accountStatusLabel(landlord)}
										</span>
										<ChevronRight class="h-4 w-4 text-zinc-400" />
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if landlordId}
					<aside>
						{#if selectedLandlord}
							<div class="overflow-hidden rounded-lg border-2 border-black bg-white">
								<div class="space-y-5 p-5">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="text-xs font-bold text-zinc-500">Hồ sơ đối tác</p>
											<h2 class="mt-1 text-xl leading-tight font-black">
												{selectedLandlord.user.name}
											</h2>
											<p class="mt-1 truncate text-sm font-bold text-zinc-500">
												{selectedLandlord.companyName || 'Chưa đặt thương hiệu'}
											</p>
										</div>
										<span
											class="rounded-full px-2.5 py-1 text-[10px] font-black {accountStatusClass(
												selectedLandlord
											)}"
										>
											{accountStatusLabel(selectedLandlord)}
										</span>
									</div>

									<div class="grid grid-cols-2 gap-x-5 gap-y-3 text-sm font-bold">
										<div>
											<p class="text-zinc-500">Tòa nhà</p>
											<p class="text-lg font-black">{selectedLandlord.metrics.totalProperties}</p>
										</div>
										<div>
											<p class="text-zinc-500">Phòng</p>
											<p class="text-lg font-black">
												{selectedLandlord.metrics.occupiedRooms}/{selectedLandlord.metrics
													.totalRooms}
											</p>
										</div>
										<div>
											<p class="text-zinc-500">Đã thu</p>
											<p class="text-lg font-black">
												{formatCurrency(selectedLandlord.metrics.collectedAmount)}
											</p>
										</div>
										<div>
											<p class="text-zinc-500">Chưa thu</p>
											<p class="text-lg font-black">
												{formatCurrency(selectedLandlord.metrics.unpaidAmount)}
											</p>
										</div>
									</div>

									<div class="rounded-lg bg-blue-50 p-4">
										<div class="flex items-start justify-between gap-4">
											<div>
												<p class="text-xs font-bold text-blue-800">Phí Roomio tự tính</p>
												<p class="mt-1 text-xl font-black">
													{formatSubscriptionPrice(selectedLandlord.subscriptionQuote)}
												</p>
											</div>
											<span
												class="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-blue-900"
											>
												{subscriptionTierLabel(selectedLandlord.subscriptionType)}
											</span>
										</div>
										<p class="mt-2 text-xs font-bold text-zinc-600">
											{pricingGroupsLabel(selectedLandlord.subscriptionQuote.pricingGroups)} ·
											{selectedLandlord.subscriptionQuote.roomCount} phòng đang quản lý ·
											{pricingTierLabel(selectedLandlord.subscriptionQuote)}
										</p>
										{#if selectedLandlord.subscriptionQuote.overCapacity}
											<p class="mt-2 text-xs font-black text-red-700">
												Số phòng hiện tại đã vượt giới hạn gói.
											</p>
										{/if}
									</div>

									<div class="space-y-2 text-sm font-bold">
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Email</span>
											<span class="truncate text-right">{selectedLandlord.user.email}</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Điện thoại</span>
											<span>{selectedLandlord.user.phone}</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Ngày tạo</span>
											<span>{formatDate(selectedLandlord.user.createdAt)}</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Gói dịch vụ</span>
											<span
												>{subscriptionTierLabel(selectedLandlord.subscriptionType)} · {selectedLandlord.subscriptionPeriod ===
												'YEARLY'
													? 'Theo năm'
													: 'Theo tháng'} · {formatDate(selectedLandlord.subValidUntil)}</span
											>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Loại hình</span>
											<span class="text-right"
												>{rentalTypesLabel(selectedLandlord.enabledRentalTypes)}</span
											>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Nhân viên</span>
											<span>{selectedLandlord.metrics.activeStaff} đang hoạt động</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Thông báo chờ</span>
											<span>{selectedLandlord.metrics.queuedNotifications}</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">PayOS đã khớp</span>
											<span>{selectedLandlord.metrics.payosApplied} giao dịch</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">PayOS cần soát</span>
											<span>{selectedLandlord.metrics.payosUnmatched}</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-zinc-500">Thanh toán gần nhất</span>
											<span>{formatDate(selectedLandlord.metrics.lastPaymentAt)}</span>
										</div>
									</div>

									<div class="space-y-2">
										<p class="text-sm font-black text-zinc-500">Tòa nhà đang quản lý</p>
										{#if selectedLandlord.properties.length === 0}
											<p class="bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-500">
												Chưa có tòa nhà nào.
											</p>
										{:else}
											<div class="max-h-36 overflow-y-auto pr-1">
												{#each selectedLandlord.properties as property}
													<div
														class="flex items-center justify-between gap-3 border-t border-zinc-200 py-2 text-xs font-bold first:border-t-0"
													>
														<span class="truncate">{property.name}</span>
														<span class="shrink-0 text-zinc-500">{property._count.rooms} phòng</span
														>
													</div>
												{/each}
											</div>
										{/if}
									</div>

									<div class="grid grid-cols-2 gap-2 pt-1">
										<button
											onclick={() => openSubscriptionDialog(selectedLandlord!)}
											class="inline-flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black transition-colors hover:bg-blue-400"
										>
											<Sliders class="h-4 w-4" /> Cấp gói
										</button>
										<button
											onclick={() =>
												handleToggleStatus(
													selectedLandlord!.userId,
													selectedLandlord!.user.isActive
												)}
											class="inline-flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black text-black transition-colors hover:bg-zinc-100"
										>
											{#if selectedLandlord.user.isActive}
												<Lock class="h-4 w-4" /> Khóa
											{:else}
												<Unlock class="h-4 w-4" /> Mở khóa
											{/if}
										</button>
									</div>

									<button
										onclick={() => openPayosDialog(selectedLandlord!)}
										class="inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black text-black transition-colors hover:bg-zinc-100"
									>
										<Plug class="h-4 w-4" /> Kết nối PayOS thu tiền thuê
									</button>

									<div class="bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
										<Eye class="mr-1 inline h-3.5 w-3.5" />
										Giai đoạn sau nên thêm xem dưới quyền chủ trọ để support, nhưng chưa bật khi backend
										chưa có audit log.
									</div>
								</div>
							</div>
						{:else}
							<div class="rounded-lg border-2 border-black bg-zinc-50 p-10 text-center">
								<p class="font-black">Không tìm thấy chủ trọ</p>
								<p class="mt-1 text-sm font-bold text-zinc-500">
									Hồ sơ này không tồn tại hoặc đã bị xóa.
								</p>
								<button onclick={() => goto('/admin')} class="roomio-button mt-5 px-4 py-2 text-xs">
									<ChevronLeft class="h-4 w-4" /> Về danh sách
								</button>
							</div>
						{/if}
					</aside>
				{/if}
			</section>
		{/if}
	</main>

	{#if isPayosOpen && payosTarget}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isPayosOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isPayosOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex w-full max-w-md animate-[scale-up_0.2s_ease-out] flex-col gap-4 rounded-lg border-2 border-black bg-white p-6 shadow-primary"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex items-center justify-between">
					<h3 class="flex items-center gap-1.5 text-base font-black text-black">
						<Plug class="h-4.5 w-4.5" /> PayOS — {payosTarget.companyName || payosTarget.user.name}
					</h3>
					<button
						onclick={() => (isPayosOpen = false)}
						class="cursor-pointer rounded p-1 hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>
				<p class="-mt-2 text-xs font-bold text-zinc-600">
					Tiền thuê sẽ về thẳng TK ngân hàng của chủ trọ này và tự động đối soát. Chưa kết nối thì
					dùng VietQR + xác nhận thủ công.
				</p>

				{#if payosConnected}
					<div
						class="flex items-center justify-between gap-3 rounded-lg border-2 border-black bg-green-100 p-3"
					>
						<div>
							<p class="text-sm font-black text-green-800">Đã kết nối</p>
							{#if payosClientIdSaved}
								<p class="mt-0.5 text-xs font-bold text-zinc-600">
									Client ID: {payosClientIdSaved}
								</p>
							{/if}
						</div>
						<button
							onclick={disconnectPayos}
							disabled={payosBusy}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 px-3 py-2 text-xs font-black text-red-800 disabled:opacity-50"
						>
							Ngắt
						</button>
					</div>
				{:else}
					<div class="space-y-3 font-semibold">
						<input
							type="text"
							bind:value={pClientId}
							placeholder="Client ID (x-client-id)"
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
						<input
							type="password"
							bind:value={pApiKey}
							placeholder="API Key (x-api-key)"
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
						<input
							type="password"
							bind:value={pChecksumKey}
							placeholder="Checksum Key"
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
						<button
							onclick={connectPayos}
							disabled={payosBusy}
							class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							Kết nối & kiểm tra
							{#if payosBusy}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Plug
									class="h-4 w-4"
								/>{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if isEditOpen && selectedLandlord}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isEditOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isEditOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex max-h-[90vh] w-full max-w-2xl animate-[scale-up_0.2s_ease-out] flex-col gap-4 overflow-y-auto rounded-lg border-2 border-black bg-white p-6"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex items-start justify-between gap-3">
					<div>
						<h2 class="text-lg font-black text-black">Cấp gói dịch vụ</h2>
						<p class="mt-1 text-xs font-bold text-zinc-500">{selectedLandlord.user.name}</p>
					</div>
					<button
						onclick={() => (isEditOpen = false)}
						class="rounded-lg border-2 border-black bg-white p-1.5 text-black transition-colors hover:bg-zinc-100"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<form onsubmit={handleUpdateSubscription} class="space-y-4">
					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Loại hình được dùng</p>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each RENTAL_TYPE_OPTIONS as option}
								<button
									type="button"
									onclick={() => toggleEditRentalType(option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {editRentalTypes.includes(
										option.value
									)
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Gói số phòng</p>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each SUBSCRIPTION_TIER_OPTIONS as option}
								<button
									type="button"
									onclick={() => (subType = option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-left transition-colors {subType ===
									option.value
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									<span class="block text-xs font-black">{option.label}</span>
									<span class="mt-1 block text-[10px] font-bold">
										{formatSelectedTierPrice(option.value, editRentalTypes, subPeriod)}
									</span>
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Thời hạn</p>
						<div class="grid grid-cols-2 gap-2">
							{#each [{ value: 'MONTHLY' as const, label: 'Theo tháng' }, { value: 'YEARLY' as const, label: 'Theo năm' }] as option}
								<button
									type="button"
									onclick={() => (subPeriod = option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {subPeriod ===
									option.value
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
						<p class="text-[10px] font-bold text-zinc-500">
							Gói sẽ có hạn 1 tháng hoặc 1 năm tính từ lúc lưu.
						</p>
					</div>

					<div class="flex justify-end gap-3 pt-2">
						<button
							type="button"
							onclick={() => (isEditOpen = false)}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-zinc-100"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isSaving}
							class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black transition-colors hover:bg-blue-400 disabled:opacity-50"
						>
							{#if isSaving}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Check class="h-4 w-4" />
							{/if}
							Lưu gói
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if isCreateOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isCreateOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isCreateOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex max-h-[92vh] w-full max-w-xl animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex items-start justify-between gap-3 bg-zinc-50 px-5 py-4">
					<div>
						<div class="flex items-center gap-2">
							<UserPlus class="h-5 w-5 text-blue-500" />
							<h2 class="text-lg font-black text-black">Tạo tài khoản chủ trọ</h2>
						</div>
						<p class="mt-1 text-xs font-bold text-zinc-500">
							Chỉ SuperAdmin được cấp tài khoản chủ trọ mới.
						</p>
					</div>
					<button
						onclick={() => (isCreateOpen = false)}
						class="rounded-lg border-2 border-black bg-white p-1.5 text-black transition-colors hover:bg-zinc-100"
						aria-label="Đóng"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<form onsubmit={handleCreateLandlord} class="space-y-4 overflow-y-auto p-5">
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="block text-xs font-bold text-zinc-600" for="new-landlord-name">
							Họ và tên
							<input
								id="new-landlord-name"
								bind:value={createForm.name}
								required
								type="text"
								placeholder="Nguyễn Văn Hậu"
								class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</label>

						<label class="block text-xs font-bold text-zinc-600" for="new-landlord-company">
							Thương hiệu / công ty
							<input
								id="new-landlord-company"
								bind:value={createForm.companyName}
								type="text"
								placeholder="Nhà Trọ Ngọc Hậu"
								class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</label>
					</div>

					<div class="grid gap-3 sm:grid-cols-2">
						<label class="block text-xs font-bold text-zinc-600" for="new-landlord-email">
							Email đăng nhập
							<input
								id="new-landlord-email"
								bind:value={createForm.email}
								required
								type="email"
								placeholder="chutro@gmail.com"
								class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</label>

						<label class="block text-xs font-bold text-zinc-600" for="new-landlord-phone">
							Số điện thoại
							<input
								id="new-landlord-phone"
								bind:value={createForm.phone}
								required
								type="tel"
								placeholder="0901234567"
								class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</label>
					</div>

					<label class="block text-xs font-bold text-zinc-600" for="new-landlord-password">
						Mật khẩu tạm thời
						<input
							id="new-landlord-password"
							bind:value={createForm.password}
							required
							type="password"
							placeholder="Ít nhất 6 ký tự"
							class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</label>

					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Loại hình được dùng</p>
						<div class="grid grid-cols-2 gap-2">
							{#each RENTAL_TYPE_OPTIONS as option}
								<button
									type="button"
									onclick={() => toggleCreateRentalType(option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {createForm.enabledRentalTypes.includes(
										option.value
									)
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Gói ban đầu</p>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each SUBSCRIPTION_TIER_OPTIONS as option}
								<button
									type="button"
									onclick={() => (createForm.subscriptionType = option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-left transition-colors {createForm.subscriptionType ===
									option.value
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									<span class="block text-xs font-black">{option.label}</span>
									<span class="mt-1 block text-[10px] font-bold">
										{formatSelectedTierPrice(
											option.value,
											createForm.enabledRentalTypes,
											createForm.subscriptionPeriod
										)}
									</span>
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<p class="block text-xs font-bold text-zinc-600">Thời hạn</p>
						<div class="grid grid-cols-2 gap-2">
							{#each [{ value: 'MONTHLY' as const, label: 'Theo tháng' }, { value: 'YEARLY' as const, label: 'Theo năm' }] as option}
								<button
									type="button"
									onclick={() => (createForm.subscriptionPeriod = option.value)}
									class="rounded-[6px] border-2 border-black px-3 py-2 text-xs font-black transition-colors {createForm.subscriptionPeriod ===
									option.value
										? 'bg-blue-300 text-black'
										: 'bg-white text-zinc-500 hover:bg-zinc-100'}"
								>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="rounded-[6px] bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
						Tài khoản mới sẽ có sẵn dịch vụ mặc định: điện, nước, wifi, rác sinh hoạt và gửi xe máy.
					</div>

					<div class="flex justify-end gap-3 pt-2">
						<button
							type="button"
							onclick={() => (isCreateOpen = false)}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-zinc-100"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isCreating}
							class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black transition-colors hover:bg-blue-400 disabled:opacity-50"
						>
							{#if isCreating}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<UserPlus class="h-4 w-4" />
							{/if}
							Tạo chủ trọ
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>
