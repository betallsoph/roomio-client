<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { X, Check, Loader2 } from '@lucide/svelte';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	interface Request {
		id: string;
		tenantId: string;
		roomNumber: string;
		buildingName: string;
		category: string; // 'maintenance' | 'plumbing' | 'electrical' | 'internet' | 'other'
		title: string;
		description: string;
		imageUrl: string | null;
		status: string; // 'pending' | 'in_progress' | 'completed' | 'rejected'
		priority: string; // 'important' | 'normal'
		createdAt: string;
		response: string | null;
		assignedToId: string | null;
		tenant: {
			user: {
				name: string;
				phone: string;
			};
		};
		assignedTo: {
			user: {
				name: string;
				phone: string;
			};
		} | null;
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let requests = $state<Request[]>([]);
	let selectedRequest = $state<Request | null>(null);
	let isDetailOpen = $state(false);

	// Filters
	let statusFilter = $state('');
	let priorityFilter = $state('');

	// Response form states
	let replyText = $state('');
	let isSubmitting = $state(false);

	// Phân công nhân viên
	let staffList = $state<{ id: string; user: { name: string } }[]>([]);
	let assignSelection = $state('');
	let isAssigning = $state(false);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchRequests(session.landlordProfileId);
		fetchStaff(session.landlordProfileId);
	});

	async function fetchRequests(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/requests?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) requests = data;
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách sự cố: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function fetchStaff(profileId: string) {
		try {
			const res = await fetch(`/api/staff?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) staffList = data;
		} catch (e) {
			// Bỏ qua lỗi tải nhân viên — vẫn xem được sự cố
		}
	}

	async function assignStaff(requestId: string) {
		if (isAssigning) return;
		isAssigning = true;
		try {
			const res = await fetch('/api/requests', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: requestId, assignedToId: assignSelection || null })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi khi giao việc');

			toast.success(assignSelection ? 'Đã giao việc cho nhân viên' : 'Đã bỏ phân công');
			if (landlordId) fetchRequests(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isAssigning = false;
		}
	}

	async function updateRequestStatus(requestId: string, status: string) {
		if (isSubmitting) return;
		isSubmitting = true;

		try {
			const res = await fetch('/api/requests', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: requestId,
					status,
					response: replyText || undefined
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật sự cố');

			toast.success(`Đã cập nhật trạng thái sự cố sang: ${getStatusLabel(status)}`);
			isDetailOpen = false;
			selectedRequest = null;
			replyText = '';
			if (landlordId) fetchRequests(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	function getStatusLabel(status: string): string {
		const labels: Record<string, string> = {
			pending: 'Đang chờ',
			in_progress: 'Đang sửa',
			completed: 'Đã xong',
			rejected: 'Từ chối'
		};
		return labels[status] || status;
	}

	function getCategoryLabel(cat: string): string {
		const labels: Record<string, string> = {
			maintenance: 'Nội thất/Gia dụng',
			plumbing: 'Đường nước',
			electrical: 'Hệ thống điện',
			internet: 'Mạng Wifi',
			other: 'Khác'
		};
		return labels[cat] || cat;
	}

	// Filtered requests computed state
	const filteredRequests = $derived(() => {
		return requests.filter((req) => {
			const matchStatus = statusFilter === '' || req.status === statusFilter;
			const matchPriority = priorityFilter === '' || req.priority === priorityFilter;
			return matchStatus && matchPriority;
		});
	});
</script>

<div class="space-y-6">
	<!-- Filters -->
	<div class="flex gap-4 overflow-x-auto pb-1">
		<div class="shrink-0 space-y-1">
			<span class="text-zinc-650 block text-[10px] font-bold">Trạng thái sự cố</span>
			<RoomioSelect
				bind:value={statusFilter}
				class="w-44"
				options={[
					{ value: '', label: 'Tất cả trạng thái' },
					{ value: 'pending', label: 'Đang chờ' },
					{ value: 'in_progress', label: 'Đang sửa' },
					{ value: 'completed', label: 'Đã xong' },
					{ value: 'rejected', label: 'Từ chối' }
				]}
			/>
		</div>

		<div class="shrink-0 space-y-1">
			<span class="text-zinc-650 block text-[10px] font-bold">Mức độ khẩn cấp</span>
			<RoomioSelect
				bind:value={priorityFilter}
				class="w-44"
				options={[
					{ value: '', label: 'Tất cả' },
					{ value: 'important', label: 'Khẩn cấp / Gấp' },
					{ value: 'normal', label: 'Bình thường' }
				]}
			/>
		</div>
	</div>

	{#if isLoading}
		<div class="flex h-[50vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if filteredRequests().length === 0}
		<div
			class="mx-auto max-w-md rounded-lg border-2 border-black bg-white p-12 text-center shadow-secondary"
		>
			<h3 class="text-lg font-black text-black">Không có yêu cầu sự cố</h3>
			<p class="text-zinc-650 mt-2 text-sm font-semibold">
				Tuyệt vời! Hiện tại không ghi nhận sự cố nào từ cư dân.
			</p>
		</div>
	{:else}
		<!-- Grid of incident cards -->
		<div class="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			{#each filteredRequests() as req}
				{@const statusBadge =
					req.status === 'completed'
						? 'bg-green-200 text-green-800'
						: req.status === 'in_progress'
							? 'bg-blue-300 text-black'
							: req.status === 'rejected'
								? 'bg-zinc-200 text-zinc-600'
								: 'bg-red-200 text-red-800'}

				<div
					onclick={() => {
						selectedRequest = req;
						replyText = req.response || '';
						assignSelection = req.assignedToId || '';
						isDetailOpen = true;
					}}
					onkeydown={(e) =>
						e.key === 'Enter' &&
						((selectedRequest = req),
						(replyText = req.response || ''),
						(assignSelection = req.assignedToId || ''),
						(isDetailOpen = true))}
					role="button"
					tabindex="0"
					class="cursor-pointer rounded-lg border-2 border-black bg-white p-5 text-left shadow-secondary transition-all focus:ring-2 focus:ring-blue-300 focus:outline-none"
				>
					<div class="mb-3 flex items-start justify-between gap-2">
						<div>
							<span
								class="rounded-full border border-black px-2.5 py-0.5 text-[10px] font-black {statusBadge}"
							>
								{getStatusLabel(req.status)}
							</span>
							{#if req.priority === 'important'}
								<span
									class="ml-1.5 animate-pulse rounded-full border border-black bg-red-500 px-2 py-0.5 text-[9px] font-black text-black"
								>
									Gấp
								</span>
							{/if}
						</div>
						<span class="text-zinc-650 shrink-0 text-xs font-bold"
							>{new Date(req.createdAt).toLocaleDateString('vi-VN')}</span
						>
					</div>

					<h3 class="truncate text-base leading-tight font-black text-black">{req.title}</h3>
					<p class="mt-1 truncate text-xs font-semibold text-zinc-600">
						{req.buildingName} - Phòng {req.roomNumber}
					</p>
					<p class="mt-2 line-clamp-2 text-xs leading-relaxed font-semibold text-zinc-500">
						{req.description}
					</p>

					<div
						class="text-zinc-650 mt-4 flex items-center justify-between border-t border-black/15 pt-3 text-xs"
					>
						<span class="font-bold">{req.tenant.user.name}</span>
						<span
							class="rounded-lg border border-black bg-white px-2 py-1 text-[9px] font-bold text-black shadow-secondary"
						>
							{getCategoryLabel(req.category)}
						</span>
					</div>

					{#if req.assignedTo}
						<p class="mt-2 text-[10px] font-black text-blue-600">
							Phụ trách: {req.assignedTo.user.name}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Detail Dialog Drawer slide-over -->
	{#if isDetailOpen && selectedRequest}
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
				class="flex h-full w-full max-w-2xl animate-[slide-left_0.2s_ease-out] flex-col justify-between overflow-hidden border-l-2 border-black bg-white shadow-primary sm:w-[72vw] lg:w-[46vw]"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<div class="flex shrink-0 items-center px-6 pt-5 select-none">
					<span class="text-base font-black text-black">Chi tiết sự cố</span>
					<button
						onclick={() => (isDetailOpen = false)}
						class="ml-auto cursor-pointer rounded-[6px] p-1 text-black hover:bg-zinc-100"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<div class="flex-1 space-y-6 overflow-y-auto p-6">
					<!-- Drawer Header Details -->
					<div>
						<div>
							<h3 class="text-lg leading-tight font-black text-black">Yêu Cầu Sửa Chữa</h3>
							<p class="mt-0.5 text-xs font-bold text-zinc-600">
								Phòng {selectedRequest.roomNumber} ({selectedRequest.buildingName})
							</p>
						</div>
					</div>

					<!-- Metadata table -->
					<div
						class="grid grid-cols-2 gap-4 rounded-lg border-2 border-black bg-white p-4 text-xs font-semibold text-black shadow-secondary"
					>
						<div>
							<p class="text-[9px] font-bold text-zinc-500">Khách báo sự cố</p>
							<p class="mt-0.5 font-black text-black">
								{selectedRequest.tenant.user.name} ({selectedRequest.tenant.user.phone})
							</p>
						</div>
						<div>
							<p class="text-[9px] font-bold text-zinc-500">Ngày gửi báo cáo</p>
							<p class="mt-0.5 font-black text-black">
								{new Date(selectedRequest.createdAt).toLocaleDateString('vi-VN')}
							</p>
						</div>
						<div>
							<p class="text-[9px] font-bold text-zinc-500">Danh mục kỹ thuật</p>
							<p class="mt-0.5 font-black text-black">
								{getCategoryLabel(selectedRequest.category)}
							</p>
						</div>
						<div>
							<p class="text-[9px] font-bold text-zinc-500">Mức độ ưu tiên</p>
							<p
								class="mt-0.5 font-black {selectedRequest.priority === 'important'
									? 'text-red-650 animate-pulse'
									: 'text-black'}"
							>
								{selectedRequest.priority === 'important' ? 'Khẩn cấp / Gấp' : 'Bình thường'}
							</p>
						</div>
					</div>

					<!-- Ticket Content -->
					<div class="space-y-2">
						<h4 class="text-xs font-black text-zinc-500">Mô tả sự cố</h4>
						<div
							class="space-y-2 rounded-lg border-2 border-black bg-white p-4 text-black shadow-secondary"
						>
							<h5 class="text-sm font-black text-black">{selectedRequest.title}</h5>
							<p class="text-zinc-650 text-xs leading-relaxed font-semibold">
								{selectedRequest.description}
							</p>
						</div>
					</div>

					<!-- Incident Image -->
					{#if selectedRequest.imageUrl}
						<div class="space-y-2">
							<h4 class="text-xs font-black text-zinc-500">Ảnh đính kèm</h4>
							<img
								src={selectedRequest.imageUrl}
								alt="Anh su co"
								class="max-h-64 w-full rounded-lg border-2 border-black bg-white object-contain shadow-secondary"
							/>
						</div>
					{/if}

					<!-- Response Reply -->
					<div class="space-y-2">
						<label for="req-reply" class="text-zinc-650 block text-xs font-black"
							>Phản hồi của chủ nhà / Biên bản sửa chữa</label
						>
						<textarea
							id="req-reply"
							bind:value={replyText}
							placeholder="Nhập ghi chú sửa chữa, ngày hoàn thành hoặc phản hồi cho cư dân biết..."
							rows="3"
							class="w-full rounded-lg border-2 border-black bg-white p-3 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						></textarea>
					</div>

					<!-- Giao việc cho nhân viên -->
					<div class="space-y-2">
						<label for="req-assign" class="text-zinc-650 block text-xs font-black"
							>Giao cho nhân viên</label
						>
						<div class="flex gap-2">
							<RoomioSelect
								id="req-assign"
								bind:value={assignSelection}
								class="flex-1"
								options={[
									{ value: '', label: 'Chưa giao' },
									...staffList.map((staff) => ({ value: staff.id, label: staff.user.name }))
								]}
								compact
							/>
							<button
								type="button"
								onclick={() => assignStaff(selectedRequest!.id)}
								disabled={isAssigning}
								class="modal-action cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all"
							>
								<span class="modal-action-label">Lưu</span>
							</button>
						</div>
						{#if staffList.length === 0}
							<p class="text-[10px] font-semibold text-zinc-400">
								Chưa có nhân viên — thêm trong Cài đặt.
							</p>
						{/if}
					</div>
				</div>

				<!-- Action update footer buttons -->
				<div class="bg-zinc-150 flex shrink-0 flex-wrap gap-3 border-t-2 border-black p-4 sm:p-6">
					<button
						onclick={() => updateRequestStatus(selectedRequest!.id, 'in_progress')}
						disabled={isSubmitting}
						class="modal-action min-w-[100px] flex-1 cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-xs font-black text-black shadow-secondary transition-all"
					>
						<span class="modal-action-label">Đang sửa</span>
					</button>

					<button
						onclick={() => updateRequestStatus(selectedRequest!.id, 'completed')}
						disabled={isSubmitting}
						class="flex min-w-[100px] flex-grow cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 py-2.5 text-xs font-black text-black shadow-secondary transition-all hover:bg-green-300"
					>
						Đã xong <Check class="h-4 w-4" />
					</button>

					<button
						onclick={() => updateRequestStatus(selectedRequest!.id, 'rejected')}
						disabled={isSubmitting}
						class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 px-4 py-2.5 text-xs font-black text-red-800 shadow-secondary transition-all hover:bg-red-300"
					>
						Từ chối
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
