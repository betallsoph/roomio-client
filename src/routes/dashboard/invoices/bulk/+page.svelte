<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		Receipt,
		Loader2,
		ArrowLeft,
		Zap,
		Droplet,
		AlertCircle,
		AlertTriangle,
		CheckCircle2,
		Plus,
		X,
		Sparkles
	} from '@lucide/svelte';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	interface Service {
		id: string;
		name: string;
		type: string;
		defaultRate: number;
		isActive?: boolean;
	}

	interface ServiceConfig {
		serviceId: string;
		service: Service;
		customRate: number | null;
		quantity: number;
	}

	interface Room {
		id: string;
		roomNumber: string;
		monthlyRent: number;
		tenant: { id: string; user: { name: string } } | null;
		services: ServiceConfig[];
	}

	interface Property {
		id: string;
		name: string;
	}

	type Readiness = { state: 'ready' | 'needs_review' | 'invoiced'; reasons: string[] };
	type ReadingEntry = {
		prevValue: string;
		currValue: string;
		status: string | null;
		isAnomalous: boolean;
	};
	type Adjustment = { name: string; amount: string };

	let landlordId = $state<string | null>(null);
	let isLoadingProperties = $state(true);
	let isLoadingRooms = $state(false);
	let isSubmitting = $state(false);

	let properties = $state<Property[]>([]);
	let rooms = $state<Room[]>([]);
	let meteredServices = $state<Service[]>([]);
	let manualAmountServices = $state<Service[]>([]);

	let selectedPropertyId = $state('');
	let month = $state(new Date().toISOString().slice(0, 7)); // YYYY-MM
	let dueDate = $state('');

	let readingsMap = $state<Record<string, Record<string, ReadingEntry>>>({});
	let manualAmountsMap = $state<Record<string, Record<string, string>>>({});
	let readiness = $state<Record<string, Readiness>>({});
	let adjustmentsMap = $state<Record<string, Adjustment[]>>({});
	let prorateMap = $state<Record<string, string>>({}); // '' = 100%, '50' = nửa tháng
	let expanded = $state<Record<string, boolean>>({});

	const readyRooms = $derived(rooms.filter((r) => readiness[r.id]?.state === 'ready'));
	const reviewRooms = $derived(
		rooms.filter((r) => (readiness[r.id]?.state ?? 'needs_review') === 'needs_review')
	);
	const invoicedRooms = $derived(rooms.filter((r) => readiness[r.id]?.state === 'invoiced'));

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;

		const nextMonth = new Date();
		nextMonth.setMonth(nextMonth.getMonth() + 1);
		nextMonth.setDate(5);
		dueDate = nextMonth.toISOString().split('T')[0];

		loadProperties(session.landlordProfileId);
	});

	async function loadProperties(profileId: string) {
		isLoadingProperties = true;
		try {
			const res = await fetch(`/api/properties?landlordId=${profileId}`);
			const data = await res.json();
			if (res.ok) {
				properties = data;
				if (properties.length > 0) selectedPropertyId = properties[0].id;
			}
		} catch (e: any) {
			toast.error('Lỗi tải danh sách tòa nhà: ' + e.message);
		} finally {
			isLoadingProperties = false;
		}
	}

	// Nguồn dữ liệu duy nhất = /api/invoices/bulk (trả phòng + chỉ số đã duyệt + phân loại sẵn sàng)
	async function fetchRoomsAndServices(propertyId: string, forMonth: string) {
		if (!propertyId || !forMonth) return;
		isLoadingRooms = true;
		try {
			const res = await fetch(`/api/invoices/bulk?propertyId=${propertyId}&month=${forMonth}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tải dữ liệu phòng');

			const occ: Room[] = (data.rooms || []).filter((r: any) => r.tenant);
			rooms = occ;
			readiness = data.readiness || {};

			const mServices: Record<string, Service> = {};
			const manualServices: Record<string, Service> = {};
			occ.forEach((r) => {
				r.services.forEach((c) => {
					if (c.service.type === 'METERED' && c.service.isActive)
						mServices[c.serviceId] = c.service;
					if (c.service.type === 'MANUAL_AMOUNT' && c.service.isActive)
						manualServices[c.serviceId] = c.service;
				});
			});
			meteredServices = Object.values(mServices);
			manualAmountServices = Object.values(manualServices);

			const newReadings: typeof readingsMap = {};
			const newManual: typeof manualAmountsMap = {};
			const newAdj: typeof adjustmentsMap = {};
			const newPro: typeof prorateMap = {};

			occ.forEach((r) => {
				newReadings[r.id] = {};
				newManual[r.id] = {};
				newAdj[r.id] = [];
				newPro[r.id] = '';

				meteredServices.forEach((s) => {
					const hasService = r.services.some((c) => c.serviceId === s.id && c.service.isActive);
					if (!hasService) return;
					const monthReading = data.readings?.[r.id]?.[s.id];
					const prevVal = data.prevValues?.[r.id]?.[s.id] ?? monthReading?.prevValue ?? 0;
					const approvedCurr = monthReading?.status === 'approved' ? monthReading.currValue : null;
					newReadings[r.id][s.id] = {
						prevValue: String(prevVal),
						currValue: approvedCurr != null ? String(approvedCurr) : '',
						status: monthReading?.status ?? null,
						isAnomalous: !!monthReading?.isAnomalous
					};
				});

				manualAmountServices.forEach((s) => {
					const hasService = r.services.some((c) => c.serviceId === s.id && c.service.isActive);
					if (!hasService) return;
					const config = r.services.find((c) => c.serviceId === s.id);
					const def = config?.customRate ?? s.defaultRate ?? 0;
					newManual[r.id][s.id] = def > 0 ? String(def) : '';
				});
			});

			readingsMap = newReadings;
			manualAmountsMap = newManual;
			adjustmentsMap = newAdj;
			prorateMap = newPro;
			expanded = {};
		} catch (e: any) {
			toast.error('Lỗi khi tải dữ liệu phòng: ' + e.message);
		} finally {
			isLoadingRooms = false;
		}
	}

	$effect(() => {
		if (selectedPropertyId && month) fetchRoomsAndServices(selectedPropertyId, month);
	});

	function roomHasService(room: Room, serviceId: string) {
		return room.services.some((c) => c.serviceId === serviceId && c.service.isActive);
	}

	function prorateFactor(roomId: string) {
		const v = Number(prorateMap[roomId]);
		return Number.isFinite(v) && v > 0 && v < 100 ? v / 100 : 1;
	}

	// Tạm tính phía client (chỉ để xem trước; server vẫn là nguồn chuẩn khi lập hóa đơn)
	function previewTotal(room: Room) {
		let total = Math.round(room.monthlyRent * prorateFactor(room.id));
		for (const config of room.services) {
			if (!config.service.isActive) continue;
			const rate = config.customRate ?? config.service.defaultRate;
			const t = config.service.type;
			if (t === 'METERED') {
				const rd = readingsMap[room.id]?.[config.serviceId];
				const prev = Number(rd?.prevValue) || 0;
				const curr = Number(rd?.currValue);
				if (rd && rd.currValue !== '' && Number.isFinite(curr) && curr >= prev)
					total += (curr - prev) * rate;
			} else if (t.startsWith('FLAT')) {
				total += rate * (config.quantity || 0);
			} else if (t === 'MANUAL_AMOUNT') {
				total += Number(manualAmountsMap[room.id]?.[config.serviceId]) || 0;
			}
		}
		for (const adj of adjustmentsMap[room.id] || []) {
			const amt = Number(adj.amount);
			if (Number.isFinite(amt)) total += amt;
		}
		return total;
	}

	function buildRoomPayload(room: Room):
		| {
				ok: true;
				readings: Record<string, { prevValue: number; currValue: number }>;
				manual: Record<string, number>;
				adjustments: { name: string; amount: number }[];
				prorate: number | null;
		  }
		| { ok: false; reason: string } {
		const rd: Record<string, { prevValue: number; currValue: number }> = {};
		const man: Record<string, number> = {};

		for (const s of meteredServices) {
			if (!roomHasService(room, s.id)) continue;
			const entry = readingsMap[room.id]?.[s.id];
			if (!entry || entry.currValue === '') return { ok: false, reason: `thiếu chỉ số ${s.name}` };
			const prev = Number(entry.prevValue) || 0;
			const curr = Number(entry.currValue) || 0;
			if (curr < prev) return { ok: false, reason: `số mới < số cũ (${s.name})` };
			rd[s.id] = { prevValue: prev, currValue: curr };
		}
		for (const s of manualAmountServices) {
			if (!roomHasService(room, s.id)) continue;
			const val = manualAmountsMap[room.id]?.[s.id] ?? '';
			if (val === '') return { ok: false, reason: `thiếu ${s.name}` };
			const amt = Number(val);
			if (!Number.isFinite(amt) || amt < 0) return { ok: false, reason: `${s.name} không hợp lệ` };
			man[s.id] = amt;
		}
		const adjustments = (adjustmentsMap[room.id] || [])
			.map((a) => ({ name: (a.name || '').trim(), amount: Number(a.amount) }))
			.filter((a) => a.name && Number.isFinite(a.amount) && a.amount !== 0);
		const factor = prorateFactor(room.id);
		return {
			ok: true,
			readings: rd,
			manual: man,
			adjustments,
			prorate: factor < 1 ? factor : null
		};
	}

	async function submitRooms(targetRooms: Room[]) {
		if (!landlordId || !selectedPropertyId || isSubmitting) return;
		if (targetRooms.length === 0) return;

		const roomIds: string[] = [];
		const readings: Record<string, unknown> = {};
		const manualAmounts: Record<string, unknown> = {};
		const adjustments: Record<string, unknown> = {};
		const prorate: Record<string, number> = {};
		let skipped = 0;

		for (const room of targetRooms) {
			const p = buildRoomPayload(room);
			if (!p.ok) {
				skipped++;
				continue;
			}
			roomIds.push(room.id);
			readings[room.id] = p.readings;
			manualAmounts[room.id] = p.manual;
			if (p.adjustments.length) adjustments[room.id] = p.adjustments;
			if (p.prorate) prorate[room.id] = p.prorate;
		}

		if (roomIds.length === 0) {
			toast.error(
				'Không có phòng nào đủ dữ liệu để xuất hóa đơn. Hãy điền chỉ số / khoản còn thiếu.'
			);
			return;
		}

		isSubmitting = true;
		try {
			const res = await fetch('/api/invoices/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					landlordId,
					propertyId: selectedPropertyId,
					month,
					dueDate,
					roomIds,
					readings,
					manualAmounts,
					adjustments,
					prorate
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi tạo hóa đơn hàng loạt');

			toast.success(
				`Đã tạo ${data.count} hóa đơn tháng ${month}` +
					(skipped ? ` (bỏ qua ${skipped} phòng thiếu dữ liệu)` : '') +
					'!'
			);
			await fetchRoomsAndServices(selectedPropertyId, month); // phòng vừa lập chuyển sang 'đã có HĐ'
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	function addAdjustment(roomId: string) {
		adjustmentsMap[roomId] = [...(adjustmentsMap[roomId] || []), { name: '', amount: '' }];
	}
	function removeAdjustment(roomId: string, index: number) {
		adjustmentsMap[roomId] = (adjustmentsMap[roomId] || []).filter((_, i) => i !== index);
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a
			href="/dashboard/invoices"
			class="shrink-0 cursor-pointer rounded-[6px] border-2 border-black bg-white p-2 text-black shadow-secondary transition-all hover:bg-zinc-100"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<div>
			<h1 class="text-2xl font-black text-black">Tạo Hóa Đơn Hàng Loạt</h1>
			<p class="mt-0.5 text-sm font-bold text-zinc-600">
				Hệ thống soạn sẵn hóa đơn cho phòng đã đủ chỉ số — bạn duyệt nhanh, chỉ xử lý tay phòng cần
				xem.
			</p>
		</div>
	</div>

	{#if isLoadingProperties}
		<div class="flex h-[40vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else if properties.length === 0}
		<div
			class="mx-auto max-w-md rounded-lg border-2 border-black bg-white p-8 text-center shadow-secondary"
		>
			<AlertCircle class="h-8 w-8" />
			<p class="font-black text-black">Chưa có tòa nhà</p>
			<p class="mt-1 text-sm font-semibold text-zinc-600">
				Vui lòng tạo tòa nhà trước khi tính hóa đơn.
			</p>
		</div>
	{:else}
		<!-- Bộ chọn -->
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="space-y-1">
				<label for="b-prop" class="block text-xs font-bold text-zinc-600">Chọn tòa nhà</label>
				<RoomioSelect
					id="b-prop"
					bind:value={selectedPropertyId}
					required
					options={properties.map((property) => ({ value: property.id, label: property.name }))}
				/>
			</div>
			<div class="space-y-1">
				<label for="b-month" class="block text-xs font-bold text-zinc-600">Tháng tính hóa đơn</label
				>
				<input
					id="b-month"
					type="month"
					bind:value={month}
					required
					class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
				/>
			</div>
			<div class="space-y-1">
				<label for="b-due" class="block text-xs font-bold text-zinc-600">Hạn nộp tiền</label>
				<input
					id="b-due"
					type="date"
					bind:value={dueDate}
					required
					class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
				/>
			</div>
		</div>

		{#if isLoadingRooms}
			<div
				class="flex w-full items-center justify-center rounded-lg border-2 border-black bg-white p-12 shadow-secondary"
			>
				<Loader2 class="h-8 w-8 animate-spin text-black" />
			</div>
		{:else if rooms.length === 0}
			<div class="rounded-lg border-2 border-black bg-white p-12 text-center shadow-secondary">
				<p class="text-sm font-semibold text-zinc-600">
					Không tìm thấy phòng có khách đang ở trong tòa nhà này.
				</p>
			</div>
		{:else}
			<!-- Tóm tắt -->
			<div class="grid gap-3 sm:grid-cols-3">
				<div
					class="flex items-center gap-3 rounded-lg border-2 border-black bg-green-100 p-3 shadow-secondary"
				>
					<CheckCircle2 class="h-6 w-6 shrink-0 text-green-700" />
					<div>
						<div class="text-xl font-black text-black">{readyRooms.length}</div>
						<div class="text-xs font-bold text-zinc-600">Sẵn sàng</div>
					</div>
				</div>
				<div
					class="flex items-center gap-3 rounded-lg border-2 border-black bg-amber-100 p-3 shadow-secondary"
				>
					<AlertTriangle class="text-amber-650 h-6 w-6 shrink-0" />
					<div>
						<div class="text-xl font-black text-black">{reviewRooms.length}</div>
						<div class="text-xs font-bold text-zinc-600">Cần xem</div>
					</div>
				</div>
				<div
					class="flex items-center gap-3 rounded-lg border-2 border-black bg-zinc-100 p-3 shadow-secondary"
				>
					<Receipt class="h-6 w-6 shrink-0 text-zinc-500" />
					<div>
						<div class="text-xl font-black text-black">{invoicedRooms.length}</div>
						<div class="text-xs font-bold text-zinc-600">Đã có hóa đơn</div>
					</div>
				</div>
			</div>

			<!-- SẴN SÀNG: duyệt nhanh -->
			{#if readyRooms.length > 0}
				<div
					class="flex flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
				>
					<div
						class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-green-200 p-4"
					>
						<h2 class="flex items-center gap-2 text-base font-black text-black">
							<Sparkles class="h-5 w-5" /> Sẵn sàng ({readyRooms.length}) — đủ chỉ số đã duyệt
						</h2>
						<button
							type="button"
							disabled={isSubmitting}
							onclick={() => submitRooms(readyRooms)}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-green-300 px-4 py-2 text-sm font-black text-black shadow-primary transition-all hover:bg-green-400 disabled:opacity-50"
						>
							{#if isSubmitting}
								<Loader2 class="h-4.5 w-4.5 animate-spin" />
							{:else}
								<CheckCircle2 class="h-4.5 w-4.5" />
							{/if}
							Duyệt nhanh & xuất {readyRooms.length} hóa đơn
						</button>
					</div>
					<div class="overflow-x-auto bg-white">
						<table class="w-full border-collapse text-left text-sm">
							<thead>
								<tr class="border-b-2 border-black bg-zinc-50 text-xs font-black text-black">
									<th class="px-4 py-2.5">Số phòng</th>
									<th class="px-4 py-2.5">Khách thuê</th>
									<th class="px-4 py-2.5 text-right">Tạm tính</th>
								</tr>
							</thead>
							<tbody>
								{#each readyRooms as room (room.id)}
									<tr class="border-b border-black/10 font-semibold text-black">
										<td class="px-4 py-3 font-black">Phòng {room.roomNumber}</td>
										<td class="px-4 py-3">{room.tenant?.user.name || '--'}</td>
										<td class="px-4 py-3 text-right font-black"
											>{formatCurrency(previewTotal(room))}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- CẦN XEM: nhập tay -->
			{#if reviewRooms.length > 0}
				<div
					class="flex flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
				>
					<div
						class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-amber-200 p-4"
					>
						<h2 class="flex items-center gap-2 text-base font-black text-black">
							<AlertTriangle class="h-5 w-5" /> Cần xem ({reviewRooms.length})
						</h2>
						<button
							type="button"
							disabled={isSubmitting}
							onclick={() => submitRooms(reviewRooms)}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-black text-black shadow-primary transition-all hover:bg-blue-400 disabled:opacity-50"
						>
							{#if isSubmitting}
								<Loader2 class="h-4.5 w-4.5 animate-spin" />
							{:else}
								<Receipt class="h-4.5 w-4.5" />
							{/if}
							Xuất các phòng đã điền đủ
						</button>
					</div>
					<div class="overflow-x-auto bg-white">
						<table class="w-full border-collapse text-left text-sm">
							<thead>
								<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
									<th class="px-4 py-3">Số phòng</th>
									<th class="px-4 py-3">Khách / Lý do</th>
									<th class="px-4 py-3">Giá phòng</th>
									{#each meteredServices as service}
										<th class="border-l-2 border-black px-4 py-3 text-center">
											<div class="flex items-center justify-center gap-1">
												{#if service.name.includes('Điện')}
													<Zap class="text-amber-650 h-4 w-4" />
												{:else}
													<Droplet class="h-4 w-4 text-blue-600" />
												{/if}
												{service.name} (Cũ → Mới)
											</div>
										</th>
									{/each}
									{#each manualAmountServices as service}
										<th class="border-l-2 border-black bg-blue-100 px-4 py-3 text-center">
											{service.name}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each reviewRooms as room (room.id)}
									<tr class="border-b border-black/15 font-semibold text-black">
										<td class="px-4 py-4 align-top font-black">Phòng {room.roomNumber}</td>
										<td class="px-4 py-4 align-top">
											<div>{room.tenant?.user.name || '--'}</div>
											{#if readiness[room.id]?.reasons?.length}
												<div class="mt-1 space-y-0.5">
													{#each readiness[room.id].reasons as reason}
														<div
															class="flex items-start gap-1 text-[11px] font-bold text-amber-700"
														>
															<AlertTriangle class="mt-0.5 h-3 w-3 shrink-0" />
															{reason}
														</div>
													{/each}
												</div>
											{/if}
											<button
												type="button"
												onclick={() => (expanded[room.id] = !expanded[room.id])}
												class="mt-2 cursor-pointer text-[11px] font-black text-blue-600 underline"
											>
												{expanded[room.id] ? 'Ẩn' : 'Phụ thu / giảm / tính theo ngày'}
											</button>
											{#if expanded[room.id]}
												<div
													class="mt-2 space-y-2 rounded-lg border-2 border-black/20 bg-zinc-50 p-2"
												>
													<div class="flex items-center gap-2">
														<span class="text-[11px] font-bold text-zinc-600">Tính</span>
														<input
															type="number"
															min="1"
															max="99"
															bind:value={prorateMap[room.id]}
															placeholder="100"
															class="w-16 rounded border-2 border-black bg-white px-2 py-1 text-center text-xs font-bold"
														/>
														<span class="text-[11px] font-bold text-zinc-600"
															>% tháng (vào/ra giữa tháng)</span
														>
													</div>
													{#each adjustmentsMap[room.id] || [] as adj, i}
														<div class="flex items-center gap-1.5">
															<input
																type="text"
																bind:value={adj.name}
																placeholder="Nội dung (vd: Phạt, Sửa chữa, Giảm giá)"
																class="w-40 rounded border-2 border-black bg-white px-2 py-1 text-xs font-semibold"
															/>
															<input
																type="number"
																bind:value={adj.amount}
																placeholder="± tiền"
																class="w-24 rounded border-2 border-black bg-white px-2 py-1 text-right text-xs font-bold"
															/>
															<button
																type="button"
																onclick={() => removeAdjustment(room.id, i)}
																class="cursor-pointer rounded border-2 border-black bg-white p-1 hover:bg-red-100"
															>
																<X class="h-3 w-3" />
															</button>
														</div>
													{/each}
													<button
														type="button"
														onclick={() => addAdjustment(room.id)}
														class="flex cursor-pointer items-center gap-1 text-[11px] font-black text-blue-600"
													>
														<Plus class="h-3 w-3" /> Thêm phụ thu / giảm (số âm = giảm)
													</button>
												</div>
											{/if}
										</td>
										<td class="px-4 py-4 align-top font-black"
											>{formatCurrency(room.monthlyRent)}</td
										>

										{#each meteredServices as service}
											<td
												class="border-l-2 border-black bg-zinc-50/50 px-4 py-4 text-center align-top"
											>
												{#if roomHasService(room, service.id)}
													{@const rd = readingsMap[room.id]?.[service.id]}
													<div class="flex items-center justify-center gap-2">
														<input
															type="number"
															bind:value={readingsMap[room.id][service.id].prevValue}
															placeholder="Số cũ"
															class="w-20 rounded-lg border-2 border-black bg-white px-2 py-1 text-center text-xs font-bold focus:ring-2 focus:ring-blue-300 focus:outline-none"
														/>
														<span class="font-black text-zinc-500">→</span>
														<input
															type="number"
															bind:value={readingsMap[room.id][service.id].currValue}
															placeholder="Số mới"
															class="w-24 rounded-lg border-2 border-black bg-white px-2 py-1 text-center text-xs font-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
														/>
													</div>
													{#if rd?.isAnomalous}
														<span class="mt-1 block text-[10px] font-black text-amber-700"
															>⚠ Bất thường</span
														>
													{:else if rd && rd.currValue !== '' && Number(rd.currValue) >= Number(rd.prevValue)}
														<span class="mt-1 block text-[10px] font-black text-blue-600">
															Tiêu thụ: {Number(rd.currValue) - Number(rd.prevValue)}
														</span>
													{/if}
												{:else}
													<span class="text-[11px] font-bold text-zinc-400">—</span>
												{/if}
											</td>
										{/each}

										{#each manualAmountServices as service}
											<td
												class="border-l-2 border-black bg-zinc-50/50 px-4 py-4 text-center align-top"
											>
												{#if roomHasService(room, service.id)}
													<input
														type="number"
														bind:value={manualAmountsMap[room.id][service.id]}
														min="0"
														placeholder="Số tiền"
														class="w-28 rounded-lg border-2 border-black bg-white px-2 py-1 text-center text-xs font-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
													/>
												{:else}
													<span class="text-[11px] font-bold text-zinc-400">—</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div
						class="flex items-center gap-2 border-t-2 border-black bg-zinc-50 p-4 text-xs font-bold text-zinc-600"
					>
						<AlertCircle class="h-4.5 w-4.5 shrink-0 text-blue-600" />
						<span
							>Chỉ những phòng đã điền đủ chỉ số & khoản tự nhập mới được xuất; phòng còn thiếu sẽ
							được bỏ qua để bạn xử lý sau.</span
						>
					</div>
				</div>
			{/if}

			<!-- ĐÃ CÓ HÓA ĐƠN -->
			{#if invoicedRooms.length > 0}
				<div class="rounded-lg border-2 border-black bg-white p-4 shadow-secondary">
					<h2 class="mb-2 flex items-center gap-2 text-sm font-black text-zinc-600">
						<Receipt class="h-4 w-4" /> Đã có hóa đơn tháng này ({invoicedRooms.length})
					</h2>
					<div class="flex flex-wrap gap-2">
						{#each invoicedRooms as room (room.id)}
							<span
								class="rounded-[6px] border-2 border-black/30 bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-500"
							>
								Phòng {room.roomNumber}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
