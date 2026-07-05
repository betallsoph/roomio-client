<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		Check,
		Loader2,
		Pencil,
		Phone,
		Plus,
		Search,
		Star,
		Trash2,
		UserRoundCheck,
		UserRoundX,
		X
	} from '@lucide/svelte';
	import { confirmPopup } from '$lib/confirm-popup';

	interface SupportContact {
		id: string;
		landlordId: string;
		category: string;
		name: string;
		phone: string;
		secondaryPhone: string | null;
		company: string | null;
		serviceArea: string | null;
		notes: string | null;
		isPinned: boolean;
		isActive: boolean;
		createdAt: string;
		updatedAt: string;
	}

	const CATEGORY_OPTIONS = [
		{ value: 'repair', label: 'Thợ sửa chữa', tone: 'bg-blue-100 text-blue-800' },
		{ value: 'plumbing', label: 'Điện nước', tone: 'bg-cyan-100 text-cyan-800' },
		{ value: 'electrical', label: 'Điện', tone: 'bg-yellow-100 text-yellow-900' },
		{ value: 'internet', label: 'Internet', tone: 'bg-indigo-100 text-indigo-800' },
		{ value: 'cleaning', label: 'Dọn dẹp / lao công', tone: 'bg-green-100 text-green-800' },
		{ value: 'emergency', label: 'Khẩn cấp', tone: 'bg-red-100 text-red-800' },
		{ value: 'ambulance', label: 'Cứu thương', tone: 'bg-rose-100 text-rose-800' },
		{ value: 'fire', label: 'Chữa cháy', tone: 'bg-orange-100 text-orange-900' },
		{ value: 'security', label: 'Bảo vệ / an ninh', tone: 'bg-zinc-200 text-zinc-800' },
		{ value: 'other', label: 'Khác', tone: 'bg-zinc-100 text-zinc-700' }
	];

	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let contacts = $state<SupportContact[]>([]);
	let isDialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let searchQuery = $state('');
	let categoryFilter = $state('all');

	let form = $state({
		category: 'repair',
		name: '',
		phone: '',
		secondaryPhone: '',
		company: '',
		serviceArea: '',
		notes: '',
		isPinned: false
	});

	onMount(loadContacts);

	async function loadContacts() {
		isLoading = true;
		try {
			const res = await fetch('/api/support-contacts');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không tải được danh bạ hỗ trợ');
			contacts = data;
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isLoading = false;
		}
	}

	function categoryLabel(category: string) {
		return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? 'Khác';
	}

	function categoryTone(category: string) {
		return (
			CATEGORY_OPTIONS.find((option) => option.value === category)?.tone ??
			'bg-zinc-100 text-zinc-700'
		);
	}

	function resetForm() {
		form = {
			category: 'repair',
			name: '',
			phone: '',
			secondaryPhone: '',
			company: '',
			serviceArea: '',
			notes: '',
			isPinned: false
		};
	}

	function openAdd() {
		editingId = null;
		resetForm();
		isDialogOpen = true;
	}

	function openEdit(contact: SupportContact) {
		editingId = contact.id;
		form = {
			category: contact.category,
			name: contact.name,
			phone: contact.phone,
			secondaryPhone: contact.secondaryPhone ?? '',
			company: contact.company ?? '',
			serviceArea: contact.serviceArea ?? '',
			notes: contact.notes ?? '',
			isPinned: contact.isPinned
		};
		isDialogOpen = true;
	}

	async function saveContact(event: SubmitEvent) {
		event.preventDefault();
		if (isSubmitting) return;
		if (!form.name.trim() || !form.phone.trim()) {
			toast.error('Cần nhập tên liên hệ và số điện thoại');
			return;
		}

		isSubmitting = true;
		try {
			const isEdit = editingId !== null;
			const res = await fetch('/api/support-contacts', {
				method: isEdit ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(isEdit ? { id: editingId, ...form } : form)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không lưu được liên hệ');
			toast.success(isEdit ? 'Đã cập nhật liên hệ' : 'Đã thêm liên hệ hỗ trợ');
			isDialogOpen = false;
			await loadContacts();
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function togglePinned(contact: SupportContact) {
		try {
			const res = await fetch('/api/support-contacts', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: contact.id, isPinned: !contact.isPinned })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không cập nhật được ghim');
			toast.success(contact.isPinned ? 'Đã bỏ ghim liên hệ' : 'Đã ghim liên hệ');
			await loadContacts();
		} catch (error: any) {
			toast.error(error.message);
		}
	}

	async function toggleActive(contact: SupportContact) {
		try {
			const res = await fetch('/api/support-contacts', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: contact.id, isActive: !contact.isActive })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không cập nhật được trạng thái');
			toast.success(contact.isActive ? 'Đã ngưng dùng liên hệ' : 'Đã bật lại liên hệ');
			await loadContacts();
		} catch (error: any) {
			toast.error(error.message);
		}
	}

	async function deleteContact(contact: SupportContact) {
		if (
			!(await confirmPopup({
				title: 'Xóa liên hệ hỗ trợ',
				message: `Xóa "${contact.name}" khỏi danh bạ hỗ trợ?`,
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;

		try {
			const res = await fetch(`/api/support-contacts?id=${encodeURIComponent(contact.id)}`, {
				method: 'DELETE'
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không xóa được liên hệ');
			toast.success('Đã xóa liên hệ');
			await loadContacts();
		} catch (error: any) {
			toast.error(error.message);
		}
	}

	function telHref(phone: string) {
		return `tel:${phone.replace(/[^\d+]/g, '')}`;
	}

	const filteredContacts = $derived(() => {
		const query = searchQuery.trim().toLowerCase();
		return contacts.filter((contact) => {
			const matchesCategory = categoryFilter === 'all' || contact.category === categoryFilter;
			const haystack = [
				contact.name,
				contact.phone,
				contact.secondaryPhone,
				contact.company,
				contact.serviceArea,
				contact.notes,
				categoryLabel(contact.category)
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return matchesCategory && (!query || haystack.includes(query));
		});
	});

	const activeCount = $derived(contacts.filter((contact) => contact.isActive).length);
	const pinnedCount = $derived(contacts.filter((contact) => contact.isPinned).length);
</script>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
		<div>
			<p class="text-xs font-black tracking-[0.2em] text-blue-600 uppercase">Danh bạ hỗ trợ</p>
			<h1 class="mt-1 text-2xl font-black text-black">Số thợ, cứu hộ và người hỗ trợ</h1>
			<p class="mt-1 text-sm font-bold text-zinc-500">
				Lưu nhanh số thợ sửa chữa, dọn dẹp, bảo vệ, cứu thương, chữa cháy để gọi khi cần.
			</p>
		</div>
		<button
			type="button"
			onclick={() => window.setTimeout(openAdd, 200)}
			class="inline-flex items-center justify-center gap-2 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-colors hover:bg-blue-400"
		>
			<Plus class="h-4 w-4" />
			Thêm liên hệ
		</button>
	</div>

	<div class="grid gap-3 sm:grid-cols-3">
		<div class="rounded-lg border-2 border-black bg-white p-4">
			<p class="text-xs font-bold text-zinc-500">Tổng liên hệ</p>
			<p class="mt-1 text-2xl font-black">{contacts.length}</p>
		</div>
		<div class="rounded-lg border-2 border-black bg-white p-4">
			<p class="text-xs font-bold text-zinc-500">Đang dùng</p>
			<p class="mt-1 text-2xl font-black text-green-700">{activeCount}</p>
		</div>
		<div class="rounded-lg border-2 border-black bg-white p-4">
			<p class="text-xs font-bold text-zinc-500">Đã ghim</p>
			<p class="mt-1 text-2xl font-black text-blue-700">{pinnedCount}</p>
		</div>
	</div>

	<div class="grid gap-3 lg:grid-cols-[1fr_240px]">
		<label class="relative block">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
			/>
			<input
				bind:value={searchQuery}
				placeholder="Tìm theo tên, số điện thoại, khu vực, ghi chú..."
				class="w-full rounded-lg border-2 border-black bg-white py-2.5 pr-3 pl-9 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
			/>
		</label>
		<select
			bind:value={categoryFilter}
			class="rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-black text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
		>
			<option value="all">Tất cả nhóm</option>
			{#each CATEGORY_OPTIONS as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	{#if isLoading}
		<div class="flex h-[40vh] items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin" />
		</div>
	{:else if filteredContacts().length === 0}
		<div class="mx-auto mt-20 max-w-md rounded-lg bg-zinc-50 p-8 text-center">
			<h3 class="text-lg font-black text-zinc-500">Chưa có liên hệ phù hợp</h3>
			<p class="mt-2 text-sm font-bold text-zinc-400">
				Thêm số thợ ruột, số cứu hộ hoặc số dọn dẹp để khỏi lục lại lúc gấp.
			</p>
		</div>
	{:else}
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredContacts() as contact}
				<article
					class="flex min-h-58 flex-col rounded-lg border-2 border-black bg-white p-4 {contact.isActive
						? ''
						: 'opacity-55'}"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-1.5">
								<span
									class="rounded-full px-2.5 py-1 text-[10px] font-black {categoryTone(
										contact.category
									)}"
								>
									{categoryLabel(contact.category)}
								</span>
								{#if contact.isPinned}
									<span
										class="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800"
									>
										Ghim
									</span>
								{/if}
							</div>
							<h2 class="mt-2 truncate text-lg font-black">{contact.name}</h2>
							{#if contact.company}
								<p class="mt-0.5 truncate text-xs font-bold text-zinc-500">{contact.company}</p>
							{/if}
						</div>
						<button
							type="button"
							onclick={() => togglePinned(contact)}
							class="rounded-[6px] border-2 border-black bg-white p-2 transition-colors hover:bg-blue-50"
							title={contact.isPinned ? 'Bỏ ghim' : 'Ghim'}
						>
							<Star class="h-4 w-4 {contact.isPinned ? 'fill-blue-500 text-blue-500' : ''}" />
						</button>
					</div>

					<div class="mt-4 space-y-2">
						<a
							href={telHref(contact.phone)}
							class="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-800"
						>
							<span class="truncate">{contact.phone}</span>
							<Phone class="h-4 w-4 shrink-0" />
						</a>
						{#if contact.secondaryPhone}
							<a
								href={telHref(contact.secondaryPhone)}
								class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-700"
							>
								<span class="truncate">Số phụ: {contact.secondaryPhone}</span>
								<Phone class="h-3.5 w-3.5 shrink-0" />
							</a>
						{/if}
					</div>

					<div class="mt-4 flex-1 space-y-1 text-xs font-bold text-zinc-500">
						{#if contact.serviceArea}
							<p>Khu vực: <span class="text-black">{contact.serviceArea}</span></p>
						{/if}
						{#if contact.notes}
							<p class="line-clamp-2">Ghi chú: <span class="text-black">{contact.notes}</span></p>
						{/if}
					</div>

					<div class="mt-4 flex items-center justify-between gap-2 border-t border-zinc-200 pt-3">
						<button
							type="button"
							onclick={() => toggleActive(contact)}
							class="inline-flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-[10px] font-black hover:bg-zinc-100"
						>
							{#if contact.isActive}
								<UserRoundCheck class="h-3.5 w-3.5 text-green-700" />
								Đang dùng
							{:else}
								<UserRoundX class="h-3.5 w-3.5 text-zinc-500" />
								Ngưng dùng
							{/if}
						</button>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => openEdit(contact)}
								class="rounded-[6px] border-2 border-black bg-white p-1.5 hover:bg-zinc-100"
								aria-label="Sửa liên hệ"
							>
								<Pencil class="h-4 w-4" />
							</button>
							<button
								type="button"
								onclick={() => deleteContact(contact)}
								class="rounded-[6px] border-2 border-black bg-white p-1.5 text-red-700 hover:bg-red-50"
								aria-label="Xóa liên hệ"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

{#if isDialogOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
		onclick={() => (isDialogOpen = false)}
		onkeydown={(event) => event.key === 'Escape' && (isDialogOpen = false)}
		role="button"
		tabindex="0"
	>
		<div
			class="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border-2 border-black bg-white p-6"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
			role="dialog"
			tabindex="-1"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-lg font-black">
						{editingId ? 'Sửa liên hệ hỗ trợ' : 'Thêm liên hệ hỗ trợ'}
					</h2>
					<p class="mt-1 text-xs font-bold text-zinc-500">
						Lưu số gọi nhanh cho những việc cần xử lý liền tay.
					</p>
				</div>
				<button
					type="button"
					onclick={() => (isDialogOpen = false)}
					class="rounded-lg border-2 border-black bg-white p-1.5 hover:bg-zinc-100"
					aria-label="Đóng"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<form onsubmit={saveContact} class="mt-5 space-y-4">
				<label class="block text-xs font-bold text-zinc-600">
					Nhóm liên hệ
					<select
						bind:value={form.category}
						class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-black text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
					>
						{#each CATEGORY_OPTIONS as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block text-xs font-bold text-zinc-600">
						Tên liên hệ
						<input
							bind:value={form.name}
							required
							maxlength="120"
							placeholder="Anh Tâm điện nước"
							class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</label>
					<label class="block text-xs font-bold text-zinc-600">
						Công ty / đội nhóm
						<input
							bind:value={form.company}
							maxlength="120"
							placeholder="Đội sửa chữa Quận 7"
							class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</label>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block text-xs font-bold text-zinc-600">
						Số điện thoại chính
						<input
							bind:value={form.phone}
							required
							maxlength="40"
							placeholder="0901234567"
							class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</label>
					<label class="block text-xs font-bold text-zinc-600">
						Số phụ
						<input
							bind:value={form.secondaryPhone}
							maxlength="40"
							placeholder="028..."
							class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</label>
				</div>

				<label class="block text-xs font-bold text-zinc-600">
					Khu vực phụ trách
					<input
						bind:value={form.serviceArea}
						maxlength="160"
						placeholder="Toàn hệ thống, Quận 7, Tòa A..."
						class="mt-1 w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
					/>
				</label>

				<label class="block text-xs font-bold text-zinc-600">
					Ghi chú
					<textarea
						bind:value={form.notes}
						maxlength="500"
						rows="3"
						placeholder="Ví dụ: chỉ gọi giờ hành chính, xử lý máy lạnh tốt, ưu tiên khi ngập nước..."
						class="mt-1 w-full resize-none rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
					></textarea>
				</label>

				<label
					class="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-900"
				>
					<input type="checkbox" bind:checked={form.isPinned} class="h-4 w-4 accent-blue-500" />
					Ghim lên đầu danh bạ
				</label>

				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => (isDialogOpen = false)}
						class="rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold hover:bg-zinc-100"
					>
						Hủy
					</button>
					<button
						type="submit"
						disabled={isSubmitting}
						class="inline-flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black hover:bg-blue-400 disabled:opacity-50"
					>
						{#if isSubmitting}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Check class="h-4 w-4" />
						{/if}
						Lưu liên hệ
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
