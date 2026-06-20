<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { 
    X, 
    Check, 
    Users, 
    Lock, 
    Unlock, 
    Calendar,
    Search,
    Loader2,
    LogOut,
    Sliders,
    Building2,
    DollarSign,
    Award
  } from '@lucide/svelte';

  interface Landlord {
    id: string;
    userId: string;
    subscriptionType: string; // FREE, PREMIUM, ENTERPRISE
    subValidUntil: string | null;
    companyName: string | null;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string;
      isActive: boolean;
    };
    properties: {
      id: string;
      name: string;
      _count: {
        rooms: number;
      };
    }[];
  }

  let adminName = $state('');
  let isLoading = $state(true);
  let landlords = $state<Landlord[]>([]);
  let selectedLandlord = $state<Landlord | null>(null);
  
  // Modals & form state
  let isEditOpen = $state(false);
  let subType = $state('FREE');
  let subValid = $state('');
  let isSaving = $state(false);

  // Search filter
  let searchQuery = $state('');

  onMount(() => {
    const sessionStr = localStorage.getItem('roomio_user');
    if (!sessionStr) {
      goto('/login');
      return;
    }
    const session = JSON.parse(sessionStr);
    if (session.role !== 'SUPER_ADMIN') {
      toast.error('Bạn không có quyền truy cập trang Quản Trị Hệ Thống');
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
      if (res.ok) landlords = data;
    } catch (e: any) {
      toast.error('Lỗi khi tải danh sách chủ trọ: ' + e.message);
    } finally {
      isLoading = false;
    }
  }

  async function handleToggleStatus(userId: string, currentActive: boolean) {
    const actionLabel = currentActive ? 'Khóa' : 'Mở khóa';
    if (!confirm(`Bạn có chắc muốn ${actionLabel.toLowerCase()} tài khoản chủ trọ này?`)) return;

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

      toast.success(`Đã cập nhật gói dịch vụ cho chủ trọ ${selectedLandlord.user.name}`);
      isEditOpen = false;
      selectedLandlord = null;
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

  const filteredLandlords = $derived(() => {
    if (!searchQuery.trim()) return landlords;
    const query = searchQuery.toLowerCase();
    return landlords.filter(l => 
      l.user.name.toLowerCase().includes(query) ||
      (l.companyName && l.companyName.toLowerCase().includes(query)) ||
      l.user.email.toLowerCase().includes(query) ||
      l.user.phone.includes(query)
    );
  });
</script>

<div class="relative min-h-screen overflow-hidden bg-white font-sans text-black">
  <div class="roomio-grid-bg fixed inset-0 -z-10 opacity-60"></div>
  <div class="fixed inset-0 -z-10 bg-gradient-to-b from-white/90 via-white/70 to-white/95"></div>
  <!-- Top bar -->
  <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-6">
    <div class="flex items-center gap-3">
      <div>
        <img
          src="/brand/roomio-wordmark-blue600.png"
          alt="Roomio"
          class="h-auto w-36"
        />
        <h1 class="mt-1 text-2xl font-black tracking-tight text-black">SuperAdmin</h1>
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <span class="hidden text-sm font-semibold text-zinc-600 sm:inline">Chào Admin, {adminName}</span>
      <button 
        onclick={handleLogout}
        class="roomio-button-white px-3 py-2 text-xs"
      >
        Đăng xuất
        <LogOut class="h-4.5 w-4.5" />
      </button>
    </div>
  </header>

  <!-- Main panel wrapper -->
  <main class="relative z-10 mx-auto max-w-7xl space-y-6 px-5 pb-10 sm:px-6">
    <!-- Quick stats grid -->
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="roomio-card flex items-center gap-4 p-5">
        <div class="rounded-lg border-2 border-black bg-blue-100 p-3 text-black">
          <Users class="h-6 w-6" />
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-zinc-500">Tổng chủ trọ vận hành</p>
          <h3 class="mt-1 text-2xl font-black text-black">{landlords.length} chủ trọ</h3>
        </div>
      </div>
      <div class="roomio-card flex items-center gap-4 p-5">
        <div class="rounded-lg border-2 border-black bg-green-100 p-3 text-green-800">
          <Award class="h-6 w-6" />
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-zinc-500">Đối tác Premium</p>
          <h3 class="mt-1 text-2xl font-black text-black">
            {landlords.filter(l => l.subscriptionType !== 'FREE').length} đối tác
          </h3>
        </div>
      </div>
      <div class="roomio-card flex items-center gap-4 p-5">
        <div class="rounded-lg border-2 border-black bg-yellow-100 p-3 text-yellow-800">
          <Building2 class="h-6 w-6" />
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-zinc-500">Tổng số phòng quản lý</p>
          <h3 class="mt-1 text-2xl font-black text-black">
            {landlords.reduce((sum, l) => sum + l.properties.reduce((s, p) => s + p._count.rooms, 0), 0)} phòng
          </h3>
        </div>
      </div>
    </div>

    <!-- Search and controls -->
    <div class="roomio-card flex items-center gap-3 p-4">
      <Search class="h-5 w-5 shrink-0 text-black" />
      <input 
        type="text" 
        bind:value={searchQuery}
        placeholder="Tìm kiếm chủ trọ theo tên, công ty, email hoặc số điện thoại..."
        class="w-full bg-transparent text-sm font-semibold text-black outline-none"
      />
    </div>

    {#if isLoading}
      <div class="h-[40vh] w-full flex items-center justify-center">
        <Loader2 class="h-10 w-10 animate-spin text-black" />
      </div>
    {:else if filteredLandlords().length === 0}
      <div class="roomio-blue-card p-12 text-center">
        <p class="text-sm font-semibold text-zinc-600">Không tìm thấy chủ trọ nào khớp với từ khóa tìm kiếm.</p>
      </div>
    {:else}
      <!-- Landlords registry list -->
      <div class="roomio-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b-2 border-black bg-blue-300 text-xs font-black uppercase text-black">
                <th class="px-6 py-4">Họ và tên</th>
                <th class="px-6 py-4">Thương hiệu</th>
                <th class="px-6 py-4">Tài khoản liên hệ</th>
                <th class="px-6 py-4">Tòa nhà (Phòng)</th>
                <th class="px-6 py-4">Gói dịch vụ</th>
                <th class="px-6 py-4">Thời hạn gói</th>
                <th class="px-6 py-4">Trạng thái</th>
                <th class="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredLandlords() as landlord}
                {@const totalRooms = landlord.properties.reduce((sum, p) => sum + p._count.rooms, 0)}
                <tr class="border-b border-black/15 text-black transition-colors hover:bg-blue-50">
                  <td class="px-6 py-4 font-black text-black">{landlord.user.name}</td>
                  <td class="px-6 py-4 font-medium">{landlord.companyName || '--'}</td>
                  <td class="px-6 py-4">
                    <p class="font-bold text-black">{landlord.user.phone}</p>
                    <p class="text-xs text-slate-400">{landlord.user.email}</p>
                  </td>
                  <td class="px-6 py-4">
                    <span class="font-black text-black">{landlord.properties.length}</span> tòa nhà
                    <span class="text-xs text-slate-400 font-medium block">({totalRooms} phòng trọ)</span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase {landlord.subscriptionType === 'FREE' ? 'bg-slate-100 text-slate-600' : landlord.subscriptionType === 'PREMIUM' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-700'}">
                      {landlord.subscriptionType}
                    </span>
                  </td>
                  <td class="px-6 py-4 font-semibold text-slate-700">
                    {landlord.subValidUntil ? new Date(landlord.subValidUntil).toLocaleDateString('vi-VN') : 'Vĩnh viễn'}
                  </td>
                  <td class="px-6 py-4">
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase {landlord.user.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">
                      {landlord.user.isActive ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-right flex items-center justify-end gap-2">
                    <button
                      onclick={() => handleToggleStatus(landlord.userId, landlord.user.isActive)}
                    class="cursor-pointer rounded-lg border-2 border-black bg-white p-1.5 text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                      title={landlord.user.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                    >
                      {#if landlord.user.isActive}
                        <Lock class="h-4 w-4 text-red-500" />
                      {:else}
                        <Unlock class="h-4 w-4 text-emerald-500" />
                      {/if}
                    </button>
                    <button
                      onclick={() => { 
                        selectedLandlord = landlord; 
                        subType = landlord.subscriptionType; 
                        subValid = landlord.subValidUntil ? landlord.subValidUntil.split('T')[0] : '';
                        isEditOpen = true; 
                      }}
                      class="cursor-pointer rounded-lg border-2 border-black bg-white p-1.5 text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                      title="Nâng cấp gói"
                    >
                      <Sliders class="h-4 w-4 text-indigo-500" />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </main>

  <!-- Edit subscription level dialog -->
  {#if isEditOpen && selectedLandlord}
    <div 
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onclick={() => isEditOpen = false}
      onkeydown={(e) => e.key === 'Escape' && (isEditOpen = false)}
      role="button"
      tabindex="0"
    >
      <div 
        class="roomio-card relative flex w-full max-w-md animate-[scale-up_0.2s_ease-out] flex-col gap-4 p-6"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div class="flex items-center justify-between border-b-2 border-black pb-3">
          <h2 class="text-lg font-black text-black">Cấp gói dịch vụ Roomio</h2>
          <button onclick={() => isEditOpen = false} class="rounded-lg border-2 border-black bg-white p-1.5 text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
            <X class="h-5 w-5" />
          </button>
        </div>

        <form onsubmit={handleUpdateSubscription} class="space-y-4">
          <div class="rounded-lg border-2 border-black bg-blue-100 p-3 text-xs font-semibold text-zinc-700">
            <p class="font-black text-black">Khách hàng: {selectedLandlord.user.name}</p>
            <p class="mt-1">Thương hiệu: {selectedLandlord.companyName || '--'}</p>
          </div>

          <div class="space-y-1">
            <label for="sub-level" class="block text-xs font-bold uppercase tracking-wider text-zinc-600">Chọn gói đăng ký</label>
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
            <label for="sub-valid" class="block text-xs font-bold uppercase tracking-wider text-zinc-600">Hạn gói dịch vụ</label>
            <input 
              id="sub-valid"
              type="date" 
              bind:value={subValid}
              class="w-full rounded-lg border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span class="text-[10px] text-slate-400 block mt-1">Để trống nếu muốn đặt hạn vĩnh viễn cho gói FREE.</span>
          </div>

          <div class="flex justify-end gap-3 border-t-2 border-black pt-3">
            <button 
              type="button" 
              onclick={() => isEditOpen = false}
              class="cursor-pointer rounded-[6px] border-2 border-black bg-white px-4 py-2 text-xs font-bold text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              Hủy
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              class="flex cursor-pointer items-center gap-1 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-xs font-black text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
            >
              {#if isSaving}
                <Loader2 class="h-4.5 w-4.5 animate-spin" />
              {/if}
              Xác nhận gia hạn
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes scale-up {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
