<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		Bell,
		Plus,
		X,
		Check,
		Trash2,
		Loader2,
		MessageSquare,
		AlertCircle,
		Pin,
		Calendar,
		Home,
		CheckCircle2
	} from '@lucide/svelte';

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

	let landlordId = $state<string | null>(null);
	let userId = $state<string | null>(null);
	let isLoadingNotes = $state(true);
	let isLoadingAnnouncements = $state(true);
	let isSubmitting = $state(false);

	let notes = $state<SpecialNote[]>([]);
	let announcements = $state<Announcement[]>([]);
	let properties = $state<Property[]>([]);

	// Announcements form states
	let isAddDialogOpen = $state(false);
	let annTitle = $state('');
	let annContent = $state('');
	let annIsImportant = $state(false);
	let annTargetType = $state('ALL');
	let annTargetId = $state('');
	let annPropertyId = $state(''); // Tòa nhà được chọn khi gửi theo block/phòng
	let tenantOptions = $state<TenantOption[]>([]);
	let roomOptions = $state<RoomOption[]>([]);

	// Gửi lời nhắn cho khách (chiều chủ nhà -> khách)
	let isNoteDialogOpen = $state(false);
	let noteTenantId = $state('');
	let noteContent = $state('');
	let isSendingNote = $state(false);

	const selectedProperty = $derived(properties.find((p) => p.id === annPropertyId));

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

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		userId = session.id;

		fetchNotes(session.landlordProfileId);
		fetchAnnouncements(session.id);
		fetchProperties(session.landlordProfileId);
		fetchTenantOptions(session.landlordProfileId);
	});

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

	async function fetchAnnouncements(sId: string) {
		isLoadingAnnouncements = true;
		try {
			const res = await fetch(`/api/announcements?senderId=${sId}`);
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
		} catch (e) {
			// Ignore
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

	async function handleAddAnnouncement(e: SubmitEvent) {
		e.preventDefault();
		if (!userId || isSubmitting) return;

		if (!annTitle || !annContent) {
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

			toast.success('Đã đăng và ghim bảng tin thông báo mới');
			isAddDialogOpen = false;

			// Clear forms
			annTitle = '';
			annContent = '';
			annIsImportant = false;
			annTargetType = 'ALL';
			annTargetId = '';

			fetchAnnouncements(userId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteAnnouncement(annId: string) {
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
			const res = await fetch(`/api/announcements?id=${annId}`, {
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
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-black text-black">Thông Báo & Lời Nhắn</h1>
			<p class="text-zinc-650 mt-1 text-sm font-bold">
				Đăng thông báo ghim cho cư dân và theo dõi các lời nhắn đặc biệt
			</p>
		</div>
		<button
			onclick={() => (isAddDialogOpen = true)}
			class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all"
		>
			Đăng thông báo <Plus class="h-4.5 w-4.5" />
		</button>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Left Column: Tenant Special Notes (Direct Messages) -->
		<div
			class="flex h-[70vh] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
		>
			<div
				class="flex shrink-0 items-center justify-between border-b-2 border-black bg-zinc-50 p-4 select-none"
			>
				<h2 class="flex items-center gap-2 text-base font-black text-black">
					Lời nhắn & Đề nghị từ khách <MessageSquare class="h-5 w-5" />
				</h2>
				<button
					onclick={() => window.setTimeout(() => (isNoteDialogOpen = true), 200)}
					class="cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-2.5 py-1.5 text-[10px] font-black shadow-secondary transition-all"
				>
					Gửi lời nhắn cho khách
				</button>
			</div>

			{#if isLoadingNotes}
				<div class="flex flex-grow items-center justify-center bg-white">
					<Loader2 class="h-8 w-8 animate-spin text-black" />
				</div>
			{:else if notes.length === 0}
				<div class="flex flex-grow flex-col items-center justify-center bg-white p-8 text-center">
					<CheckCircle2 class="mb-2 h-12 w-12 text-green-500" />
					<p class="text-base font-black text-black">Hộp thư lời nhắn trống</p>
					<p class="mt-1 text-xs font-semibold text-zinc-500">
						Chưa có lời nhắn hoặc yêu cầu đề nghị riêng nào được gửi.
					</p>
				</div>
			{:else}
				<div class="flex-grow divide-y-2 divide-black overflow-y-auto bg-white">
					{#each notes as note}
						{@const roomNum = note.tenant.rooms[0]?.roomNumber || '--'}
						<div
							class="relative flex flex-col gap-3 p-4 font-semibold text-black transition-all hover:bg-slate-50"
						>
							<div class="flex items-start justify-between">
								<div>
									<h4 class="flex items-center gap-1.5 text-sm font-black text-black">
										Phòng {roomNum} - {note.tenant.user.name}
										{#if note.sender === 'LANDLORD'}
											<span
												class="rounded border-2 border-black bg-blue-200 px-1 text-[9px] font-black"
												>Chủ nhà gửi</span
											>
										{:else}
											<span
												class="rounded border-2 border-black bg-yellow-200 px-1 text-[9px] font-black"
												>Khách gửi</span
											>
										{/if}
									</h4>
									<p class="mt-0.5 text-[10px] font-bold text-zinc-500">
										SĐT: {note.tenant.user.phone} • {new Date(note.createdAt).toLocaleString(
											'vi-VN'
										)}
									</p>
								</div>

								{#if !note.isRead}
									<button
										onclick={() => markNoteAsRead(note.id)}
										class="cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-2.5 py-1 text-[10px] font-black text-black shadow-secondary transition-all hover:bg-blue-400"
									>
										Đọc xong
									</button>
								{:else}
									<span class="text-[10px] font-bold text-zinc-500">Đã xem</span>
								{/if}
							</div>
							<p
								class="rounded-lg border-2 border-black bg-white/30 p-2.5 text-xs leading-relaxed font-semibold text-black shadow-secondary"
							>
								{note.content}
							</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Right Column: Announcements Pinboard -->
		<div
			class="flex h-[70vh] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
		>
			<div
				class="flex shrink-0 items-center justify-between border-b-2 border-black bg-zinc-50 p-4 select-none"
			>
				<h2 class="flex items-center gap-2 text-base font-black text-black">
					Bảng tin thông báo tòa nhà <Bell class="h-5 w-5" />
				</h2>
			</div>

			{#if isLoadingAnnouncements}
				<div class="flex flex-grow items-center justify-center bg-white">
					<Loader2 class="h-8 w-8 animate-spin text-black" />
				</div>
			{:else if announcements.length === 0}
				<div class="flex flex-grow flex-col items-center justify-center bg-white p-8 text-center">
					<AlertCircle class="h-7 w-7" />
					<p class="text-base font-black text-black">Bảng tin đang trống</p>
					<p class="mt-1 text-xs font-semibold text-zinc-500">
						Đăng thông báo ghim để cư dân trong nhà trọ cập nhật tin tức.
					</p>
				</div>
			{:else}
				<div class="flex-grow divide-y-2 divide-black overflow-y-auto bg-white">
					{#each announcements as ann}
						<div class="flex flex-col gap-2 p-4 font-semibold transition-all hover:bg-slate-50">
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 items-center gap-2">
									<Pin
										class="h-4 w-4 shrink-0 {ann.isImportant
											? 'fill-red-500 text-red-500'
											: 'text-zinc-400'}"
									/>
									<h4 class="truncate text-sm font-black text-black">{ann.title}</h4>
								</div>
								<button
									onclick={() => handleDeleteAnnouncement(ann.id)}
									class="text-red-650 hover:bg-red-555 cursor-pointer rounded-lg border-2 border-transparent p-1 transition-colors hover:border-black"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
							<p class="text-xs leading-relaxed font-semibold text-zinc-700">{ann.content}</p>
							<div
								class="mt-2 flex items-center justify-between border-t border-black/10 pt-2 text-[9px] font-bold text-zinc-500"
							>
								<span>Gửi tới: {ann.targetType === 'ALL' ? 'Tất cả' : 'Theo tòa nhà'}</span>
								<span class="flex items-center gap-1">
									<Calendar class="h-3 w-3" />
									{new Date(ann.createdAt).toLocaleDateString('vi-VN')}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Create Announcement Dialog -->
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
				class="relative flex w-full max-w-lg animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
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
					<span class="ml-2 text-xs font-black font-bold text-zinc-500">Đăng thông báo mới</span>
					<button
						onclick={() => (isAddDialogOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<form onsubmit={handleAddAnnouncement} class="space-y-4 p-6">
					<div class="space-y-1">
						<label for="ann-title" class="text-zinc-650 block text-xs font-bold"
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
						<label for="ann-content" class="text-zinc-655 block text-xs font-bold"
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

					<!-- Target & priority selectors -->
					<div class="grid grid-cols-2 gap-3 text-xs">
						<div class="space-y-1">
							<label for="ann-target" class="text-zinc-650 block text-[10px] font-bold"
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
								<label for="ann-prop" class="text-zinc-650 block text-[10px] font-bold"
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
								<label for="ann-block" class="text-zinc-650 block text-[10px] font-bold"
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
								<label for="ann-room-prop" class="text-zinc-650 block text-[10px] font-bold"
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
								<label for="ann-tenant" class="text-zinc-650 block text-[10px] font-bold"
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
							class="h-4.5 w-4.5 animate-none cursor-pointer rounded border-2 border-black text-black focus:ring-blue-300"
						/>
						<label for="ann-imp" class="cursor-pointer font-bold text-zinc-700 select-none"
							>Đánh dấu quan trọng (Ghim lên đầu)</label
						>
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
					<label for="note-tenant" class="text-zinc-650 block text-[10px] font-bold"
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
					<label for="note-content" class="text-zinc-650 block text-[10px] font-bold"
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
					class="w-full rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-sm font-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
				>
					{isSendingNote ? 'Đang gửi...' : 'Gửi lời nhắn'}
				</button>
			</div>
		</div>
	</div>
{/if}
