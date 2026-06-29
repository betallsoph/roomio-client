<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { confirmPopup } from '$lib/confirm-popup';
	import {
		Loader2,
		Mail,
		Pencil,
		Phone,
		Plus,
		ShieldCheck,
		ShieldOff,
		Trash2,
		X
	} from '@lucide/svelte';

	interface Staff {
		id: string;
		userId: string;
		landlordId: string;
		user: {
			id: string;
			name: string;
			email: string;
			phone: string;
			isActive: boolean;
		};
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let staffList = $state<Staff[]>([]);
	let isDialogOpen = $state(false);
	let isSubmitting = $state(false);
	let editingId = $state<string | null>(null);

	let name = $state('');
	let phone = $state('');
	let email = $state('');
	let password = $state('');

	const activeCount = $derived(staffList.filter((staff) => staff.user.isActive).length);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchStaff(session.landlordProfileId);
	});

	async function fetchStaff(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/staff?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) staffList = data;
			else toast.error(data.error || 'Lỗi khi tải danh sách nhân viên');
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách nhân viên: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	function openAdd() {
		editingId = null;
		name = '';
		phone = '';
		email = '';
		password = '';
		isDialogOpen = true;
	}

	function openEdit(staff: Staff) {
		editingId = staff.id;
		name = staff.user.name;
		phone = staff.user.phone;
		email = staff.user.email;
		password = '';
		isDialogOpen = true;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (isSubmitting) return;

		if (!name || !phone || !email) {
			toast.error('Vui lòng nhập đầy đủ tên, số điện thoại và email');
			return;
		}
		if (!editingId && !password) {
			toast.error('Vui lòng đặt mật khẩu cho nhân viên mới');
			return;
		}

		isSubmitting = true;
		try {
			const isEdit = editingId !== null;
			const res = await fetch('/api/staff', {
				method: isEdit ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					isEdit
						? { id: editingId, name, phone, email, password: password || undefined }
						: { name, phone, email, password }
				)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi lưu thông tin nhân viên');

			toast.success(isEdit ? 'Đã cập nhật nhân viên' : `Đã tạo tài khoản cho nhân viên ${name}`);
			isDialogOpen = false;
			if (landlordId) fetchStaff(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function toggleActive(staff: Staff) {
		try {
			const res = await fetch('/api/staff', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: staff.id, isActive: !staff.user.isActive })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật trạng thái');
			toast.success(staff.user.isActive ? 'Đã khóa tài khoản nhân viên' : 'Đã mở khóa nhân viên');
			if (landlordId) fetchStaff(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function handleDelete(staff: Staff) {
		if (
			!(await confirmPopup({
				title: 'Xóa nhân viên',
				message: `Xóa vĩnh viễn tài khoản nhân viên "${staff.user.name}"?`,
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;

		try {
			const res = await fetch(`/api/staff?id=${staff.id}`, { method: 'DELETE' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa nhân viên');
			toast.success('Đã xóa nhân viên');
			if (landlordId) fetchStaff(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}
</script>

<div class="space-y-5">
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h2 class="text-lg font-black text-black">Nhân viên</h2>
			<p class="mt-1 text-sm font-bold text-zinc-500">
				{staffList.length} tài khoản · {activeCount} đang hoạt động
			</p>
		</div>
		<button
			onclick={() => window.setTimeout(openAdd, 200)}
			class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all sm:w-auto sm:justify-start"
		>
			Thêm nhân viên <Plus class="h-4 w-4" />
		</button>
	</div>

	{#if isLoading}
		<div class="flex h-[36vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if staffList.length === 0}
		<div class="rounded-lg border-2 border-black bg-white p-10 text-center">
			<h3 class="mt-2 text-lg font-black text-black">Chưa có nhân viên nào</h3>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border-2 border-black bg-white">
			<div class="divide-y-2 divide-black bg-white sm:hidden">
				{#each staffList as staff}
					<div class="space-y-2 p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm font-black text-black">{staff.user.name}</p>
								<p class="mt-0.5 text-xs font-bold text-zinc-500">{staff.user.phone}</p>
							</div>
							{#if staff.user.isActive}
								<span
									class="shrink-0 rounded-full border border-black bg-green-200 px-2 py-0.5 text-[10px] font-black text-green-800"
									>Hoạt động</span
								>
							{:else}
								<span
									class="shrink-0 rounded-full border border-black bg-zinc-200 px-2 py-0.5 text-[10px] font-black text-zinc-600"
									>Đã khóa</span
								>
							{/if}
						</div>
						<div class="flex items-center justify-end gap-2 pt-1">
							<button
								onclick={() => toggleActive(staff)}
								class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold text-black shadow-secondary transition-all"
							>
								{staff.user.isActive ? 'Khóa' : 'Mở'}
							</button>
							<button
								onclick={() => window.setTimeout(() => openEdit(staff), 200)}
								class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold text-black shadow-secondary transition-all"
							>
								Sửa
							</button>
							<button
								onclick={() => handleDelete(staff)}
								class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 px-2.5 py-1.5 text-xs font-bold text-red-800 shadow-secondary transition-all"
							>
								Xóa
							</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="hidden overflow-x-auto bg-white sm:block">
				<table class="w-full border-collapse text-left text-sm">
					<thead>
						<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
							<th class="px-4 py-3">Tên nhân viên</th>
							<th class="px-4 py-3">Số điện thoại</th>
							<th class="px-4 py-3">Email đăng nhập</th>
							<th class="px-4 py-3">Trạng thái</th>
							<th class="px-4 py-3 text-right">Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{#each staffList as staff}
							<tr
								class="border-b border-black/15 font-semibold text-black transition-colors hover:bg-slate-50"
							>
								<td class="px-4 py-4 font-black">{staff.user.name}</td>
								<td class="px-4 py-4">{staff.user.phone}</td>
								<td class="px-4 py-4">{staff.user.email}</td>
								<td class="px-4 py-4">
									{#if staff.user.isActive}
										<span
											class="rounded-full border border-black bg-green-200 px-2.5 py-0.5 text-[10px] font-black text-green-800"
											>Hoạt động</span
										>
									{:else}
										<span
											class="rounded-full border border-black bg-zinc-200 px-2.5 py-0.5 text-[10px] font-black text-zinc-600"
											>Đã khóa</span
										>
									{/if}
								</td>
								<td class="px-4 py-4">
									<div class="flex items-center justify-end gap-2">
										<button
											onclick={() => toggleActive(staff)}
											title={staff.user.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
											class="cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all hover:bg-zinc-100"
										>
											{#if staff.user.isActive}
												<ShieldOff class="h-4 w-4" />
											{:else}
												<ShieldCheck class="h-4 w-4" />
											{/if}
										</button>
										<button
											onclick={() => window.setTimeout(() => openEdit(staff), 200)}
											title="Sửa"
											class="cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all hover:bg-zinc-100"
										>
											<Pencil class="h-4 w-4" />
										</button>
										<button
											onclick={() => handleDelete(staff)}
											title="Xóa"
											class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 p-2 text-red-800 shadow-secondary transition-all hover:bg-red-300"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if isDialogOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
			onkeydown={(e) => e.key === 'Escape' && (isDialogOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex max-h-[90vh] w-full max-w-md animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white"
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
					<span class="ml-2 text-xs font-black text-zinc-500">
						{editingId ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
					</span>
					<button
						onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
						class="ml-auto cursor-pointer rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200"
					>
						<X class="h-4.5 w-4.5" />
					</button>
				</div>

				<form onsubmit={handleSubmit} class="space-y-4 overflow-y-auto p-6">
					<div class="space-y-1">
						<label for="s-name" class="block text-[10px] font-bold text-zinc-600"
							>Họ và tên nhân viên</label
						>
						<input
							id="s-name"
							type="text"
							bind:value={name}
							required
							placeholder="Trần Thị B"
							class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1">
							<label for="s-phone" class="block text-[10px] font-bold text-zinc-600"
								>Số điện thoại</label
							>
							<div class="relative">
								<span
									class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-zinc-400"
									><Phone class="h-3.5 w-3.5" /></span
								>
								<input
									id="s-phone"
									type="tel"
									bind:value={phone}
									required
									placeholder="0987654321"
									class="w-full rounded-lg border-2 border-black bg-white py-1.5 pr-2.5 pl-8 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</div>
						</div>
						<div class="space-y-1">
							<label for="s-email" class="block text-[10px] font-bold text-zinc-600"
								>Email đăng nhập</label
							>
							<div class="relative">
								<span
									class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-zinc-400"
									><Mail class="h-3.5 w-3.5" /></span
								>
								<input
									id="s-email"
									type="email"
									bind:value={email}
									required
									placeholder="nhanvien@nhatro.com"
									class="w-full rounded-lg border-2 border-black bg-white py-1.5 pr-2.5 pl-8 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</div>
						</div>
					</div>

					<div class="space-y-1">
						<label for="s-pass" class="block text-[10px] font-bold text-zinc-600">
							{editingId ? 'Đặt lại mật khẩu (để trống nếu giữ nguyên)' : 'Mật khẩu truy cập'}
						</label>
						<input
							id="s-pass"
							type="password"
							bind:value={password}
							placeholder={editingId ? '••••••••' : 'Mật khẩu cho nhân viên'}
							class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
						<button
							type="button"
							onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
							class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-zinc-100"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							{editingId ? 'Lưu thay đổi' : 'Tạo nhân viên'}
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
