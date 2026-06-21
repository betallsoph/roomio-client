<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { confirmPopup } from '$lib/confirm-popup';
  import {
    Award,
    Bell,
    Building2,
    Calendar,
    Check,
    CreditCard,
    Eye,
    Home,
    Loader2,
    Lock,
    LogOut,
    Search,
    ShieldAlert,
    Sliders,
    Unlock,
    Users,
    X
  } from '@lucide/svelte';

  interface LandlordMetrics {
    totalProperties: number;
    totalRooms: number;
    occupiedRooms: number;
    debtRooms: number;
    activeStaff: number;
    activeServices: number;
    unpaidInvoices: number;
    overdueInvoices: number;
    unpaidAmount: number;
    collectedAmount: number;
    currentMonthCollectedAmount: number;
    payosApplied: number;
    payosUnmatched: number;
    payosAppliedAmount: number;
    queuedNotifications: number;
    lastPaymentAt: string | null;
  }

  interface Landlord {
    id: string;
    userId: string;
    subscriptionType: string;
    subValidUntil: string | null;
    companyName: string | null;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string;
      isActive: boolean;
      createdAt: string;
    };
    properties: {
      id: string;
      name: string;
      _count: {
        rooms: number;
      };
    }[];
    metrics: LandlordMetrics;
  }

  let adminName = $state('');
  let isLoading = $state(true);
  let landlords = $state<Landlord[]>([]);
  let selectedLandlord = $state<Landlord | null>(null);
  let isEditOpen = $state(false);
  let subType = $state('FREE');
  let subValid = $state('');
  let isSaving = $state(false);
  let searchQuery = $state('');
  let planFilter = $state('all');
  let statusFilter = $state('all');

  onMount(() => {
    const sessionStr = localStorage.getItem('roomio_user');
    if (!sessionStr) {
      goto('/login');
      return;
    }

    const session = JSON.parse(sessionStr);
    if (session.role !== 'SUPER_ADMIN') {
      toast.error('Bạn không có quyền truy cập trang quản trị hệ thống');
      goto('/login');
      return;
    }

    adminName = session.name;
    fetchLandlords();
  });

  async function fetchLandlords() {
    isLoading = true;
    try {
      const res = await fetch('/api/super-admin');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tải danh sách chủ trọ');

      landlords = data;
      selectedLandlord = selectedLandlord
        ? (data.find((landlord: Landlord) => landlord.id === selectedLandlord?.id) ?? data[0] ?? null)
        : (data[0] ?? null);
    } catch (e: any) {
      toast.error('Lỗi khi tải danh sách chủ trọ: ' + e.message);
    } finally {
      isLoading = false;
    }
  }

  async function handleToggleStatus(userId: string, currentActive: boolean) {
    const actionLabel = currentActive ? 'Khóa' : 'Mở khóa';
    if (!(await confirmPopup({
      title: `${actionLabel} tài khoản`,
      message: `Bạn có chắc muốn ${actionLabel.toLowerCase()} tài khoản chủ trọ này?`,
      confirmLabel: actionLabel,
      tone: currentActive ? 'danger' : 'default'
    }))) return;

    try {
      const res = await fetch('/api/super-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !currentActive })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');

      toast.success(`Đã ${actionLabel.toLowerCase()} tài khoản chủ trọ`);
      fetchLandlords();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleUpdateSubscription(e: SubmitEvent) {
    e.preventDefault();
    if (!selectedLandlord || isSaving) return;

    isSaving = true;
    try {
      const res = await fetch('/api/super-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlordId: selectedLandlord.id,
          subscriptionType: subType,
          subValidUntil: subValid || null
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật gói dịch vụ');

      toast.success(`Đã cập nhật gói dịch vụ cho ${selectedLandlord.user.name}`);
      isEditOpen = false;
      fetchLandlords();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      isSaving = false;
    }
  }

  function handleLogout() {
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    }).catch(() => {});
    localStorage.removeItem('roomio_user');
    toast.success('Đã đăng xuất tài khoản quản trị');
    goto('/login');
  }

  function openSubscriptionDialog(landlord: Landlord) {
    selectedLandlord = landlord;
    subType = landlord.subscriptionType;
    subValid = landlord.subValidUntil ? landlord.subValidUntil.slice(0, 10) : '';
    isEditOpen = true;
  }

  function isSubscriptionExpired(landlord: Landlord) {
    if (!landlord.subValidUntil) return false;
    return new Date(landlord.subValidUntil) < new Date();
  }

  const filteredLandlords = $derived(() => {
    const query = searchQuery.trim().toLowerCase();
    return landlords.filter((landlord) => {
      const matchesQuery =
        !query ||
        landlord.user.name.toLowerCase().includes(query) ||
        (landlord.companyName && landlord.companyName.toLowerCase().includes(query)) ||
        landlord.user.email.toLowerCase().includes(query) ||
        landlord.user.phone.includes(query);

      const matchesPlan = planFilter === 'all' || landlord.subscriptionType === planFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && landlord.user.isActive && !isSubscriptionExpired(landlord)) ||
        (statusFilter === 'locked' && !landlord.user.isActive) ||
        (statusFilter === 'expired' && isSubscriptionExpired(landlord));

      return matchesQuery && matchesPlan && matchesStatus;
    });
  });

  const platformStats = $derived(() => {
    return {
      activeLandlords: landlords.filter((landlord) => landlord.user.isActive).length,
      paidLandlords: landlords.filter((landlord) => landlord.subscriptionType !== 'FREE').length,
      totalRooms: landlords.reduce((sum, landlord) => sum + landlord.metrics.totalRooms, 0),
      collectedAmount: landlords.reduce((sum, landlord) => sum + landlord.metrics.collectedAmount, 0),
      currentMonthCollectedAmount: landlords.reduce(
        (sum, landlord) => sum + landlord.metrics.currentMonthCollectedAmount,
        0
      ),
      unpaidAmount: landlords.reduce((sum, landlord) => sum + landlord.metrics.unpaidAmount, 0),
      overdueInvoices: landlords.reduce((sum, landlord) => sum + landlord.metrics.overdueInvoices, 0),
      payosIssues: landlords.reduce((sum, landlord) => sum + landlord.metrics.payosUnmatched, 0)
    };
  });

  function formatCurrency(amount: number) {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} triệu`;
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
  }

  function formatDate(value: string | null) {
    if (!value) return 'Không giới hạn';
    return new Date(value).toLocaleDateString('vi-VN');
  }

  function planBadgeClass(plan: string) {
    if (plan === 'ENTERPRISE') return 'bg-amber-100 text-amber-900';
    if (plan === 'PREMIUM') return 'bg-blue-100 text-blue-800';
    return 'bg-zinc-100 text-zinc-600';
  }

  function accountStatusLabel(landlord: Landlord) {
    if (!landlord.user.isActive) return 'Đã khóa';
    if (isSubscriptionExpired(landlord)) return 'Hết hạn gói';
    return 'Đang hoạt động';
  }

  function accountStatusClass(landlord: Landlord) {
    if (!landlord.user.isActive) return 'bg-red-100 text-red-800';
    if (isSubscriptionExpired(landlord)) return 'bg-yellow-100 text-yellow-900';
    return 'bg-green-100 text-green-800';
  }
</script>

<div class="min-h-screen bg-white text-black">
  <header class="border-b-2 border-black bg-white">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
      <div class="min-w-0">
        <img src="/brand/roomio-wordmark-blue600.png" alt="Roomio" class="h-auto w-32" />
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <h1 class="text-2xl font-black leading-tight sm:text-3xl">Quản trị Roomio</h1>
          <span class="pb-1 text-sm font-bold text-zinc-500">Console vận hành nền tảng</span>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-3">
        <span class="hidden text-sm font-bold text-zinc-500 sm:block">{adminName}</span>
        <button onclick={handleLogout} class="roomio-button-white px-3 py-2 text-xs">
          Đăng xuất <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-6">
    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border-2 border-black bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-bold text-zinc-500">Chủ trọ đang hoạt động</p>
          <Users class="h-5 w-5 text-blue-500" />
        </div>
        <p class="mt-3 text-2xl font-black">{platformStats().activeLandlords}/{landlords.length}</p>
        <p class="mt-1 text-xs font-bold text-zinc-500">{platformStats().paidLandlords} tài khoản trả phí</p>
      </div>

      <div class="rounded-lg border-2 border-black bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-bold text-zinc-500">Phòng đang được quản lý</p>
          <Building2 class="h-5 w-5 text-blue-500" />
        </div>
        <p class="mt-3 text-2xl font-black">{platformStats().totalRooms}</p>
        <p class="mt-1 text-xs font-bold text-zinc-500">Trên toàn hệ thống</p>
      </div>

      <div class="rounded-lg border-2 border-black bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-bold text-zinc-500">Tiền đã ghi nhận</p>
          <CreditCard class="h-5 w-5 text-blue-500" />
        </div>
        <p class="mt-3 text-2xl font-black">{formatCurrency(platformStats().collectedAmount)}</p>
        <p class="mt-1 text-xs font-bold text-zinc-500">
          Tháng này {formatCurrency(platformStats().currentMonthCollectedAmount)}
        </p>
      </div>

      <div class="rounded-lg border-2 border-black bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-bold text-zinc-500">Cần theo dõi</p>
          <ShieldAlert class="h-5 w-5 text-red-500" />
        </div>
        <p class="mt-3 text-2xl font-black">{platformStats().overdueInvoices} hóa đơn</p>
        <p class="mt-1 text-xs font-bold text-zinc-500">
          {platformStats().payosIssues} giao dịch PayOS cần soát
        </p>
      </div>
    </section>

    <section class="grid gap-3 rounded-lg border-2 border-black bg-white p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label class="flex min-w-0 items-center gap-2 rounded-[6px] border-2 border-black px-3 py-2">
        <Search class="h-4 w-4 shrink-0 text-zinc-500" />
        <input
          bind:value={searchQuery}
          type="text"
          placeholder="Tìm chủ trọ, thương hiệu, email hoặc số điện thoại"
          class="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
      </label>

      <div class="grid grid-cols-4 gap-1 rounded-[6px] border-2 border-black bg-white p-1 text-xs font-black">
        {#each ['all', 'FREE', 'PREMIUM', 'ENTERPRISE'] as plan}
          <button
            onclick={() => (planFilter = plan)}
            class="rounded-[5px] px-3 py-2 transition-colors {planFilter === plan ? 'bg-blue-300 text-black' : 'text-zinc-500 hover:bg-zinc-100'}"
          >
            {plan === 'all' ? 'Tất cả gói' : plan}
          </button>
        {/each}
      </div>

      <div class="grid grid-cols-4 gap-1 rounded-[6px] border-2 border-black bg-white p-1 text-xs font-black">
        {#each [
          { value: 'all', label: 'Tất cả' },
          { value: 'active', label: 'Đang chạy' },
          { value: 'locked', label: 'Đã khóa' },
          { value: 'expired', label: 'Hết hạn' }
        ] as status}
          <button
            onclick={() => (statusFilter = status.value)}
            class="rounded-[5px] px-3 py-2 transition-colors {statusFilter === status.value ? 'bg-blue-300 text-black' : 'text-zinc-500 hover:bg-zinc-100'}"
          >
            {status.label}
          </button>
        {/each}
      </div>
    </section>

    {#if isLoading}
      <div class="flex h-[44vh] items-center justify-center">
        <Loader2 class="h-10 w-10 animate-spin text-black" />
      </div>
    {:else}
      <section class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div class="space-y-3">
          {#if filteredLandlords().length === 0}
            <div class="rounded-lg border-2 border-black bg-blue-50 p-10 text-center">
              <p class="text-sm font-bold text-zinc-600">Không có chủ trọ nào khớp bộ lọc.</p>
            </div>
          {:else}
            {#each filteredLandlords() as landlord}
              <button
                onclick={() => (selectedLandlord = landlord)}
                class="w-full rounded-lg border-2 border-black bg-white p-4 text-left transition-colors hover:bg-blue-50 {selectedLandlord?.id === landlord.id ? 'bg-blue-50' : ''}"
              >
                <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="text-lg font-black leading-tight">{landlord.user.name}</h2>
                      <span class="rounded-full px-2.5 py-1 text-[10px] font-black {planBadgeClass(landlord.subscriptionType)}">
                        {landlord.subscriptionType}
                      </span>
                      <span class="rounded-full px-2.5 py-1 text-[10px] font-black {accountStatusClass(landlord)}">
                        {accountStatusLabel(landlord)}
                      </span>
                    </div>
                    <p class="mt-1 text-sm font-bold text-zinc-500">
                      {landlord.companyName || 'Chưa đặt thương hiệu'} · {landlord.user.email} · {landlord.user.phone}
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4 xl:min-w-[420px]">
                    <div class="rounded-[6px] bg-zinc-100 px-3 py-2">
                      <p class="text-zinc-500">Phòng</p>
                      <p class="mt-1 text-sm font-black text-black">{landlord.metrics.totalRooms}</p>
                    </div>
                    <div class="rounded-[6px] bg-zinc-100 px-3 py-2">
                      <p class="text-zinc-500">Lấp đầy</p>
                      <p class="mt-1 text-sm font-black text-black">
                        {landlord.metrics.totalRooms
                          ? Math.round((landlord.metrics.occupiedRooms / landlord.metrics.totalRooms) * 100)
                          : 0}%
                      </p>
                    </div>
                    <div class="rounded-[6px] bg-zinc-100 px-3 py-2">
                      <p class="text-zinc-500">Chưa thu</p>
                      <p class="mt-1 text-sm font-black text-black">{landlord.metrics.unpaidInvoices}</p>
                    </div>
                    <div class="rounded-[6px] bg-zinc-100 px-3 py-2">
                      <p class="text-zinc-500">PayOS lỗi</p>
                      <p class="mt-1 text-sm font-black text-black">{landlord.metrics.payosUnmatched}</p>
                    </div>
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>

        <aside class="lg:sticky lg:top-5 lg:h-fit">
          {#if selectedLandlord}
            <div class="rounded-lg border-2 border-black bg-white">
              <div class="space-y-4 p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-zinc-500">Hồ sơ đối tác</p>
                    <h2 class="mt-1 text-xl font-black leading-tight">{selectedLandlord.user.name}</h2>
                    <p class="mt-1 truncate text-sm font-bold text-zinc-500">
                      {selectedLandlord.companyName || 'Chưa đặt thương hiệu'}
                    </p>
                  </div>
                  <span class="rounded-full px-2.5 py-1 text-[10px] font-black {accountStatusClass(selectedLandlord)}">
                    {accountStatusLabel(selectedLandlord)}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div class="rounded-[6px] border-2 border-black p-3">
                    <Home class="mb-2 h-4 w-4 text-blue-500" />
                    <p class="text-zinc-500">Tòa nhà</p>
                    <p class="mt-1 text-lg font-black">{selectedLandlord.metrics.totalProperties}</p>
                  </div>
                  <div class="rounded-[6px] border-2 border-black p-3">
                    <Building2 class="mb-2 h-4 w-4 text-blue-500" />
                    <p class="text-zinc-500">Phòng</p>
                    <p class="mt-1 text-lg font-black">{selectedLandlord.metrics.totalRooms}</p>
                  </div>
                  <div class="rounded-[6px] border-2 border-black p-3">
                    <CreditCard class="mb-2 h-4 w-4 text-blue-500" />
                    <p class="text-zinc-500">Đã thu</p>
                    <p class="mt-1 text-lg font-black">{formatCurrency(selectedLandlord.metrics.collectedAmount)}</p>
                  </div>
                  <div class="rounded-[6px] border-2 border-black p-3">
                    <ShieldAlert class="mb-2 h-4 w-4 text-red-500" />
                    <p class="text-zinc-500">Chưa thu</p>
                    <p class="mt-1 text-lg font-black">{formatCurrency(selectedLandlord.metrics.unpaidAmount)}</p>
                  </div>
                </div>

                <div class="space-y-2 text-sm font-bold">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Email</span>
                    <span class="truncate text-right">{selectedLandlord.user.email}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Điện thoại</span>
                    <span>{selectedLandlord.user.phone}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Ngày tạo</span>
                    <span>{formatDate(selectedLandlord.user.createdAt)}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Gói dịch vụ</span>
                    <span>{selectedLandlord.subscriptionType} · {formatDate(selectedLandlord.subValidUntil)}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Nhân viên</span>
                    <span>{selectedLandlord.metrics.activeStaff} đang hoạt động</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Thông báo chờ</span>
                    <span>{selectedLandlord.metrics.queuedNotifications}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">PayOS đã khớp</span>
                    <span>{selectedLandlord.metrics.payosApplied} giao dịch</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">PayOS cần soát</span>
                    <span>{selectedLandlord.metrics.payosUnmatched}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-zinc-500">Thanh toán gần nhất</span>
                    <span>{formatDate(selectedLandlord.metrics.lastPaymentAt)}</span>
                  </div>
                </div>

                <div class="space-y-2">
                  <p class="text-xs font-black text-zinc-500">Tòa nhà đang quản lý</p>
                  {#if selectedLandlord.properties.length === 0}
                    <p class="rounded-[6px] bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-500">
                      Chưa có tòa nhà nào.
                    </p>
                  {:else}
                    <div class="max-h-36 space-y-2 overflow-y-auto pr-1">
                      {#each selectedLandlord.properties as property}
                        <div class="flex items-center justify-between gap-3 rounded-[6px] bg-zinc-100 px-3 py-2 text-xs font-bold">
                          <span class="truncate">{property.name}</span>
                          <span class="shrink-0 text-zinc-500">{property._count.rooms} phòng</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onclick={() => openSubscriptionDialog(selectedLandlord!)}
                    class="inline-flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-3 py-2 text-xs font-black text-black transition-colors hover:bg-blue-400"
                  >
                    <Sliders class="h-4 w-4" /> Cấp gói
                  </button>
                  <button
                    onclick={() => handleToggleStatus(selectedLandlord!.userId, selectedLandlord!.user.isActive)}
                    class="inline-flex items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-white px-3 py-2 text-xs font-black text-black transition-colors hover:bg-zinc-100"
                  >
                    {#if selectedLandlord.user.isActive}
                      <Lock class="h-4 w-4" /> Khóa
                    {:else}
                      <Unlock class="h-4 w-4" /> Mở khóa
                    {/if}
                  </button>
                </div>

                <div class="rounded-[6px] bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
                  <Eye class="mr-1 inline h-3.5 w-3.5" />
                  Giai đoạn sau nên thêm xem dưới quyền chủ trọ để support, nhưng chưa bật khi backend chưa có audit log.
                </div>
              </div>
            </div>
          {/if}
        </aside>
      </section>
    {/if}
  </main>

  {#if isEditOpen && selectedLandlord}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onclick={() => (isEditOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (isEditOpen = false)}
      role="button"
      tabindex="0"
    >
      <div
        class="relative flex w-full max-w-md animate-[scale-up_0.2s_ease-out] flex-col gap-4 rounded-lg border-2 border-black bg-white p-6"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-black text-black">Cấp gói dịch vụ</h2>
            <p class="mt-1 text-xs font-bold text-zinc-500">{selectedLandlord.user.name}</p>
          </div>
          <button
            onclick={() => (isEditOpen = false)}
            class="rounded-lg border-2 border-black bg-white p-1.5 text-black transition-colors hover:bg-zinc-100"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <form onsubmit={handleUpdateSubscription} class="space-y-4">
          <div class="space-y-1">
            <label for="sub-level" class="block text-xs font-bold text-zinc-600">Gói đăng ký</label>
            <select
              id="sub-level"
              bind:value={subType}
              required
              class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="FREE">Gói miễn phí (FREE)</option>
              <option value="PREMIUM">Gói nâng cao (PREMIUM)</option>
              <option value="ENTERPRISE">Gói doanh nghiệp (ENTERPRISE)</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="sub-valid" class="block text-xs font-bold text-zinc-600">Hạn gói dịch vụ</label>
            <input
              id="sub-valid"
              type="date"
              bind:value={subValid}
              class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span class="mt-1 block text-[10px] font-bold text-zinc-400">
              Để trống nếu không muốn giới hạn thời hạn.
            </span>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onclick={() => (isEditOpen = false)}
              class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-zinc-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black transition-colors hover:bg-blue-400 disabled:opacity-50"
            >
              {#if isSaving}
                <Loader2 class="h-4 w-4 animate-spin" />
              {:else}
                <Check class="h-4 w-4" />
              {/if}
              Lưu gói
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
