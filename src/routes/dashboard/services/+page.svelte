<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Plug, Plus, X, Loader2, Pencil, Trash2, Power, PowerOff } from '@lucide/svelte';
	import { confirmPopup } from '$lib/confirm-popup';

	interface Service {
		id: string;
		landlordId: string;
		name: string;
		type: string; // METERED | MANUAL_AMOUNT | FLAT_ROOM | FLAT_PERSON | FLAT_VEHICLE
		defaultRate: number;
		isActive: boolean;
	}

	const TYPE_LABELS: Record<string, string> = {
		METERED: 'Tự nhập chỉ số',
		MANUAL_AMOUNT: 'Tự nhập số tiền',
		FLAT_ROOM: 'Khoán theo phòng',
		FLAT_PERSON: 'Khoán theo người',
		FLAT_VEHICLE: 'Khoán theo xe'
	};
	const FLAT_TYPE_OPTIONS = ['FLAT_ROOM', 'FLAT_PERSON', 'FLAT_VEHICLE'];
	const MANUAL_TYPE_OPTIONS = ['METERED', 'MANUAL_AMOUNT'];

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let services = $state<Service[]>([]);

	let isDialogOpen = $state(false);
	let isSubmitting = $state(false);
	let editingId = $state<string | null>(null);

	let name = $state('');
	let type = $state('METERED');
	let defaultRate = $state('');

	const activeCount = $derived(services.filter((s) => s.isActive).length);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchServices(session.landlordProfileId);
	});

	async function fetchServices(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/services?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) services = data;
			else toast.error(data.error || 'Lỗi khi tải danh sách dịch vụ');
		} catch (e: any) {
			toast.error('Lỗi khi tải danh sách dịch vụ: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	function openAdd() {
		editingId = null;
		name = '';
		type = 'METERED';
		defaultRate = '';
		isDialogOpen = true;
	}

	function getTypeMode(serviceType: string) {
		return serviceType.startsWith('FLAT_') ? 'FLAT' : 'MANUAL';
	}

	function setTypeMode(mode: string) {
		type = mode === 'FLAT' ? 'FLAT_ROOM' : 'METERED';
	}

	function openEdit(svc: Service) {
		editingId = svc.id;
		name = svc.name;
		type = svc.type;
		defaultRate = String(svc.defaultRate);
		isDialogOpen = true;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (isSubmitting) return;

		if (!name || defaultRate === '') {
			toast.error(
				type === 'MANUAL_AMOUNT'
					? 'Vui lòng nhập tên dịch vụ và số tiền gợi ý'
					: 'Vui lòng nhập tên dịch vụ và đơn giá'
			);
			return;
		}

		isSubmitting = true;
		try {
			const isEdit = editingId !== null;
			const res = await fetch('/api/services', {
				method: isEdit ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					isEdit
						? { id: editingId, name, defaultRate: Number(defaultRate) }
						: { name, type, defaultRate: Number(defaultRate) }
				)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi lưu dịch vụ');

			toast.success(isEdit ? 'Đã cập nhật dịch vụ' : `Đã thêm dịch vụ "${name}" cho mọi phòng`);
			isDialogOpen = false;
			if (landlordId) fetchServices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	async function toggleActive(svc: Service) {
		try {
			const res = await fetch('/api/services', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: svc.id, isActive: !svc.isActive })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật trạng thái');
			toast.success(svc.isActive ? 'Đã tạm ngưng dịch vụ' : 'Đã bật lại dịch vụ');
			if (landlordId) fetchServices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function handleDelete(svc: Service) {
		if (
			!(await confirmPopup({
				title: 'Xóa dịch vụ',
				message: `Xóa dịch vụ "${svc.name}"? Dịch vụ sẽ bị gỡ khỏi các phòng.`,
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;
		try {
			const res = await fetch(`/api/services?id=${svc.id}`, { method: 'DELETE' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa dịch vụ');
			toast.success('Đã xóa dịch vụ');
			if (landlordId) fetchServices(landlordId);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl font-black text-black sm:text-2xl">Quản Lý Dịch Vụ</h1>
			<p class="mt-1 text-xs font-bold text-zinc-600 sm:text-sm">
				Đơn giá điện, nước, wifi, rác, gửi xe... áp dụng khi lập hóa đơn cho phòng
			</p>
		</div>
		<button
			onclick={() => window.setTimeout(openAdd, 200)}
			class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2.5 text-sm font-black text-black shadow-secondary transition-all sm:w-auto sm:justify-start"
		>
			Thêm dịch vụ <Plus class="h-4 w-4" />
		</button>
	</div>

	<!-- Quick stats -->
	<div class="grid grid-cols-2 gap-3">
		<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
			<Plug class="mb-2 h-5 w-5 text-blue-500" />
			<p class="text-[10px] font-bold text-zinc-500">Tổng dịch vụ</p>
			<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">{services.length}</h3>
		</div>
		<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
			<Power class="mb-2 h-5 w-5 text-green-600" />
			<p class="text-[10px] font-bold text-zinc-500">Đang áp dụng</p>
			<h3 class="mt-0.5 text-base font-black text-black sm:text-xl">{activeCount}</h3>
		</div>
	</div>

	{#if isLoading}
		<div class="flex h-[40vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if services.length === 0}
		<div
			class="mx-auto max-w-md rounded-lg border-2 border-black bg-white p-12 text-center shadow-secondary"
		>
			<Plug class="mx-auto h-7 w-7" />
			<h3 class="mt-2 text-lg font-black text-black">Chưa có dịch vụ nào</h3>
			<p class="mt-2 text-sm font-semibold text-zinc-600">
				Thêm dịch vụ để tính vào hóa đơn hàng tháng của khách.
			</p>
		</div>
	{:else}
		<!-- Service list -->
		<div class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
			<!-- Mobile card list -->
			<div class="divide-y-2 divide-black bg-white sm:hidden">
				{#each services as svc}
					<div class="space-y-2 p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm font-black text-black">{svc.name}</p>
								<p class="mt-0.5 text-xs font-bold text-zinc-500">
									{TYPE_LABELS[svc.type] ?? svc.type}
								</p>
							</div>
							<span class="shrink-0 text-sm font-black text-blue-600"
								>{formatCurrency(svc.defaultRate)}</span
							>
						</div>
						<div class="flex items-center justify-between">
							{#if svc.isActive}
								<span
									class="rounded-full border border-black bg-green-200 px-2 py-0.5 text-[10px] font-black text-green-800"
									>Áp dụng</span
								>
							{:else}
								<span
									class="rounded-full border border-black bg-zinc-200 px-2 py-0.5 text-[10px] font-black text-zinc-600"
									>Tạm ngưng</span
								>
							{/if}
							<div class="flex gap-2">
								<button
									onclick={() => toggleActive(svc)}
									class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold text-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
									>{svc.isActive ? 'Ngưng' : 'Bật'}</button
								>
								<button
									onclick={() => window.setTimeout(() => openEdit(svc), 200)}
									class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold text-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
									>Sửa</button
								>
								<button
									onclick={() => handleDelete(svc)}
									class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 px-2.5 py-1.5 text-xs font-bold text-red-800 shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
									>Xóa</button
								>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<!-- Desktop table -->
			<div class="hidden overflow-x-auto bg-white sm:block">
				<table class="w-full border-collapse text-left text-sm">
					<thead>
						<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
							<th class="px-4 py-3">Tên dịch vụ</th>
							<th class="px-4 py-3">Cách tính</th>
							<th class="px-4 py-3">Đơn giá</th>
							<th class="px-4 py-3">Trạng thái</th>
							<th class="px-4 py-3 text-right">Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{#each services as svc}
							<tr
								class="border-b border-black/15 font-semibold text-black transition-all hover:bg-slate-50"
							>
								<td class="px-4 py-4 font-black">{svc.name}</td>
								<td class="px-4 py-4">{TYPE_LABELS[svc.type] ?? svc.type}</td>
								<td class="px-4 py-4 font-black text-blue-600">{formatCurrency(svc.defaultRate)}</td
								>
								<td class="px-4 py-4">
									{#if svc.isActive}
										<span
											class="rounded-full border border-black bg-green-200 px-2.5 py-0.5 text-[10px] font-black text-green-800"
											>Áp dụng</span
										>
									{:else}
										<span
											class="rounded-full border border-black bg-zinc-200 px-2.5 py-0.5 text-[10px] font-black text-zinc-600"
											>Tạm ngưng</span
										>
									{/if}
								</td>
								<td class="px-4 py-4">
									<div class="flex items-center justify-end gap-2">
										<button
											onclick={() => toggleActive(svc)}
											title={svc.isActive ? 'Tạm ngưng' : 'Bật lại'}
											class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
										>
											{#if svc.isActive}
												<PowerOff class="h-4 w-4" />
											{:else}
												<Power class="h-4 w-4" />
											{/if}
										</button>
										<button
											onclick={() => window.setTimeout(() => openEdit(svc), 200)}
											title="Sửa"
											class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all active:translate-x-[1px] active:translate-y-[1px]"
										>
											<Pencil class="h-4 w-4" />
										</button>
										<button
											onclick={() => handleDelete(svc)}
											title="Xóa"
											class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 p-2 text-red-800 shadow-secondary transition-all hover:bg-red-300 active:translate-x-[1px] active:translate-y-[1px]"
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

	<!-- Add / Edit Dialog -->
	{#if isDialogOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
			onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
			onkeydown={(e) => e.key === 'Escape' && (isDialogOpen = false)}
			role="button"
			tabindex="0"
		>
			<div
				class="relative flex max-h-[90vh] w-full max-w-md animate-[scale-up_0.2s_ease-out] flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-primary"
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
					<span class="ml-2 text-xs font-black font-bold text-zinc-500">
						{editingId ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}
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
						<label for="sv-name" class="block text-[10px] font-bold text-zinc-600"
							>Tên dịch vụ</label
						>
						<input
							id="sv-name"
							type="text"
							bind:value={name}
							required
							placeholder="Ví dụ: Điện, Nước, Wifi, Gửi xe..."
							class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="space-y-1">
						<label for="sv-mode" class="block text-[10px] font-bold text-zinc-600"
							>Cách tính tiền</label
						>
						{#if editingId}
							<input
								id="sv-mode"
								type="text"
								value={TYPE_LABELS[type] ?? type}
								disabled
								class="w-full cursor-not-allowed rounded-lg border-2 border-black bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-500"
							/>
							<p class="text-[10px] font-semibold text-zinc-400">
								Không đổi được cách tính sau khi tạo.
							</p>
						{:else}
							<select
								id="sv-mode"
								value={getTypeMode(type)}
								onchange={(e) => setTypeMode((e.target as HTMLSelectElement).value)}
								class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							>
								<option value="MANUAL">Tự nhập mỗi tháng</option>
								<option value="FLAT">Khoán cố định</option>
							</select>
						{/if}
					</div>

					{#if !editingId}
						<div class="space-y-1">
							<label for="sv-type" class="block text-[10px] font-bold text-zinc-600">
								{getTypeMode(type) === 'FLAT' ? 'Khoán theo' : 'Kiểu tự nhập'}
							</label>
							<select
								id="sv-type"
								bind:value={type}
								class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							>
								{#each getTypeMode(type) === 'FLAT' ? FLAT_TYPE_OPTIONS : MANUAL_TYPE_OPTIONS as opt}
									<option value={opt}>{TYPE_LABELS[opt]}</option>
								{/each}
							</select>
						</div>
					{/if}

					<div class="space-y-1">
						<label for="sv-rate" class="block text-[10px] font-bold text-zinc-600"
							>{type === 'MANUAL_AMOUNT' ? 'Số tiền gợi ý (đ)' : 'Đơn giá (đ)'}</label
						>
						<input
							id="sv-rate"
							type="number"
							bind:value={defaultRate}
							required
							min="0"
							placeholder={type === 'MANUAL_AMOUNT' ? 'Ví dụ: 50000' : 'Ví dụ: 3500'}
							class="w-full rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div class="flex justify-end gap-3 border-t-2 border-black pt-3">
						<button
							type="button"
							onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
							class="hover:bg-zinc-150 cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-all"
						>
							Hủy
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							{editingId ? 'Lưu thay đổi' : 'Thêm dịch vụ'}
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
