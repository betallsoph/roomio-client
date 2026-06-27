<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    Landmark,
    User,
    Save,
    Loader2,
    Plug
  } from '@lucide/svelte';
  import { confirmPopup } from '$lib/confirm-popup';

  let landlordId = $state<string | null>(null);
  let isLoading = $state(true);
  let isSubmitting = $state(false);

  // Form states
  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let companyName = $state('');
  let bankName = $state('');
  let bankCode = $state('');
  let accountNumber = $state('');
  let accountName = $state('');
  let bankBranch = $state('');
  let momoNumber = $state('');

  // PayOS riêng của chủ trọ — kết nối để tiền thuê về thẳng TK của mình + tự động đối soát
  let payosConnected = $state(false);
  let payosClientIdSaved = $state<string | null>(null);
  let payosBusy = $state(false);
  let pClientId = $state('');
  let pApiKey = $state('');
  let pChecksumKey = $state('');

  onMount(() => {
    const sessionStr = localStorage.getItem('roomio_user');
    if (!sessionStr) return;
    const session = JSON.parse(sessionStr);
    landlordId = session.landlordProfileId;
    fetchSettings(session.landlordProfileId);
    fetchPayosStatus();
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
        bankName = data.bankName || '';
        bankCode = data.bankCode || '';
        accountNumber = data.accountNumber || '';
        accountName = data.accountName || '';
        bankBranch = data.bankBranch || '';
        momoNumber = data.momoNumber || '';
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

    if (!companyName || !bankName || !bankCode || !accountNumber || !accountName) {
      toast.error('Vui lòng điền đầy đủ thông tin ngân hàng nhận tiền chuyển khoản');
      return;
    }

    isSubmitting = true;
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlordId,
          companyName,
          bankName,
          bankCode,
          accountNumber,
          accountName,
          bankBranch,
          momoNumber
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

  async function fetchPayosStatus() {
    try {
      const res = await fetch('/api/payos-connect');
      const data = await res.json();
      if (res.ok) {
        payosConnected = data.connected;
        payosClientIdSaved = data.clientId;
      }
    } catch {
      // Bỏ qua lỗi tải trạng thái PayOS
    }
  }

  async function connectPayos() {
    if (payosBusy) return;
    if (!pClientId || !pApiKey || !pChecksumKey) {
      toast.error('Cần đủ Client ID, API Key và Checksum Key');
      return;
    }
    payosBusy = true;
    try {
      const res = await fetch('/api/payos-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', clientId: pClientId, apiKey: pApiKey, checksumKey: pChecksumKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi kết nối PayOS');
      payosConnected = true;
      payosClientIdSaved = pClientId;
      pApiKey = '';
      pChecksumKey = '';
      if (data.webhookRegistered) toast.success('Đã kết nối PayOS & đăng ký webhook tự động');
      else toast.success('Đã lưu khóa PayOS' + (data.warning ? ` — webhook chưa đăng ký (${data.warning})` : ''));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      payosBusy = false;
    }
  }

  async function disconnectPayos() {
    if (
      !(await confirmPopup({
        title: 'Ngắt kết nối PayOS',
        message: 'Ngắt PayOS? Hóa đơn sẽ quay về thu bằng VietQR + xác nhận thủ công.',
        confirmLabel: 'Ngắt kết nối',
        tone: 'danger'
      }))
    )
      return;
    payosBusy = true;
    try {
      const res = await fetch('/api/payos-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi ngắt kết nối');
      payosConnected = false;
      payosClientIdSaved = null;
      toast.success('Đã ngắt kết nối PayOS');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      payosBusy = false;
    }
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
</script>

<div class="max-w-4xl space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 class="text-xl sm:text-2xl font-black text-black">Cấu Hình Tài Khoản</h1>
      <p class="text-zinc-650 text-sm mt-1 font-bold">Quản lý thương hiệu dịch vụ và thông tin nhận tiền dự phòng bên cạnh PayOS</p>
    </div>
  </div>

  {#if isLoading}
    <div class="h-[40vh] w-full flex items-center justify-center">
      <Loader2 class="h-10 w-10 text-black animate-spin" />
    </div>
  {:else}
    <form onsubmit={handleSaveSettings} class="space-y-8">
      
      <!-- Section 1: User Profile -->
      <section class="space-y-4 text-black">
        <h2 class="flex items-center gap-2 text-base font-black text-black select-none">
          1. Thông tin cá nhân (Chỉ xem) <User class="h-5 w-5" />
        </h2>
        
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="space-y-1">
            <span class="block text-xs font-bold text-zinc-600">Họ và tên</span>
            <input 
              type="text" 
              bind:value={name} 
              disabled
              class="w-full border-2 border-black px-3 py-2 text-sm rounded-lg bg-zinc-100 text-zinc-500 font-semibold cursor-not-allowed focus:outline-none"
            />
          </div>
          <div class="space-y-1">
            <span class="block text-xs font-bold text-zinc-600">Email đăng nhập</span>
            <input 
              type="email" 
              bind:value={email} 
              disabled
              class="w-full border-2 border-black px-3 py-2 text-sm rounded-lg bg-zinc-100 text-zinc-500 font-semibold cursor-not-allowed focus:outline-none"
            />
          </div>
          <div class="space-y-1">
            <span class="block text-xs font-bold text-zinc-650">Số điện thoại</span>
            <input 
              type="tel" 
              bind:value={phone} 
              disabled
              class="w-full border-2 border-black px-3 py-2 text-sm rounded-lg bg-zinc-100 text-zinc-500 font-semibold cursor-not-allowed focus:outline-none"
            />
          </div>
        </div>
      </section>

      <!-- Section 2: Brand & fallback bank settings -->
      <section class="space-y-4 text-black">
        <h2 class="flex items-center gap-2 text-base font-black text-black select-none">
          2. Thương hiệu & tài khoản nhận tiền dự phòng <Landmark class="h-5 w-5" />
        </h2>
        
        <div class="grid gap-4 sm:grid-cols-2 font-semibold">
          <div class="space-y-1 sm:col-span-2">
            <label for="s-comp" class="block text-xs font-bold text-zinc-650">Tên thương hiệu quản lý trọ</label>
            <input 
              id="s-comp"
              type="text" 
              bind:value={companyName} 
              required
              placeholder="Ví dụ: Hệ thống phòng trọ Ngọc Hậu PMS"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>

          <div class="space-y-1">
            <label for="s-bcode" class="block text-xs font-bold text-zinc-650">Mã ngân hàng</label>
            <select 
              id="s-bcode"
              bind:value={bankCode} 
              required
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black"
              onchange={() => {
                const b = popularBanks.find(x => x.code === bankCode);
                if (b) bankName = b.name;
              }}
            >
              <option value="">-- Chọn ngân hàng --</option>
              {#each popularBanks as bank}
                <option value={bank.code}>{bank.name} ({bank.code})</option>
              {/each}
            </select>
          </div>

          <div class="space-y-1">
            <label for="s-bname" class="block text-xs font-bold text-zinc-650">Tên ngân hàng chi tiết</label>
            <input 
              id="s-bname"
              type="text" 
              bind:value={bankName} 
              required
              placeholder="Ví dụ: Ngân hàng TMCP Ngoại Thương Việt Nam"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>

          <div class="space-y-1">
            <label for="s-acc" class="block text-xs font-bold text-zinc-650">Số tài khoản nhận tiền</label>
            <input 
              id="s-acc"
              type="text" 
              bind:value={accountNumber} 
              required
              placeholder="Nhập chính xác số tài khoản ngân hàng"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>

          <div class="space-y-1">
            <label for="s-accname" class="block text-xs font-bold text-zinc-650">Tên chủ tài khoản (in hoa, không dấu)</label>
            <input 
              id="s-accname"
              type="text" 
              bind:value={accountName} 
              required
              placeholder="Ví dụ: NGUYEN VAN HAU"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>

          <div class="space-y-1 sm:col-span-2">
            <label for="s-branch" class="block text-xs font-bold text-zinc-650">Chi nhánh ngân hàng (tùy chọn)</label>
            <input 
              id="s-branch"
              type="text" 
              bind:value={bankBranch} 
              placeholder="Ví dụ: Chi nhánh Nam Sài Gòn"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>

          <div class="space-y-1 sm:col-span-2">
            <label for="s-momo" class="block text-xs font-bold text-zinc-650">Số Momo nhận tiền (tùy chọn)</label>
            <input 
              id="s-momo"
              type="text" 
              bind:value={momoNumber} 
              placeholder="Số điện thoại ví Momo, ví dụ: 0901234567"
              class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold"
            />
          </div>
        </div>
      </section>

      <!-- Action save -->
      <div class="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          class="bg-blue-300 hover:bg-blue-400 disabled:opacity-50 text-black border-2 border-black px-6 py-3 rounded-[6px] text-sm font-black shadow-primary transition-all flex items-center gap-1.5 cursor-pointer w-full sm:w-auto justify-center"
        >
          Lưu cấu hình tài khoản
          {#if isSubmitting}
            <Loader2 class="h-4.5 w-4.5 animate-spin" />
          {:else}
            <Save class="h-4.5 w-4.5" />
          {/if}
        </button>
      </div>

    </form>

    <!-- Section 3: Kết nối PayOS riêng (endpoint riêng /api/payos-connect) -->
    <section class="space-y-4 text-black border-t-2 border-black/15 pt-8 mt-8">
      <h2 class="flex items-center gap-2 text-base font-black text-black select-none">
        3. Kết nối PayOS — tự động đối soát tiền thuê <Plug class="h-5 w-5" />
      </h2>
      <p class="-mt-2 text-xs font-bold text-zinc-600">
        Kết nối tài khoản PayOS riêng của bạn để tiền thuê về thẳng TK ngân hàng của bạn và tự động đối soát qua webhook.
        Chưa kết nối thì hệ thống vẫn thu được bằng VietQR + xác nhận thủ công.
      </p>

      {#if payosConnected}
        <div class="flex items-center justify-between gap-3 rounded-lg border-2 border-black bg-green-100 p-4 shadow-secondary">
          <div>
            <p class="text-sm font-black text-green-800">Đã kết nối PayOS</p>
            {#if payosClientIdSaved}
              <p class="mt-0.5 text-xs font-bold text-zinc-600">Client ID: {payosClientIdSaved}</p>
            {/if}
          </div>
          <button
            type="button"
            onclick={disconnectPayos}
            disabled={payosBusy}
            class="cursor-pointer rounded-[6px] border-2 border-black bg-red-200 px-3 py-2 text-xs font-black text-red-800 shadow-secondary transition-all disabled:opacity-50"
          >
            Ngắt kết nối
          </button>
        </div>
      {:else}
        <div class="grid gap-4 font-semibold sm:grid-cols-2">
          <div class="space-y-1 sm:col-span-2">
            <label for="p-cid" class="block text-xs font-bold text-zinc-650">PayOS Client ID</label>
            <input id="p-cid" type="text" bind:value={pClientId} placeholder="x-client-id" class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold" />
          </div>
          <div class="space-y-1">
            <label for="p-api" class="block text-xs font-bold text-zinc-650">PayOS API Key</label>
            <input id="p-api" type="password" bind:value={pApiKey} placeholder="x-api-key" class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold" />
          </div>
          <div class="space-y-1">
            <label for="p-cs" class="block text-xs font-bold text-zinc-650">PayOS Checksum Key</label>
            <input id="p-cs" type="password" bind:value={pChecksumKey} placeholder="checksum key" class="w-full border-2 border-black px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-black font-semibold" />
          </div>
          <div class="sm:col-span-2">
            <button
              type="button"
              onclick={connectPayos}
              disabled={payosBusy}
              class="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-5 py-2.5 text-sm font-black text-black shadow-secondary transition-all hover:bg-blue-400 disabled:opacity-50"
            >
              Kết nối & kiểm tra
              {#if payosBusy}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Plug class="h-4 w-4" />{/if}
            </button>
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>
