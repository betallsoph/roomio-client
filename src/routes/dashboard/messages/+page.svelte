<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { confirmPopup } from '$lib/confirm-popup';
	import { toast } from 'svelte-sonner';
	import {
		AlertCircle,
		Bell,
		Calendar,
		Loader2,
		MessageSquare,
		Pin,
		Plus,
		RefreshCcw,
		Send,
		Trash2,
		X
	} from '@lucide/svelte';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	interface TenantRow {
		id: string;
		user: { id: string; name: string; phone: string };
		rooms: { roomNumber: string; property: { shortName: string } }[];
	}

	interface MessageRow {
		id: string;
		senderId: string;
		content: string;
		createdAt: string;
		telegramDelivery: {
			notificationId: string;
			status: 'queued' | 'sent' | 'failed';
			attemptCount: number;
			lastError: string | null;
			sentAt: string | null;
		} | null;
	}

	interface TelegramDelivery {
		status: 'sent' | 'queued' | 'failed' | 'skipped';
		delivered: boolean;
		notificationId?: string;
		code?: string;
		message?: string;
	}

	interface TelegramDeliveryRow {
		id: string;
		title: string;
		content: string;
		status: string;
		attemptCount: number;
		lastError: string | null;
		nextAttemptAt: string | null;
		createdAt: string;
		relatedType: string | null;
		relatedId: string | null;
		tenant?: {
			user?: { name: string; phone: string };
			rooms?: { roomNumber: string }[];
		} | null;
	}

	interface TelegramDeliveryBatch {
		status: 'queued' | 'failed';
		totalRecipients: number;
		queued: number;
		skippedUnlinked: number;
		message?: string;
	}

	interface Announcement {
		id: string;
		title: string;
		content: string;
		isImportant: boolean;
		targetType: string;
		createdAt: string;
	}

	interface Property {
		id: string;
		name: string;
		blocks: { id: string; name: string }[];
	}

	interface TenantOption {
		id: string;
		user: { name: string };
		rooms: { roomNumber: string }[];
	}

	interface RoomOption {
		id: string;
		roomNumber: string;
	}

	type ActiveTab = 'messages' | 'announcements';

	let activeTab = $state<ActiveTab>('messages');
	let landlordId = $state('');
	let userId = $state('');
	let tenants = $state<TenantRow[]>([]);
	let selectedTenant = $state<TenantRow | null>(null);
	let messageList = $state<MessageRow[]>([]);
	let draft = $state('');
	let isLoadingTenants = $state(true);
	let isSending = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let scrollContainer = $state<HTMLDivElement | null>(null);

	let isLoadingAnnouncements = $state(true);
	let isLoadingTelegramDeliveries = $state(false);
	let isSubmitting = $state(false);
	let announcements = $state<Announcement[]>([]);
	let properties = $state<Property[]>([]);
	let telegramDeliveries = $state<TelegramDeliveryRow[]>([]);
	let retryingDeliveryId = $state('');

	let isAddDialogOpen = $state(false);
	let annTitle = $state('');
	let annContent = $state('');
	let annIsImportant = $state(false);
	let annTargetType = $state('ALL');
	let annTargetId = $state('');
	let annPropertyId = $state('');
	let tenantOptions = $state<TenantOption[]>([]);
	let roomOptions = $state<RoomOption[]>([]);

	onMount(() => {
		activeTab = page.url.searchParams.get('tab') === 'announcements' ? 'announcements' : 'messages';

		const sessionStr = localStorage.getItem('roomio_user');
		if (sessionStr) {
			const session = JSON.parse(sessionStr);
			landlordId = session.landlordProfileId;
			userId = session.id;
			loadTenants();
			fetchTelegramDeliveries();
			fetchAnnouncements(session.id);
			fetchProperties(session.landlordProfileId);
			fetchTenantOptions(session.landlordProfileId);
		}

		pollTimer = setInterval(() => {
			if (selectedTenant) loadMessages(false);
		}, 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	function setTab(tab: ActiveTab) {
		activeTab = tab;
		goto(
			tab === 'announcements' ? '/dashboard/messages?tab=announcements' : '/dashboard/messages',
			{
				replaceState: true,
				noScroll: true
			}
		);
	}

	async function loadTenants() {
		try {
			const res = await fetch(`/api/tenants?landlordId=${landlordId}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			tenants = data;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Lỗi tải danh sách khách thuê');
		} finally {
			isLoadingTenants = false;
		}
	}

	async function selectTenant(tenant: TenantRow) {
		selectedTenant = tenant;
		messageList = [];
		await loadMessages(true);
	}

	async function loadMessages(scrollToEnd: boolean) {
		if (!selectedTenant) return;
		try {
			const res = await fetch(
				`/api/messages?landlordId=${landlordId}&tenantId=${selectedTenant.id}`
			);
			const data = await res.json();
			if (!res.ok) return;
			const hadNew = data.length !== messageList.length;
			messageList = data;
			if (scrollToEnd || hadNew) {
				await tick();
				scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight });
			}
		} catch {
			// Bỏ qua lỗi polling, lần sau thử lại
		}
	}

	async function sendMessage() {
		if (!draft.trim() || !selectedTenant) return;
		isSending = true;
		try {
			const res = await fetch('/api/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ landlordId, tenantId: selectedTenant.id, content: draft })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			draft = '';
			showTelegramDelivery(data.telegramDelivery);
			if (data.telegramDelivery?.status !== 'sent') {
				fetchTelegramDeliveries();
				window.setTimeout(() => {
					fetchTelegramDeliveries();
					loadMessages(false);
				}, 2500);
			}
			await loadMessages(true);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Lỗi gửi tin nhắn');
		} finally {
			isSending = false;
		}
	}

	function showTelegramDelivery(delivery?: TelegramDelivery | null) {
		if (!delivery) return;
		if (delivery.status === 'sent') {
			toast.success('Đã gửi tin nhắn qua Telegram');
			return;
		}
		if (delivery.status === 'queued') {
			toast.info('Tin đã lưu, Telegram đang gửi nền');
			return;
		}
		if (delivery.code === 'tenant_not_linked') {
			toast.info('Tin đã lưu, khách chưa liên kết Telegram');
			return;
		}
		toast.error(`Tin đã lưu nhưng Telegram chưa gửi được: ${delivery.message ?? 'lỗi không rõ'}`);
	}

	async function fetchTelegramDeliveries() {
		if (!landlordId) return;
		isLoadingTelegramDeliveries = true;
		try {
			const res = await fetch('/api/telegram-deliveries?limit=12');
			const data = await res.json();
			if (res.ok) {
				telegramDeliveries = data.filter(
					(delivery: TelegramDeliveryRow) => delivery.relatedType !== 'message'
				);
			}
		} catch {
			// Không chặn trang chat nếu tải trạng thái Telegram lỗi
		} finally {
			isLoadingTelegramDeliveries = false;
		}
	}

	async function retryTelegramDelivery(id: string) {
		retryingDeliveryId = id;
		try {
			const res = await fetch('/api/telegram-deliveries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'retry', id })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không gửi lại được Telegram');
			if (data.result?.delivered) toast.success('Đã gửi lại Telegram');
			else toast.error(data.result?.message || 'Telegram vẫn chưa gửi được');
			await fetchTelegramDeliveries();
			if (selectedTenant) await loadMessages(false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Lỗi gửi lại Telegram');
		} finally {
			retryingDeliveryId = '';
		}
	}

	async function retryAllTelegramDeliveries() {
		retryingDeliveryId = 'all';
		try {
			const res = await fetch('/api/telegram-deliveries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'retry_all', limit: 10 })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không gửi lại được Telegram');
			const delivered = data.results?.filter((item: any) => item.result?.delivered).length ?? 0;
			toast.success(`Đã thử gửi lại ${data.results?.length ?? 0} tin, thành công ${delivered}`);
			await fetchTelegramDeliveries();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Lỗi gửi lại Telegram');
		} finally {
			retryingDeliveryId = '';
		}
	}

	async function fetchAnnouncements(senderId: string) {
		isLoadingAnnouncements = true;
		try {
			const res = await fetch(`/api/announcements?senderId=${senderId}`);
			const data = await res.json();
			if (res.ok) announcements = data;
		} catch (e: any) {
			toast.error('Lỗi tải bảng tin thông báo: ' + e.message);
		} finally {
			isLoadingAnnouncements = false;
		}
	}

	async function fetchProperties(profileId: string) {
		try {
			const res = await fetch(`/api/properties?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) properties = data;
		} catch {
			// Bỏ qua
		}
	}

	async function fetchRoomOptions(propertyId: string) {
		roomOptions = [];
		if (!propertyId) return;
		try {
			const res = await fetch(`/api/rooms?propertyId=${propertyId}`);
			const data = await res.json();
			if (res.ok) roomOptions = data;
		} catch {
			// Bỏ qua, người dùng vẫn gửi được loại khác
		}
	}

	async function fetchTenantOptions(profileId: string) {
		try {
			const res = await fetch(`/api/tenants?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) tenantOptions = data;
		} catch {
			// Bỏ qua
		}
	}

	function resetAnnouncementForm() {
		annTitle = '';
		annContent = '';
		annIsImportant = false;
		annTargetType = 'ALL';
		annTargetId = '';
		annPropertyId = '';
		roomOptions = [];
	}

	async function handleAddAnnouncement(e: SubmitEvent) {
		e.preventDefault();
		if (!userId || isSubmitting) return;

		if (!annTitle.trim() || !annContent.trim()) {
			toast.error('Vui lòng nhập tiêu đề và nội dung thông báo');
			return;
		}

		isSubmitting = true;
		try {
			const res = await fetch('/api/announcements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					senderId: userId,
					title: annTitle,
					content: annContent,
					isImportant: annIsImportant,
					targetType: annTargetType,
					targetId: annTargetType === 'ALL' ? null : annTargetId
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi đăng thông báo');

			toast.success('Đã đăng bảng tin thông báo mới');
			showAnnouncementTelegramDelivery(data.telegramDelivery);
			if (data.telegramDelivery?.queued > 0 || data.telegramDelivery?.status === 'failed') {
				fetchTelegramDeliveries();
				window.setTimeout(fetchTelegramDeliveries, 2500);
			}
			isAddDialogOpen = false;
			resetAnnouncementForm();
			fetchAnnouncements(userId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteAnnouncement(announcementId: string) {
		if (
			!(await confirmPopup({
				title: 'Xóa bản tin',
				message: 'Bạn có chắc chắn muốn xóa bản tin thông báo này khỏi bảng tin cư dân?',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;

		try {
			const res = await fetch(`/api/announcements?id=${announcementId}`, {
				method: 'DELETE'
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa thông báo');
			toast.success('Đã xóa thông báo thành công');
			if (userId) fetchAnnouncements(userId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	function openAnnouncementTemplate(title: string, content: string, important = false) {
		annTitle = title;
		annContent = content;
		annIsImportant = important;
		annTargetType = 'ALL';
		annTargetId = '';
		annPropertyId = '';
		roomOptions = [];
		isAddDialogOpen = true;
	}

	function formatTime(value: string) {
		return new Date(value).toLocaleString('vi-VN', { hour12: false });
	}

	function formatDate(value: string) {
		return new Date(value).toLocaleDateString('vi-VN');
	}

	function tenantRoomLabel(tenant: TenantRow) {
		const firstRoom = tenant.rooms[0];
		return firstRoom
			? `${firstRoom.property.shortName} - P.${firstRoom.roomNumber}`
			: 'Chưa có phòng';
	}

	function announcementTargetLabel(targetType: string) {
		if (targetType === 'ALL') return 'Tất cả';
		if (targetType === 'PROPERTY') return 'Tòa nhà';
		if (targetType === 'BLOCK') return 'Block';
		if (targetType === 'ROOM') return 'Phòng';
		if (targetType === 'TENANT') return 'Khách thuê';
		return targetType;
	}

	function showAnnouncementTelegramDelivery(delivery?: TelegramDeliveryBatch | null) {
		if (!delivery) return;
		if (delivery.status === 'failed') {
			toast.error(delivery.message || 'Đã đăng thông báo nhưng Telegram chưa gửi được');
			return;
		}
		if (delivery.totalRecipients === 0) {
			toast.info('Không có khách phù hợp để gửi Telegram');
			return;
		}
		if (delivery.queued === 0) {
			toast.info(`${delivery.skippedUnlinked} khách chưa liên kết Telegram`);
			return;
		}
		const skipped = delivery.skippedUnlinked
			? `, ${delivery.skippedUnlinked} khách chưa liên kết`
			: '';
		toast.info(`Telegram đang gửi cho ${delivery.queued} khách${skipped}`);
	}

	function telegramDeliveryTenantLabel(delivery: TelegramDeliveryRow) {
		const name = delivery.tenant?.user?.name || 'Khách thuê';
		const room = delivery.tenant?.rooms?.[0]?.roomNumber;
		return room ? `${name} · P.${room}` : name;
	}

	function telegramMessageStatusLabel(message: MessageRow) {
		const delivery = message.telegramDelivery;
		if (!delivery) return '';
		if (delivery.status === 'queued') return 'Đang gửi Telegram...';
		if (delivery.status === 'failed') {
			return delivery.lastError ? `Telegram lỗi: ${delivery.lastError}` : 'Telegram gửi lỗi';
		}
		if (delivery.status === 'sent') return 'Đã gửi Telegram';
		return '';
	}
</script>

<div class="space-y-5">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-2xl font-black text-black">Nhắn tin & Gửi thông báo</h1>

		<div class="flex rounded-lg border-2 border-black bg-white p-1">
			<button
				onclick={() => setTab('messages')}
				class="inline-flex min-w-32 items-center justify-center gap-2 rounded-[6px] px-3 py-2 text-sm font-black transition-colors {activeTab ===
				'messages'
					? 'bg-blue-100 text-black'
					: 'text-zinc-500 hover:bg-zinc-50 hover:text-black'}"
			>
				<MessageSquare class="h-4 w-4" />
				Tin nhắn
			</button>
			<button
				onclick={() => setTab('announcements')}
				class="inline-flex min-w-32 items-center justify-center gap-2 rounded-[6px] px-3 py-2 text-sm font-black transition-colors {activeTab ===
				'announcements'
					? 'bg-blue-100 text-black'
					: 'text-zinc-500 hover:bg-zinc-50 hover:text-black'}"
			>
				<Bell class="h-4 w-4" />
				Gửi thông báo
			</button>
		</div>
	</div>

	{#if activeTab === 'messages'}
		{#if isLoadingTenants}
			<div class="flex justify-center py-16">
				<Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
			</div>
		{:else}
			{#if telegramDeliveries.length > 0}
				<section class="rounded-lg border border-amber-300 bg-amber-50 p-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 class="text-sm font-black text-black">
								{telegramDeliveries.length} tin Telegram chưa gửi xong
							</h2>
							<p class="mt-0.5 text-xs font-bold text-amber-800">
								Tin trong Roomio vẫn đã lưu. Gửi lại khi bot hoặc kết nối đã ổn.
							</p>
						</div>
						<button
							onclick={retryAllTelegramDeliveries}
							disabled={retryingDeliveryId === 'all' || isLoadingTelegramDeliveries}
							class="inline-flex items-center justify-center gap-2 rounded-[6px] border border-amber-400 bg-white px-3 py-2 text-xs font-black text-black disabled:opacity-50"
						>
							{#if retryingDeliveryId === 'all'}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<RefreshCcw class="h-4 w-4" />
							{/if}
							Gửi lại
						</button>
					</div>
					<div class="mt-3 grid gap-2 lg:grid-cols-2">
						{#each telegramDeliveries.slice(0, 4) as delivery (delivery.id)}
							<div class="rounded-[6px] border border-amber-200 bg-white/75 p-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-xs font-black text-black">
											{telegramDeliveryTenantLabel(delivery)}
										</p>
										<p class="mt-1 line-clamp-2 text-xs font-semibold text-zinc-600">
											{delivery.content}
										</p>
										<p class="mt-1 text-[10px] font-bold text-amber-800">
											Thử {delivery.attemptCount} lần · {delivery.lastError || delivery.status}
										</p>
									</div>
									<button
										onclick={() => retryTelegramDelivery(delivery.id)}
										disabled={!!retryingDeliveryId}
										class="shrink-0 rounded-[6px] border border-black/20 bg-white px-2 py-1 text-[10px] font-black disabled:opacity-50"
									>
										{retryingDeliveryId === delivery.id ? 'Đang gửi' : 'Retry'}
									</button>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
			<div class="grid grid-cols-1 gap-5 xl:h-[calc(100vh-210px)] xl:grid-cols-[300px_minmax(0,1fr)]">
				<section
					class="flex min-h-72 flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
				>
					<div class="flex items-center justify-between border-b-2 border-black px-4 py-3">
						<h2 class="text-sm font-black text-black">Khách thuê</h2>
						<span class="text-xs font-bold text-zinc-500">{tenants.length}</span>
					</div>
					<div class="min-h-0 flex-1 overflow-y-auto">
						{#if tenants.length === 0}
							<p class="p-6 text-center text-sm font-bold text-zinc-400">Chưa có khách thuê.</p>
						{/if}
						{#each tenants as tenant (tenant.id)}
							<button
								onclick={() => selectTenant(tenant)}
								class="w-full border-b border-zinc-200 px-4 py-3 text-left transition-colors hover:bg-blue-50 {selectedTenant?.id ===
								tenant.id
									? 'bg-blue-100'
									: ''}"
							>
								<p class="truncate text-sm font-black text-black">{tenant.user.name}</p>
								<p class="text-xs font-bold text-zinc-500">{tenantRoomLabel(tenant)}</p>
							</button>
						{/each}
					</div>
				</section>

				<section class="flex min-h-[460px] flex-col">
					{#if !selectedTenant}
						<div class="flex flex-1 flex-col items-center justify-center p-8 text-center">
							<p class="text-sm font-black text-zinc-400">
								Chọn một khách thuê để bắt đầu trò chuyện.
							</p>
						</div>
					{:else}
						<div bind:this={scrollContainer} class="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-2">
							{#if messageList.length === 0}
								<p class="py-16 text-center text-sm font-bold text-zinc-400">
									Chưa có tin nhắn nào.
								</p>
							{/if}
							{#each messageList as message (message.id)}
								{@const mine = message.senderId === userId}
								<div class="flex {mine ? 'justify-end' : 'justify-start'}">
									<div
										class="max-w-[75%] rounded-lg border-2 border-black px-3 py-2 {mine
											? 'bg-blue-300'
											: 'bg-white'}"
									>
										<p class="text-sm font-bold break-words whitespace-pre-wrap text-black">
											{message.content}
										</p>
										<p class="mt-0.5 text-[10px] font-bold text-zinc-500">
											{formatTime(message.createdAt)}
										</p>
										{#if mine && message.telegramDelivery}
											<div
												class="mt-1 flex items-center justify-end gap-2 text-[10px] font-bold {message
													.telegramDelivery.status === 'failed'
													? 'text-red-700'
													: message.telegramDelivery.status === 'queued'
														? 'text-amber-700'
														: 'text-zinc-500'}"
											>
												<span>{telegramMessageStatusLabel(message)}</span>
												{#if message.telegramDelivery.status === 'failed'}
													<button
														onclick={() =>
															retryTelegramDelivery(message.telegramDelivery!.notificationId)}
														disabled={!!retryingDeliveryId}
														class="rounded border border-black/20 bg-white/70 px-1.5 py-0.5 text-[10px] font-black text-black disabled:opacity-50"
													>
														{retryingDeliveryId === message.telegramDelivery.notificationId
															? 'Đang gửi'
															: 'Gửi lại'}
													</button>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
						<div class="flex gap-2 pt-3">
							<input
								type="text"
								bind:value={draft}
								onkeydown={(e) => e.key === 'Enter' && sendMessage()}
								placeholder="Nhập tin nhắn..."
								class="flex-1 rounded-[6px] border-2 border-black bg-white px-3 py-2 text-sm font-bold"
							/>
							<button
								onclick={sendMessage}
								disabled={isSending || !draft.trim()}
								class="rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 font-black shadow-secondary transition-all disabled:opacity-50"
							>
								<Send class="h-4 w-4" />
							</button>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="flex flex-wrap items-center gap-3 text-sm font-bold text-zinc-500">
				<span>{announcements.length} bản tin</span>
				<span>·</span>
				<span>{properties.length} tòa nhà</span>
				<span>·</span>
				<span>{tenantOptions.length} khách thuê</span>
			</div>
			<button
				onclick={() => (isAddDialogOpen = true)}
				class="inline-flex items-center justify-center gap-2 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all"
			>
				Đăng thông báo <Plus class="h-4 w-4" />
			</button>
		</div>

		{#if telegramDeliveries.length > 0}
			<section class="rounded-lg border border-amber-300 bg-amber-50 p-3">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-sm font-black text-black">
							{telegramDeliveries.length} tin Telegram chưa gửi xong
						</h2>
						<p class="mt-0.5 text-xs font-bold text-amber-800">
							Bảng tin trong Roomio vẫn đã lưu. Gửi lại khi bot hoặc kết nối đã ổn.
						</p>
					</div>
					<button
						onclick={retryAllTelegramDeliveries}
						disabled={retryingDeliveryId === 'all' || isLoadingTelegramDeliveries}
						class="inline-flex items-center justify-center gap-2 rounded-[6px] border border-amber-400 bg-white px-3 py-2 text-xs font-black text-black disabled:opacity-50"
					>
						{#if retryingDeliveryId === 'all'}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<RefreshCcw class="h-4 w-4" />
						{/if}
						Gửi lại
					</button>
				</div>
				<div class="mt-3 grid gap-2 lg:grid-cols-2">
					{#each telegramDeliveries.slice(0, 4) as delivery (delivery.id)}
						<div class="rounded-[6px] border border-amber-200 bg-white/75 p-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-xs font-black text-black">
										{telegramDeliveryTenantLabel(delivery)}
									</p>
									<p class="mt-1 line-clamp-2 text-xs font-semibold text-zinc-600">
										{delivery.content}
									</p>
									<p class="mt-1 text-[10px] font-bold text-amber-800">
										Thử {delivery.attemptCount} lần · {delivery.lastError || delivery.status}
									</p>
								</div>
								<button
									onclick={() => retryTelegramDelivery(delivery.id)}
									disabled={!!retryingDeliveryId}
									class="shrink-0 rounded-[6px] border border-black/20 bg-white px-2 py-1 text-[10px] font-black disabled:opacity-50"
								>
									{retryingDeliveryId === delivery.id ? 'Đang gửi' : 'Retry'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
			<section class="min-h-[520px] overflow-hidden rounded-lg border-2 border-black bg-white">
				<div class="flex items-center justify-between border-b-2 border-black px-4 py-3">
					<h2 class="flex items-center gap-2 text-sm font-black text-black">
						Bảng tin đã gửi <Bell class="h-4 w-4" />
					</h2>
				</div>

				{#if isLoadingAnnouncements}
					<div class="flex justify-center py-16">
						<Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
					</div>
				{:else if announcements.length === 0}
					<div class="flex flex-col items-center justify-center px-6 py-20 text-center">
						<AlertCircle class="mb-2 h-8 w-8 text-zinc-300" />
						<p class="text-base font-black text-black">Bảng tin đang trống</p>
					</div>
				{:else}
					<div class="divide-y divide-zinc-200">
						{#each announcements as ann}
							<article class="p-4 transition-colors hover:bg-zinc-50">
								<div class="flex items-start justify-between gap-3">
									<div class="flex min-w-0 items-center gap-2">
										<Pin
											class="h-4 w-4 shrink-0 {ann.isImportant
												? 'fill-red-500 text-red-500'
												: 'text-zinc-400'}"
										/>
										<h3 class="truncate text-sm font-black text-black">{ann.title}</h3>
									</div>
									<button
										onclick={() => handleDeleteAnnouncement(ann.id)}
										class="shrink-0 rounded-[6px] p-1 text-red-600 hover:bg-red-50"
										aria-label="Xóa bản tin"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
								<p class="mt-2 text-sm leading-relaxed font-semibold text-zinc-700">
									{ann.content}
								</p>
								<div
									class="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-bold text-zinc-500"
								>
									<span>Gửi tới: {announcementTargetLabel(ann.targetType)}</span>
									<span class="inline-flex items-center gap-1">
										<Calendar class="h-3 w-3" />
										{formatDate(ann.createdAt)}
									</span>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<aside class="space-y-4">
				<section class="rounded-lg border-2 border-black bg-white p-4">
					<h2 class="text-sm font-black text-black">Phạm vi gửi</h2>
					<div class="mt-4 space-y-3 text-sm font-bold">
						<div class="flex items-center justify-between gap-3">
							<span class="text-zinc-500">Tất cả cư dân</span>
							<span>Toàn hệ thống</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<span class="text-zinc-500">Tòa nhà</span>
							<span>{properties.length}</span>
						</div>
						<div class="flex items-center justify-between gap-3">
							<span class="text-zinc-500">Khách thuê</span>
							<span>{tenantOptions.length}</span>
						</div>
					</div>
				</section>

				<section class="rounded-lg border-2 border-black bg-white p-4">
					<h2 class="text-sm font-black text-black">Mẫu nhanh</h2>
					<div class="mt-3 space-y-2">
						<button
							onclick={() =>
								openAnnouncementTemplate(
									'Nhắc tiền phòng',
									'Chủ nhà nhắc lịch thanh toán tiền phòng tháng này. Khách thuê vui lòng kiểm tra hóa đơn và thanh toán đúng hạn.'
								)}
							class="w-full rounded-[6px] border-2 border-black bg-white px-3 py-2 text-left text-sm font-black transition-colors hover:bg-blue-50"
						>
							Nhắc tiền phòng
						</button>
						<button
							onclick={() =>
								openAnnouncementTemplate(
									'Lịch sửa chữa',
									'Tòa nhà có lịch sửa chữa/bảo trì. Khách thuê vui lòng chú ý thời gian thông báo để chủ động sắp xếp sinh hoạt.',
									true
								)}
							class="w-full rounded-[6px] border-2 border-black bg-white px-3 py-2 text-left text-sm font-black transition-colors hover:bg-blue-50"
						>
							Lịch sửa chữa
						</button>
						<button
							onclick={() =>
								openAnnouncementTemplate(
									'Cập nhật điện nước',
									'Tòa nhà có cập nhật về điện/nước. Khách thuê vui lòng theo dõi thông báo và phản hồi nếu cần hỗ trợ.',
									true
								)}
							class="w-full rounded-[6px] border-2 border-black bg-white px-3 py-2 text-left text-sm font-black transition-colors hover:bg-blue-50"
						>
							Cập nhật điện nước
						</button>
					</div>
				</section>
			</aside>
		</div>
	{/if}

	{#if isAddDialogOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => (isAddDialogOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (isAddDialogOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex w-full max-w-lg animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Đăng thông báo mới</span>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<form onsubmit={handleAddAnnouncement} class="space-y-4 p-6">
					<div class="space-y-1">
						<label for="ann-title" class="block text-xs font-bold text-zinc-600"
							>Tiêu đề bản tin</label
						>
						<input
							id="ann-title"
							type="text"
							bind:value={annTitle}
							required
							placeholder="Ví dụ: Thông báo thu tiền phòng tháng 6 / Mất điện..."
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="space-y-1">
						<label for="ann-content" class="block text-xs font-bold text-zinc-600"
							>Nội dung chi tiết</label
						>
						<textarea
							id="ann-content"
							bind:value={annContent}
							required
							rows="4"
							placeholder="Nhập nội dung đầy đủ để gửi cho khách..."
							class="w-full rounded-lg border-2 border-black bg-white p-3 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						></textarea>
					</div>

					<div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
						<div class="space-y-1">
							<label for="ann-target" class="block text-[10px] font-bold text-zinc-600"
								>Đối tượng nhận tin</label
							>
							<RoomioSelect
								id="ann-target"
								bind:value={annTargetType}
								options={[
									{ value: 'ALL', label: 'Tất cả cư dân' },
									{ value: 'PROPERTY', label: 'Riêng tòa nhà' },
									{ value: 'BLOCK', label: 'Riêng block/tầng' },
									{ value: 'ROOM', label: 'Riêng phòng' },
									{ value: 'TENANT', label: 'Riêng một khách' }
								]}
								compact
							/>
						</div>

						{#if annTargetType === 'PROPERTY'}
							<div class="space-y-1">
								<label for="ann-prop" class="block text-[10px] font-bold text-zinc-600"
									>Chọn tòa nhà</label
								>
								<RoomioSelect
									id="ann-prop"
									bind:value={annTargetId}
									required
									options={[
										{ value: '', label: 'Chọn tòa nhà' },
										...properties.map((property) => ({
											value: property.id,
											label: property.name
										}))
									]}
									compact
								/>
							</div>
						{:else if annTargetType === 'BLOCK'}
							<div class="space-y-1">
								<label for="ann-block" class="block text-[10px] font-bold text-zinc-600"
									>Chọn block</label
								>
								<RoomioSelect
									id="ann-block"
									bind:value={annTargetId}
									required
									options={[
										{ value: '', label: 'Chọn block' },
										...properties.flatMap((property) =>
											(property.blocks || []).map((block) => ({
												value: block.id,
												label: `${property.name} / ${block.name}`
											}))
										)
									]}
									compact
								/>
							</div>
						{:else if annTargetType === 'ROOM'}
							<div class="space-y-1">
								<label for="ann-room-prop" class="block text-[10px] font-bold text-zinc-600"
									>Tòa nhà rồi chọn phòng</label
								>
								<div class="flex gap-1">
									<RoomioSelect
										id="ann-room-prop"
										bind:value={annPropertyId}
										onchange={() => fetchRoomOptions(annPropertyId)}
										class="w-1/2"
										options={[
											{ value: '', label: 'Chọn tòa' },
											...properties.map((property) => ({
												value: property.id,
												label: property.name
											}))
										]}
										compact
									/>
									<RoomioSelect
										bind:value={annTargetId}
										required
										class="w-1/2"
										options={[
											{ value: '', label: 'Chọn phòng' },
											...roomOptions.map((room) => ({
												value: room.id,
												label: `P.${room.roomNumber}`
											}))
										]}
										compact
									/>
								</div>
							</div>
						{:else if annTargetType === 'TENANT'}
							<div class="space-y-1">
								<label for="ann-tenant" class="block text-[10px] font-bold text-zinc-600"
									>Chọn khách thuê</label
								>
								<RoomioSelect
									id="ann-tenant"
									bind:value={annTargetId}
									required
									options={[
										{ value: '', label: 'Chọn khách' },
										...tenantOptions.map((tenant) => ({
											value: tenant.id,
											label: `${tenant.user.name} (P.${tenant.rooms[0]?.roomNumber || '--'})`
										}))
									]}
									compact
								/>
							</div>
						{/if}
					</div>

					<div class="flex items-center gap-2 text-xs">
						<input
							id="ann-imp"
							type="checkbox"
							bind:checked={annIsImportant}
							class="h-4.5 w-4.5 cursor-pointer rounded border-2 border-black text-black focus:ring-blue-300"
						/>
						<label for="ann-imp" class="cursor-pointer font-bold text-zinc-700 select-none"
							>Đánh dấu quan trọng</label
						>
					</div>

					<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
						<button
							type="button"
							onclick={() => (isAddDialogOpen = false)}
							class="rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-zinc-100"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							class="modal-action flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all disabled:opacity-50"
						>
							<span class="modal-action-label">Đăng bản tin</span>
							{#if isSubmitting}
								<Loader2 class="h-4.5 w-4.5 animate-spin" />
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>
