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
		CheckCircle2,
		Loader2,
		MessageSquare,
		Pin,
		Plus,
		Send,
		Trash2,
		X
	} from '@lucide/svelte';

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
	}

	interface SpecialNote {
		id: string;
		content: string;
		sender: string;
		isRead: boolean;
		createdAt: string;
		tenant: {
			user: {
				name: string;
				phone: string;
			};
			rooms: {
				roomNumber: string;
			}[];
		};
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

	let isLoadingNotes = $state(true);
	let isLoadingAnnouncements = $state(true);
	let isSubmitting = $state(false);
	let notes = $state<SpecialNote[]>([]);
	let announcements = $state<Announcement[]>([]);
	let properties = $state<Property[]>([]);

	let isAddDialogOpen = $state(false);
	let annTitle = $state('');
	let annContent = $state('');
	let annIsImportant = $state(false);
	let annTargetType = $state('ALL');
	let annTargetId = $state('');
	let annPropertyId = $state('');
	let tenantOptions = $state<TenantOption[]>([]);
	let roomOptions = $state<RoomOption[]>([]);

	let isNoteDialogOpen = $state(false);
	let noteTenantId = $state('');
	let noteContent = $state('');
	let isSendingNote = $state(false);

	onMount(() => {
		activeTab = page.url.searchParams.get('tab') === 'announcements' ? 'announcements' : 'messages';

		const sessionStr = localStorage.getItem('roomio_user');
		if (sessionStr) {
			const session = JSON.parse(sessionStr);
			landlordId = session.landlordProfileId;
			userId = session.id;
			loadTenants();
			fetchNotes(session.landlordProfileId);
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
			await loadMessages(true);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Lỗi gửi tin nhắn');
		} finally {
			isSending = false;
		}
	}

	async function fetchNotes(profileId: string) {
		isLoadingNotes = true;
		try {
			const res = await fetch(`/api/notifications?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) notes = data;
		} catch (e: any) {
			toast.error('Lỗi khi tải lời nhắn của khách: ' + e.message);
		} finally {
			isLoadingNotes = false;
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

	async function markNoteAsRead(noteId: string) {
		try {
			const res = await fetch('/api/notifications', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: noteId, isRead: true })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật');
			toast.success('Đã đánh dấu đã đọc lời nhắn');
			if (landlordId) fetchNotes(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function sendNoteToTenant() {
		if (!noteTenantId || !noteContent.trim()) {
			toast.error('Vui lòng chọn khách và nhập nội dung lời nhắn');
			return;
		}
		isSendingNote = true;
		try {
			const res = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tenantId: noteTenantId, content: noteContent, sender: 'LANDLORD' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi gửi lời nhắn');
			toast.success('Đã gửi lời nhắn cho khách');
			isNoteDialogOpen = false;
			noteContent = '';
			noteTenantId = '';
			if (landlordId) fetchNotes(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSendingNote = false;
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

	function noteRoomLabel(note: SpecialNote) {
		return note.tenant.rooms[0]?.roomNumber || '--';
	}

	function announcementTargetLabel(targetType: string) {
		if (targetType === 'ALL') return 'Tất cả';
		if (targetType === 'PROPERTY') return 'Tòa nhà';
		if (targetType === 'BLOCK') return 'Block';
		if (targetType === 'ROOM') return 'Phòng';
		if (targetType === 'TENANT') return 'Khách thuê';
		return targetType;
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
		{#if isLoadingTenants || isLoadingNotes}
			<div class="flex justify-center py-16">
				<Loader2 class="h-8 w-8 animate-spin text-zinc-400" />
			</div>
		{:else}
			<div
				class="grid grid-cols-1 gap-4 xl:h-[calc(100vh-210px)] xl:grid-cols-[280px_minmax(0,1fr)_320px]"
			>
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

				<section class="flex min-h-[460px] flex-col rounded-lg border-2 border-black bg-white">
					{#if !selectedTenant}
						<div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
							<MessageSquare class="h-8 w-8 text-zinc-300" />
							<p class="text-sm font-black text-zinc-400">
								Chọn một khách thuê để bắt đầu trò chuyện.
							</p>
						</div>
					{:else}
						<div class="border-b-2 border-black px-4 py-3">
							<p class="text-sm font-black">{selectedTenant.user.name}</p>
							<p class="text-xs font-bold text-zinc-500">
								{selectedTenant.user.phone} · {tenantRoomLabel(selectedTenant)}
							</p>
						</div>
						<div bind:this={scrollContainer} class="flex-1 space-y-2 overflow-y-auto p-4">
							{#if messageList.length === 0}
								<p class="py-8 text-center text-xs font-bold text-zinc-400">
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
									</div>
								</div>
							{/each}
						</div>
						<div class="flex gap-2 border-t-2 border-black p-3">
							<input
								type="text"
								bind:value={draft}
								onkeydown={(e) => e.key === 'Enter' && sendMessage()}
								placeholder="Nhập tin nhắn..."
								class="flex-1 rounded-[6px] border-2 border-black px-3 py-2 text-sm font-bold"
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

				<section
					class="flex min-h-72 flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
				>
					<div class="flex items-center justify-between gap-3 border-b-2 border-black px-4 py-3">
						<h2 class="text-sm font-black text-black">Lời nhắn riêng</h2>
						<button
							onclick={() => window.setTimeout(() => (isNoteDialogOpen = true), 200)}
							class="rounded-[6px] border-2 border-black bg-blue-300 px-2.5 py-1.5 text-xs font-black shadow-secondary transition-all"
						>
							Gửi
						</button>
					</div>
					<div class="min-h-0 flex-1 overflow-y-auto">
						{#if notes.length === 0}
							<div class="flex h-full flex-col items-center justify-center p-6 text-center">
								<CheckCircle2 class="mb-2 h-8 w-8 text-green-500" />
								<p class="text-sm font-black text-black">Không có lời nhắn</p>
							</div>
						{:else}
							{#each notes as note}
								<div class="border-b border-zinc-200 p-4">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-black">
												P.{noteRoomLabel(note)} · {note.tenant.user.name}
											</p>
											<p class="text-[10px] font-bold text-zinc-500">
												{formatTime(note.createdAt)}
											</p>
										</div>
										{#if !note.isRead}
											<button
												onclick={() => markNoteAsRead(note.id)}
												class="shrink-0 rounded-[6px] border-2 border-black bg-blue-100 px-2 py-1 text-[10px] font-black"
											>
												Đã đọc
											</button>
										{/if}
									</div>
									<p class="mt-2 text-xs leading-relaxed font-semibold text-zinc-700">
										{note.content}
									</p>
								</div>
							{/each}
						{/if}
					</div>
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
				<div
					class="flex shrink-0 items-center gap-2 border-b-2 border-black bg-zinc-50 px-4 py-3 select-none"
				>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-red-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-yellow-500"></div>
					<div class="h-2.5 w-2.5 rounded-full border border-black bg-green-500"></div>
					<span class="ml-2 text-xs font-black text-zinc-500">Đăng thông báo mới</span>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200"
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
							<select
								id="ann-target"
								bind:value={annTargetType}
								class="w-full rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
							>
								<option value="ALL">Tất cả cư dân</option>
								<option value="PROPERTY">Riêng tòa nhà</option>
								<option value="BLOCK">Riêng block/tầng</option>
								<option value="ROOM">Riêng phòng</option>
								<option value="TENANT">Riêng một khách</option>
							</select>
						</div>

						{#if annTargetType === 'PROPERTY'}
							<div class="space-y-1">
								<label for="ann-prop" class="block text-[10px] font-bold text-zinc-600"
									>Chọn tòa nhà</label
								>
								<select
									id="ann-prop"
									bind:value={annTargetId}
									required
									class="w-full rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
								>
									<option value="">-- Chọn tòa nhà --</option>
									{#each properties as prop}
										<option value={prop.id}>{prop.name}</option>
									{/each}
								</select>
							</div>
						{:else if annTargetType === 'BLOCK'}
							<div class="space-y-1">
								<label for="ann-block" class="block text-[10px] font-bold text-zinc-600"
									>Chọn block</label
								>
								<select
									id="ann-block"
									bind:value={annTargetId}
									required
									class="w-full rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
								>
									<option value="">-- Chọn block --</option>
									{#each properties as prop}
										{#each prop.blocks || [] as block}
											<option value={block.id}>{prop.name} / {block.name}</option>
										{/each}
									{/each}
								</select>
							</div>
						{:else if annTargetType === 'ROOM'}
							<div class="space-y-1">
								<label for="ann-room-prop" class="block text-[10px] font-bold text-zinc-600"
									>Tòa nhà rồi chọn phòng</label
								>
								<div class="flex gap-1">
									<select
										id="ann-room-prop"
										bind:value={annPropertyId}
										onchange={() => fetchRoomOptions(annPropertyId)}
										class="w-1/2 rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
									>
										<option value="">-- Tòa --</option>
										{#each properties as prop}
											<option value={prop.id}>{prop.name}</option>
										{/each}
									</select>
									<select
										bind:value={annTargetId}
										required
										class="w-1/2 rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
									>
										<option value="">-- Phòng --</option>
										{#each roomOptions as room}
											<option value={room.id}>P.{room.roomNumber}</option>
										{/each}
									</select>
								</div>
							</div>
						{:else if annTargetType === 'TENANT'}
							<div class="space-y-1">
								<label for="ann-tenant" class="block text-[10px] font-bold text-zinc-600"
									>Chọn khách thuê</label
								>
								<select
									id="ann-tenant"
									bind:value={annTargetId}
									required
									class="w-full rounded-lg border-2 border-black bg-white px-2 py-1.5 font-semibold text-black focus:outline-none"
								>
									<option value="">-- Chọn khách --</option>
									{#each tenantOptions as tenant}
										<option value={tenant.id}
											>{tenant.user.name} (P.{tenant.rooms[0]?.roomNumber || '--'})</option
										>
									{/each}
								</select>
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
							class="flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							Đăng bản tin
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

{#if isNoteDialogOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
	>
		<div class="w-full max-w-md rounded-lg border-2 border-black bg-white">
			<div class="flex items-center justify-between border-b-2 border-black p-4">
				<h2 class="text-base font-black">Gửi lời nhắn cho khách thuê</h2>
				<button
					onclick={() => window.setTimeout(() => (isNoteDialogOpen = false), 200)}
					class="rounded-[6px] border-2 border-black p-1.5 hover:bg-zinc-50"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="space-y-3 p-4">
				<div class="space-y-1">
					<label for="note-tenant" class="block text-[10px] font-bold text-zinc-600"
						>Khách thuê</label
					>
					<select
						id="note-tenant"
						bind:value={noteTenantId}
						class="w-full rounded-lg border-2 border-black bg-white px-2 py-2 text-sm font-semibold text-black focus:outline-none"
					>
						<option value="">-- Chọn khách --</option>
						{#each tenantOptions as tenant}
							<option value={tenant.id}
								>{tenant.user.name} (P.{tenant.rooms[0]?.roomNumber || '--'})</option
							>
						{/each}
					</select>
				</div>
				<div class="space-y-1">
					<label for="note-content" class="block text-[10px] font-bold text-zinc-600"
						>Nội dung lưu ý</label
					>
					<textarea
						id="note-content"
						bind:value={noteContent}
						rows="4"
						placeholder="Lời nhắn/lưu ý riêng gửi khách, tách biệt với chat để không bị trôi..."
						class="w-full rounded-lg border-2 border-black bg-white p-3 text-xs font-semibold text-black focus:outline-none"
					></textarea>
				</div>
				<button
					onclick={sendNoteToTenant}
					disabled={isSendingNote}
					class="w-full rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-sm font-black shadow-secondary transition-all disabled:opacity-50"
				>
					{isSendingNote ? 'Đang gửi...' : 'Gửi lời nhắn'}
				</button>
			</div>
		</div>
	</div>
{/if}
