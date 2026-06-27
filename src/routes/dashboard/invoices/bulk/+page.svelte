<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		Receipt,
		Loader2,
		ArrowLeft,
		Zap,
		Droplet,
		AlertCircle,
		CheckCircle2
	} from '@lucide/svelte';

	interface Service {
		id: string;
		name: string;
		type: string;
		defaultRate: number;
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
		tenant: {
			id: string;
			user: {
				name: string;
			};
		} | null;
		services: ServiceConfig[];
		meterReadings: {
			serviceId: string;
			month: string;
			currValue: number;
		}[];
	}

	interface Property {
		id: string;
		name: string;
	}

	let landlordId = $state<string | null>(null);
	let isLoadingProperties = $state(true);
	let isLoadingRooms = $state(false);
	let isSubmitting = $state(false);

	let properties = $state<Property[]>([]);
	let rooms = $state<Room[]>([]);
	let meteredServices = $state<Service[]>([]);

	// Form selections
	let selectedPropertyId = $state('');
	let month = $state(new Date().toISOString().slice(0, 7)); // YYYY-MM
	let dueDate = $state('');

	// Meter readings state inputs
	let readingsMap = $state<
		Record<string, Record<string, { prevValue: string; currValue: string }>>
	>({});

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;

		// Default due date: 5th of next month
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
				if (properties.length > 0) {
					selectedPropertyId = properties[0].id;
				}
			}
		} catch (e: any) {
			toast.error('Lỗi tải danh sách tòa nhà: ' + e.message);
		} finally {
			isLoadingProperties = false;
		}
	}

	async function fetchRoomsAndServices(propertyId: string) {
		if (!propertyId) return;
		isLoadingRooms = true;
		try {
			// 1. Fetch rooms
			const res = await fetch(`/api/rooms?propertyId=${propertyId}`);
			const roomsData = await res.json();

			// Filter only occupied rooms (rooms with tenant)
			const occupiedRooms = roomsData.filter((r: any) => r.tenantId !== null);
			rooms = occupiedRooms;

			// 2. Extract metered services active in these rooms
			const mServices: Record<string, Service> = {};
			occupiedRooms.forEach((r: any) => {
				r.services.forEach((c: any) => {
					if (c.service.type === 'METERED' && c.service.isActive) {
						mServices[c.serviceId] = c.service;
					}
				});
			});
			meteredServices = Object.values(mServices);

			// 3. Initialize readingsMap with previous values
			const newReadings: typeof readingsMap = {};

			occupiedRooms.forEach((r: any) => {
				newReadings[r.id] = {};

				meteredServices.forEach((s) => {
					// Find the last recorded reading for this service in this room
					const lastReading = r.meterReadings.find((mr: any) => mr.serviceId === s.id);

					newReadings[r.id][s.id] = {
						prevValue: lastReading ? lastReading.currValue.toString() : '0',
						currValue: ''
					};
				});
			});

			// 4. Overlay readings already submitted by tenants and approved (chốt số)
			try {
				const prefillRes = await fetch(
					`/api/invoices/bulk?propertyId=${propertyId}&month=${month}`
				);
				const prefill = await prefillRes.json();
				if (prefillRes.ok) {
					for (const [roomId, services] of Object.entries(prefill.readings || {})) {
						for (const [serviceId, reading] of Object.entries(services as Record<string, any>)) {
							if (reading.status === 'approved' && newReadings[roomId]?.[serviceId]) {
								newReadings[roomId][serviceId] = {
									prevValue: reading.prevValue.toString(),
									currValue: reading.currValue.toString()
								};
							}
						}
					}
				}
			} catch {
				// Không tải được dữ liệu chốt số thì vẫn cho nhập tay như cũ
			}

			readingsMap = newReadings;
		} catch (e: any) {
			toast.error('Lỗi khi tải dữ liệu phòng: ' + e.message);
		} finally {
			isLoadingRooms = false;
		}
	}

	$effect(() => {
		if (selectedPropertyId) {
			fetchRoomsAndServices(selectedPropertyId);
		}
	});

	async function handleSubmitBulkInvoices(e: SubmitEvent) {
		e.preventDefault();
		if (!landlordId || !selectedPropertyId || isSubmitting) return;

		if (rooms.length === 0) {
			toast.error('Không có phòng nào có khách để tạo hóa đơn.');
			return;
		}

		// Verify all fields are completed
		let hasError = false;
		const cleanReadings: Record<
			string,
			Record<string, { prevValue: number; currValue: number }>
		> = {};

		for (const room of rooms) {
			cleanReadings[room.id] = {};
			for (const service of meteredServices) {
				const entry = readingsMap[room.id]?.[service.id] || { prevValue: '0', currValue: '' };
				if (entry.currValue === '') {
					toast.error(
						`Vui lòng điền chỉ số mới cho phòng ${room.roomNumber} - dịch vụ ${service.name}`
					);
					hasError = true;
					break;
				}

				const prevNum = Number(entry.prevValue) || 0;
				const currNum = Number(entry.currValue) || 0;

				if (currNum < prevNum) {
					toast.error(
						`Số mới của phòng ${room.roomNumber} (${currNum}) nhỏ hơn số cũ (${prevNum})!`
					);
					hasError = true;
					break;
				}

				cleanReadings[room.id][service.id] = {
					prevValue: prevNum,
					currValue: currNum
				};
			}
			if (hasError) break;
		}

		if (hasError) return;

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
					readings: cleanReadings
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi tạo hóa đơn hàng loạt');

			toast.success(`Đã tạo thành công ${data.count} hóa đơn tháng ${month}!`);
			goto('/dashboard/invoices');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
	}
