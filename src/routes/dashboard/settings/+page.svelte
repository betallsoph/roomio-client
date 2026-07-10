<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from '@lucide/svelte';
	import { confirmPopup } from '$lib/confirm-popup';
	import StaffManagement from '$lib/StaffManagement.svelte';
	import SubscriptionManagement from '$lib/SubscriptionManagement.svelte';
	import RoomioSelect from '$lib/RoomioSelect.svelte';

	type SettingsTab = 'account' | 'staff' | 'subscription';
	type PaymentProvider = 'vietqr' | 'payos';

	interface PaymentAccount {
		id: string;
		name: string;
		provider: PaymentProvider | string;
		isDefault: boolean;
		isActive: boolean;
		bankName: string;
		bankCode: string;
		accountNumber: string;
		accountName: string;
		bankBranch: string | null;
		momoNumber: string | null;
		payosClientId: string | null;
		payosConnected: boolean;
		payosConnectedAt: string | null;
	}

	interface PaymentAccountForm {
		name: string;
		provider: PaymentProvider;
		bankCode: string;
		bankName: string;
		accountNumber: string;
		accountName: string;
		bankBranch: string;
		momoNumber: string;
		clientId: string;
		apiKey: string;
		checksumKey: string;
		isDefault: boolean;
	}

	let landlordId = $state<string | null>(null);
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let activeTab = $state<SettingsTab>('account');

	// Form states
	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let companyName = $state('');
	let paymentAccounts = $state<PaymentAccount[]>([]);
	let paymentAccountForm = $state<PaymentAccountForm>(emptyPaymentAccountForm());
	let paymentAccountBusy = $state(false);
	let paymentAccountActionId = $state<string | null>(null);

	onMount(() => {
		const requestedTab = page.url.searchParams.get('tab');
		activeTab =
			requestedTab === 'staff' || requestedTab === 'subscription' ? requestedTab : 'account';

		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) return;
		const session = JSON.parse(sessionStr);
		landlordId = session.landlordProfileId;
		fetchSettings(session.landlordProfileId);
		fetchPaymentAccounts();
	});

	async function fetchSettings(profileId: string) {
		isLoading = true;
		try {
			const res = await fetch(`/api/settings?landlordId=${profileId}`);
			const data = await res.json();

			if (res.ok) {
				name = data.user.name;
				email = data.user.email;
				phone = data.user.phone;
				companyName = data.companyName || '';
			}
		} catch (e: any) {
			toast.error('Lỗi khi tải cấu hình chủ trọ: ' + e.message);
		} finally {
			isLoading = false;
		}
	}

	async function handleSaveSettings(e: SubmitEvent) {
		e.preventDefault();
		if (!landlordId || isSubmitting) return;

		if (!companyName) {
			toast.error('Vui lòng nhập tên thương hiệu quản lý trọ');
			return;
		}

		isSubmitting = true;
		try {
			const res = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					landlordId,
					companyName
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật cấu hình');

			toast.success('Đã lưu cấu hình tài khoản chủ trọ thành công!');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isSubmitting = false;
		}
	}

	function setTab(tab: SettingsTab) {
		activeTab = tab;
		goto(tab === 'account' ? '/dashboard/settings' : `/dashboard/settings?tab=${tab}`, {
			replaceState: true,
			noScroll: true
		});
	}

	// Pre-configured list of common banks in Vietnam
	const popularBanks = [
		{ code: 'VCB', name: 'Vietcombank' },
		{ code: 'MB', name: 'MBBank' },
		{ code: 'TCB', name: 'Techcombank' },
		{ code: 'BIDV', name: 'BIDV' },
		{ code: 'CTG', name: 'VietinBank' },
		{ code: 'ACB', name: 'ACB' },
		{ code: 'VPB', name: 'VPBank' },
		{ code: 'TPB', name: 'TPBank' },
		{ code: 'VIB', name: 'VIB' }
	];

	function emptyPaymentAccountForm(): PaymentAccountForm {
		return {
			name: '',
			provider: 'vietqr',
			bankCode: 'VCB',
			bankName: 'Vietcombank',
			accountNumber: '',
			accountName: '',
			bankBranch: '',
			momoNumber: '',
			clientId: '',
			apiKey: '',
			checksumKey: '',
			isDefault: false
		};
	}

	function syncPaymentAccountBankName() {
		const bank = popularBanks.find((item) => item.code === paymentAccountForm.bankCode);
		if (bank) paymentAccountForm.bankName = bank.name;
	}

	function paymentProviderLabel(provider: string) {
		return provider === 'payos' ? 'PayOS' : 'VietQR';
	}

	function paymentAccountSubtitle(account: PaymentAccount) {
		return [account.bankName, account.bankCode, account.accountNumber].filter(Boolean).join(' · ');
	}

	async function fetchPaymentAccounts() {
		try {
			const res = await fetch('/api/payment-accounts');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không tải được tài khoản nhận tiền');
			paymentAccounts = data.accounts ?? [];
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function createPaymentAccount(e: SubmitEvent) {
		e.preventDefault();
		if (paymentAccountBusy) return;

		if (
			!paymentAccountForm.name ||
			!paymentAccountForm.bankName ||
			!paymentAccountForm.bankCode ||
			!paymentAccountForm.accountNumber ||
			!paymentAccountForm.accountName
		) {
			toast.error('Cần đủ tên kênh, ngân hàng, số tài khoản và chủ tài khoản');
			return;
		}
		if (
			paymentAccountForm.provider === 'payos' &&
			(!paymentAccountForm.clientId ||
				!paymentAccountForm.apiKey ||
				!paymentAccountForm.checksumKey)
		) {
			toast.error('Tài khoản PayOS cần đủ Client ID, API Key và Checksum Key');
			return;
		}

		paymentAccountBusy = true;
		try {
			const res = await fetch('/api/payment-accounts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(paymentAccountForm)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Lỗi thêm tài khoản nhận tiền');
			paymentAccountForm = emptyPaymentAccountForm();
			await fetchPaymentAccounts();
			if (data.warning) {
				toast.success('Đã lưu tài khoản, nhưng PayOS chưa đăng ký webhook tự động');
			} else {
				toast.success('Đã thêm tài khoản nhận tiền');
			}
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			paymentAccountBusy = false;
		}
	}

	async function setDefaultAccount(id: string) {
		if (paymentAccountActionId) return;
		paymentAccountActionId = id;
		try {
			const res = await fetch('/api/payment-accounts', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, isDefault: true })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không đặt được mặc định');
			await fetchPaymentAccounts();
			toast.success('Đã đổi tài khoản mặc định');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			paymentAccountActionId = null;
		}
	}

	async function deletePaymentAccount(id: string) {
		if (
			!(await confirmPopup({
				title: 'Xóa tài khoản nhận tiền',
				message: 'Tài khoản này sẽ ngừng hiển thị khi tạo phòng, khách thuê và hóa đơn mới.',
				confirmLabel: 'Xóa',
				tone: 'danger'
			}))
		)
			return;
		paymentAccountActionId = id;
		try {
			const res = await fetch(`/api/payment-accounts?id=${encodeURIComponent(id)}`, {
				method: 'DELETE'
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không xóa được tài khoản nhận tiền');
			await fetchPaymentAccounts();
			toast.success('Đã xóa tài khoản nhận tiền');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			paymentAccountActionId = null;
		}
	}
</script>

<div class="max-w-5xl space-y-8">
	<!-- Header -->
	<div class="flex rounded-lg border-2 border-black bg-white p-1 sm:w-fit">
		<button
			type="button"
			onclick={() => setTab('account')}
			class="inline-flex min-w-32 flex-1 items-center justify-center rounded-[6px] px-3 py-2 text-sm font-black transition-colors sm:flex-none {activeTab ===
			'account'
				? 'bg-blue-100 text-blue-600'
				: 'text-zinc-500 hover:bg-zinc-50 hover:text-black'}"
		>
			Tài khoản
		</button>
		<button
			type="button"
			onclick={() => setTab('staff')}
			class="inline-flex min-w-32 flex-1 items-center justify-center rounded-[6px] px-3 py-2 text-sm font-black transition-colors sm:flex-none {activeTab ===
			'staff'
				? 'bg-blue-100 text-blue-600'
				: 'text-zinc-500 hover:bg-zinc-50 hover:text-black'}"
		>
			Nhân viên
		</button>
		<button
			type="button"
			onclick={() => setTab('subscription')}
			class="inline-flex min-w-32 flex-1 items-center justify-center rounded-[6px] px-3 py-2 text-sm font-black transition-colors sm:flex-none {activeTab ===
			'subscription'
				? 'bg-blue-100 text-blue-600'
				: 'text-zinc-500 hover:bg-zinc-50 hover:text-black'}"
		>
			Gói Roomio
		</button>
	</div>

	{#if activeTab === 'staff'}
		<StaffManagement />
	{:else if activeTab === 'subscription'}
		<SubscriptionManagement />
	{:else if isLoading}
		<div class="flex h-[40vh] w-full items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else}
		<div class="max-w-4xl space-y-10">
			<form onsubmit={handleSaveSettings} class="space-y-10">
				<!-- Section 1: User Profile -->
				<section class="space-y-4 text-black">
					<h2 class="text-base font-black text-blue-600 select-none">1. Thông tin cá nhân</h2>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-1">
							<span class="block text-xs font-bold text-zinc-600">Họ và tên</span>
							<input
								type="text"
								bind:value={name}
								disabled
								class="w-full cursor-not-allowed rounded-lg border-2 border-black bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<span class="block text-xs font-bold text-zinc-600">Email đăng nhập</span>
							<input
								type="email"
								bind:value={email}
								disabled
								class="w-full cursor-not-allowed rounded-lg border-2 border-black bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<span class="text-zinc-650 block text-xs font-bold">Số điện thoại</span>
							<input
								type="tel"
								bind:value={phone}
								disabled
								class="w-full cursor-not-allowed rounded-lg border-2 border-black bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500 focus:outline-none"
							/>
						</div>
					</div>
				</section>

				<section class="space-y-4 text-black">
					<h2 class="text-base font-black text-blue-600 select-none">2. Thương hiệu</h2>

					<div class="grid gap-4 font-semibold">
						<div class="space-y-1">
							<label for="s-comp" class="text-zinc-650 block text-xs font-bold"
								>Tên thương hiệu quản lý trọ</label
							>
							<input
								id="s-comp"
								type="text"
								bind:value={companyName}
								required
								placeholder="Ví dụ: Hệ thống phòng trọ Ngọc Hậu PMS"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
					</div>
				</section>

				<div class="flex justify-end">
					<button
						type="submit"
						disabled={isSubmitting}
						class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-6 py-3 text-sm font-black text-black shadow-primary transition-all hover:bg-blue-400 disabled:opacity-50 sm:w-auto"
					>
						Lưu cấu hình tài khoản
						{#if isSubmitting}
							<Loader2 class="h-4.5 w-4.5 animate-spin" />
						{/if}
					</button>
				</div>
			</form>

			<section class="space-y-4 text-black">
				<h2 class="text-base font-black text-blue-600 select-none">3. Tài khoản nhận tiền</h2>

				{#if paymentAccounts.length > 0}
					<div class="divide-y divide-black/10 border-y border-black/15">
						{#each paymentAccounts as account}
							<div
								class="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] sm:items-center"
							>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<p class="truncate text-sm font-black text-black">{account.name}</p>
										<span class="text-xs font-black text-blue-600">
											{paymentProviderLabel(account.provider)}
										</span>
										{#if account.isDefault}
											<span class="text-xs font-black text-green-600">Mặc định</span>
										{/if}
									</div>
									<p class="mt-1 truncate text-xs font-bold text-zinc-500">
										{paymentAccountSubtitle(account)}
									</p>
								</div>
								<div class="min-w-0 text-xs font-bold text-zinc-500">
									<p class="truncate">{account.accountName}</p>
									{#if account.provider === 'payos'}
										<p
											class="mt-1 font-black {account.payosConnected
												? 'text-green-600'
												: 'text-red-500'}"
										>
											{account.payosConnected ? 'PayOS đã kết nối' : 'PayOS chưa đủ khóa'}
										</p>
									{:else if account.momoNumber}
										<p class="mt-1">Momo: {account.momoNumber}</p>
									{/if}
								</div>
								<div class="flex flex-wrap justify-start gap-2 sm:justify-end">
									{#if !account.isDefault}
										<button
											type="button"
											onclick={() => setDefaultAccount(account.id)}
											disabled={paymentAccountActionId === account.id}
											class="cursor-pointer rounded-[6px] px-2.5 py-1.5 text-xs font-black text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
										>
											Đặt mặc định
										</button>
									{/if}
									<button
										type="button"
										onclick={() => deletePaymentAccount(account.id)}
										disabled={paymentAccountActionId === account.id || paymentAccounts.length <= 1}
										class="cursor-pointer rounded-[6px] px-2.5 py-1.5 text-xs font-black text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
									>
										Xóa
									</button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="py-8 text-center text-sm font-black text-zinc-400">
						Chưa có tài khoản nhận tiền nào.
					</p>
				{/if}

				<form onsubmit={createPaymentAccount} class="space-y-4 pt-2">
					<div class="grid gap-4 font-semibold sm:grid-cols-2">
						<div class="space-y-1">
							<label for="pa-name" class="text-zinc-650 block text-xs font-bold">Tên kênh</label>
							<input
								id="pa-name"
								type="text"
								bind:value={paymentAccountForm.name}
								required
								placeholder="Ví dụ: Tài khoản chính, MB của chị Lan"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-provider" class="text-zinc-650 block text-xs font-bold">Cách thu</label
							>
							<RoomioSelect
								id="pa-provider"
								bind:value={paymentAccountForm.provider}
								options={[
									{ value: 'vietqr', label: 'VietQR / xác nhận thủ công' },
									{ value: 'payos', label: 'PayOS / tự đối soát' }
								]}
							/>
						</div>

						<div class="space-y-1">
							<label for="pa-bank-code" class="text-zinc-650 block text-xs font-bold"
								>Ngân hàng</label
							>
							<RoomioSelect
								id="pa-bank-code"
								bind:value={paymentAccountForm.bankCode}
								required
								onchange={syncPaymentAccountBankName}
								options={[
									{ value: '', label: 'Chọn ngân hàng' },
									...popularBanks.map((bank) => ({
										value: bank.code,
										label: `${bank.name} (${bank.code})`
									}))
								]}
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-bank-name" class="text-zinc-650 block text-xs font-bold"
								>Tên ngân hàng chi tiết</label
							>
							<input
								id="pa-bank-name"
								type="text"
								bind:value={paymentAccountForm.bankName}
								required
								placeholder="Ví dụ: Vietcombank"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-number" class="text-zinc-650 block text-xs font-bold"
								>Số tài khoản</label
							>
							<input
								id="pa-number"
								type="text"
								bind:value={paymentAccountForm.accountNumber}
								required
								placeholder="Nhập chính xác số tài khoản"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-account-name" class="text-zinc-650 block text-xs font-bold"
								>Chủ tài khoản</label
							>
							<input
								id="pa-account-name"
								type="text"
								bind:value={paymentAccountForm.accountName}
								required
								placeholder="Ví dụ: NGUYEN VAN HAU"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-branch" class="text-zinc-650 block text-xs font-bold"
								>Chi nhánh (tùy chọn)</label
							>
							<input
								id="pa-branch"
								type="text"
								bind:value={paymentAccountForm.bankBranch}
								placeholder="Ví dụ: Chi nhánh TP.HCM"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>
						<div class="space-y-1">
							<label for="pa-momo" class="text-zinc-650 block text-xs font-bold"
								>Momo (tùy chọn)</label
							>
							<input
								id="pa-momo"
								type="text"
								bind:value={paymentAccountForm.momoNumber}
								placeholder="0901234567"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>

						{#if paymentAccountForm.provider === 'payos'}
							<div class="space-y-1 sm:col-span-2">
								<label for="pa-client-id" class="text-zinc-650 block text-xs font-bold"
									>PayOS Client ID</label
								>
								<input
									id="pa-client-id"
									type="text"
									bind:value={paymentAccountForm.clientId}
									required
									placeholder="x-client-id"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label for="pa-api-key" class="text-zinc-650 block text-xs font-bold"
									>PayOS API Key</label
								>
								<input
									id="pa-api-key"
									type="password"
									bind:value={paymentAccountForm.apiKey}
									required
									placeholder="x-api-key"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</div>
							<div class="space-y-1">
								<label for="pa-checksum-key" class="text-zinc-650 block text-xs font-bold"
									>PayOS Checksum Key</label
								>
								<input
									id="pa-checksum-key"
									type="password"
									bind:value={paymentAccountForm.checksumKey}
									required
									placeholder="checksum key"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:ring-2 focus:ring-blue-300 focus:outline-none"
								/>
							</div>
						{/if}

						<label class="flex items-center gap-2 text-xs font-black text-zinc-600 sm:col-span-2">
							<input
								type="checkbox"
								bind:checked={paymentAccountForm.isDefault}
								class="h-4 w-4 accent-blue-600"
							/>
							Đặt làm tài khoản mặc định
						</label>
					</div>

					<div class="flex justify-end">
						<button
							type="submit"
							disabled={paymentAccountBusy}
							class="modal-action flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-5 py-2.5 text-sm font-black text-black shadow-secondary transition-all disabled:opacity-50"
						>
							<span class="modal-action-label">Thêm tài khoản nhận tiền</span>
							{#if paymentAccountBusy}<Loader2 class="h-4 w-4 animate-spin" />{/if}
						</button>
					</div>
				</form>
			</section>
		</div>
	{/if}
</div>