</script>

<div class="space-y-6">
	<!-- Back navigation & Header -->
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
				Nhập chỉ số điện nước cuối kỳ của toàn bộ tòa nhà để tự động tính hóa đơn.
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
		<form onsubmit={handleSubmitBulkInvoices} class="space-y-6">
			<!-- Top selectors -->
			<div class="grid gap-4 sm:grid-cols-3">
				<div class="space-y-1">
					<label for="b-prop" class="block text-xs font-bold text-zinc-600">Chọn tòa nhà</label>
					<select
						id="b-prop"
						bind:value={selectedPropertyId}
						required
						class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
					>
						{#each properties as prop}
							<option value={prop.id}>{prop.name}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1">
					<label for="b-month" class="block text-xs font-bold text-zinc-600"
						>Tháng tính hóa đơn</label
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

			<!-- Meter inputs table -->
			<div
				class="flex flex-col overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary"
			>
				<div
					class="flex shrink-0 items-center justify-between border-b-2 border-black bg-zinc-50 p-4"
				>
					<h2 class="flex items-center gap-2 text-base font-black text-black">
						Nhập chỉ số điện nước cuối kỳ <Receipt class="h-5 w-5" />
					</h2>
				</div>

				{#if isLoadingRooms}
					<div class="flex w-full items-center justify-center bg-white p-12">
						<Loader2 class="h-8 w-8 animate-spin text-black" />
					</div>
				{:else if rooms.length === 0}
					<div class="bg-white p-12 text-center">
						<p class="text-sm font-semibold text-zinc-600">
							Không tìm thấy phòng có khách đang ở trong tòa nhà này.
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto bg-white">
						<table class="w-full border-collapse text-left text-sm">
							<thead>
								<tr class="border-b-2 border-black bg-blue-300 text-xs font-black text-black">
									<th class="px-4 py-3">Số phòng</th>
									<th class="px-4 py-3">Khách thuê</th>
									<th class="px-4 py-3">Giá phòng</th>

									{#each meteredServices as service}
										<th class="bg-blue-150/40 border-l-2 border-black px-4 py-3 text-center">
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
								</tr>
							</thead>
							<tbody>
								{#each rooms as room}
									<tr
										class="border-b border-black/15 font-semibold text-black transition-all hover:bg-slate-50"
									>
										<td class="px-4 py-4 font-black">Phòng {room.roomNumber}</td>
										<td class="px-4 py-4">{room.tenant?.user.name || '--'}</td>
										<td class="px-4 py-4 font-black">{formatCurrency(room.monthlyRent)}</td>

										{#each meteredServices as service}
											{@const readings = readingsMap[room.id]?.[service.id] || {
												prevValue: '0',
												currValue: ''
											}}
											<td class="border-l-2 border-black bg-zinc-50/50 px-4 py-4 text-center">
												<div class="flex items-center justify-center gap-2">
													<input
														type="number"
														bind:value={readings.prevValue}
														required
														placeholder="Số cũ"
														class="w-20 rounded-lg border-2 border-black bg-white px-2 py-1 text-center text-xs font-bold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
													/>
													<span class="font-black text-zinc-500">→</span>
													<input
														type="number"
														bind:value={readings.currValue}
														required
														placeholder="Số mới"
														class="w-24 rounded-lg border-2 border-black bg-white px-2 py-1 text-center text-xs font-black text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
													/>
												</div>
												{#if readings.currValue !== '' && Number(readings.currValue) >= Number(readings.prevValue)}
													<span class="mt-1 block text-[10px] font-black text-blue-600">
														Tiêu thụ: {Number(readings.currValue) - Number(readings.prevValue)}
													</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Form Submit Footer -->
					<div
						class="flex shrink-0 flex-col items-center justify-between gap-4 border-t-2 border-black bg-zinc-50 p-6 sm:flex-row"
					>
						<div class="flex max-w-md items-center gap-2 text-xs font-bold text-zinc-600">
							<AlertCircle class="h-4.5 w-4.5 shrink-0 text-blue-600" />
							<span
								>Khi ấn xác nhận, hệ thống sẽ tự động tính toán điện nước, cộng phí dịch vụ cố định
								và gửi hóa đơn đến khách thuê.</span
							>
						</div>

						<button
							type="submit"
							disabled={isSubmitting}
							class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 px-6 py-3 text-sm font-black text-black shadow-primary transition-all hover:bg-green-300 disabled:opacity-50"
						>
							{#if isSubmitting}
								Đang tạo hóa đơn...
								<Loader2 class="h-4.5 w-4.5 animate-spin" />
							{:else}
								Tính toán & Xuất hóa đơn
								<CheckCircle2 class="h-4.5 w-4.5" />
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</form>
	{/if}
</div>
