<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import {
    Wrench,
    Gauge,
    Home,
    LogOut,
    Loader2,
    Check,
    X,
    User,
    AlertTriangle,
    Building2,
    Image as ImageIcon
  } from '@lucide/svelte';

  interface Request {
    id: string;
    roomNumber: string;
    buildingName: string;
    category: string;
    title: string;
    description: string;
    imageUrl: string | null;
    status: string;
    priority: string;
    createdAt: string;
    response: string | null;
    tenant: { user: { name: string; phone: string } };
  }

  interface Meter {
    id: string;
    month: string;
    prevValue: number;
    currValue: number;
    recordedAt: string;
    photoUrl: string | null;
    status: string;
    isAnomalous: boolean;
    roomNumber: string;
    propertyName: string;
    serviceName: string;
  }

  interface Room {
    id: string;
    roomNumber: string;
    status: string;
    monthlyRent: number;
    property: { shortName: string } | null;
    tenant: { user: { name: string; phone: string } } | null;
  }

  let staffId = $state<string | null>(null);
  let landlordId = $state<string | null>(null); // staffLandlordId — chủ trọ mà nhân viên phục vụ
  let staffName = $state('');

  let activeTab = $state<'requests' | 'meters' | 'rooms'>('requests');
  let isLoading = $state(true);

  let requests = $state<Request[]>([]);
  let meters = $state<Meter[]>([]);
  let rooms = $state<Room[]>([]);

  // Chi tiết sự cố
  let selectedRequest = $state<Request | null>(null);
  let replyText = $state('');
  let isSubmitting = $state(false);

  onMount(() => {
    const sessionStr = localStorage.getItem('roomio_user');
    if (!sessionStr) {
      goto('/login');
      return;
    }
    try {
      const session = JSON.parse(sessionStr);
      if (session.role !== 'STAFF') {
        toast.error('Bạn không có quyền truy cập cổng nhân viên');
        goto('/login');
        return;
      }
      staffId = session.staffProfileId;
      landlordId = session.staffLandlordId;
      staffName = session.name;
      loadAll();
    } catch (e) {
      localStorage.removeItem('roomio_user');
      goto('/login');
    }
  });

  async function loadAll() {
    isLoading = true;
    await Promise.all([loadRequests(), loadMeters(), loadRooms()]);
    isLoading = false;
  }

  async function loadRequests() {
    if (!staffId) return;
    try {
      const res = await fetch(`/api/requests?staffId=${staffId}`);
      const data = await res.json();
      if (res.ok) requests = data;
    } catch (e) {
      // bỏ qua
    }
  }

  async function loadMeters() {
    if (!landlordId) return;
    try {
      const res = await fetch(`/api/meter-readings?landlordId=${landlordId}&status=pending`);
      const data = await res.json();
      if (res.ok) meters = data;
    } catch (e) {
      // bỏ qua
    }
  }

  async function loadRooms() {
    if (!landlordId) return;
    try {
      const res = await fetch(`/api/rooms?landlordId=${landlordId}`);
      const data = await res.json();
      if (res.ok) rooms = data;
    } catch (e) {
      // bỏ qua
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      });
    } catch {
      // Bỏ qua lỗi mạng, vẫn xóa phiên phía client
    }
    localStorage.removeItem('roomio_user');
    toast.success('Đã đăng xuất');
    goto('/login');
  }

  function openRequest(req: Request) {
    selectedRequest = req;
    replyText = req.response || '';
  }

  async function updateRequest(status: string) {
    if (!selectedRequest || isSubmitting) return;
    isSubmitting = true;
    try {
      const res = await fetch('/api/requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRequest.id, status, response: replyText || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật sự cố');
      toast.success(`Đã cập nhật: ${getStatusLabel(status)}`);
      selectedRequest = null;
      replyText = '';
      loadRequests();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      isSubmitting = false;
    }
  }

  async function reviewMeter(m: Meter, action: 'approve' | 'reject') {
    try {
      const res = await fetch('/api/meter-readings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: m.id,
          action,
          prevValue: Number(m.prevValue),
          currValue: Number(m.currValue)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi duyệt chỉ số');
      toast.success(action === 'approve' ? 'Đã chốt chỉ số' : 'Đã từ chối chỉ số');
      loadMeters();
    } catch (err: any) {
      toast.error(err.message);
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

  function statusBadgeClass(status: string): string {
    if (status === 'completed') return 'bg-green-200 text-green-800';
    if (status === 'in_progress') return 'bg-blue-300 text-black';
    if (status === 'rejected') return 'bg-zinc-200 text-zinc-600';
    return 'bg-red-200 text-red-800';
  }

  const openRequestCount = $derived(
    requests.filter((r) => r.status === 'pending' || r.status === 'in_progress').length
  );
</script>

<svelte:head>
  <title>Roomio — Cổng Nhân Viên</title>
</svelte:head>

<div class="relative min-h-screen overflow-hidden bg-white font-sans text-black">
  <div class="roomio-grid-bg fixed inset-0 -z-10 opacity-60"></div>
  <div class="fixed inset-0 -z-10 bg-gradient-to-b from-white/90 via-white/70 to-white/95"></div>
  <!-- Header -->
  <header class="sticky top-0 z-30 mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
    <div class="flex items-center gap-3">
      <div class="rounded-full border-[3px] border-black bg-blue-200 p-2 shadow-secondary">
        <Building2 class="h-5 w-5 text-black" />
      </div>
      <div class="leading-none">
        <p class="text-[10px] font-bold uppercase tracking-wider text-blue-500">Roomio Staff</p>
        <h1 class="mt-1 text-xl font-black tracking-tight text-black">Cổng nhân viên</h1>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div class="hidden text-right sm:block">
        <p class="text-sm font-black leading-none text-black">{staffName}</p>
        <p class="mt-0.5 text-[10px] font-bold text-zinc-500">Nhân viên quản lý</p>
      </div>
      <button
        onclick={handleLogout}
        class="roomio-button-white px-3 py-2 text-xs"
      >
        Đăng xuất <LogOut class="h-4 w-4" />
      </button>
    </div>
  </header>

  <!-- Tabs -->
  <div class="sticky top-[76px] z-20 mx-auto flex max-w-5xl gap-2 overflow-x-auto border-y-2 border-black bg-white/95 px-4 py-2 backdrop-blur sm:px-6">
    <button
      onclick={() => (activeTab = 'requests')}
      class="flex shrink-0 items-center gap-1.5 rounded-[6px] border-2 px-3 py-2 text-xs font-black transition-all {activeTab === 'requests' ? 'border-black bg-blue-300 text-black shadow-secondary' : 'border-black bg-white text-zinc-600 hover:bg-blue-100 hover:text-black'}"
    >
      <Wrench class="h-4 w-4" /> Sự cố được giao
      {#if openRequestCount > 0}
        <span class="rounded-full border border-black bg-red-500 px-1.5 text-[9px] text-black">{openRequestCount}</span>
      {/if}
    </button>
    <button
      onclick={() => (activeTab = 'meters')}
      class="flex shrink-0 items-center gap-1.5 rounded-[6px] border-2 px-3 py-2 text-xs font-black transition-all {activeTab === 'meters' ? 'border-black bg-blue-300 text-black shadow-secondary' : 'border-black bg-white text-zinc-600 hover:bg-blue-100 hover:text-black'}"
    >
      <Gauge class="h-4 w-4" /> Chốt số điện nước
      {#if meters.length > 0}
        <span class="rounded-full border border-black bg-red-500 px-1.5 text-[9px] text-black">{meters.length}</span>
      {/if}
    </button>
    <button
      onclick={() => (activeTab = 'rooms')}
      class="flex shrink-0 items-center gap-1.5 rounded-[6px] border-2 px-3 py-2 text-xs font-black transition-all {activeTab === 'rooms' ? 'border-black bg-blue-300 text-black shadow-secondary' : 'border-black bg-white text-zinc-600 hover:bg-blue-100 hover:text-black'}"
    >
      <Home class="h-4 w-4" /> Phòng & Khách
    </button>
  </div>

  <main class="mx-auto max-w-5xl p-4 sm:p-6">
    {#if isLoading}
      <div class="flex h-[50vh] w-full items-center justify-center">
        <Loader2 class="h-10 w-10 animate-spin text-black" />
      </div>
    {:else if activeTab === 'requests'}
      <!-- TAB: Sự cố được giao -->
      {#if requests.length === 0}
        <div class="roomio-blue-card mx-auto max-w-md p-12 text-center">
          <Wrench class="mx-auto h-7 w-7" />
          <h3 class="mt-2 text-lg font-black text-black">Chưa có sự cố nào được giao</h3>
          <p class="mt-2 text-sm font-semibold text-zinc-600">Khi chủ trọ giao việc, sự cố sẽ xuất hiện ở đây.</p>
        </div>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2">
          {#each requests as req}
            <button
              onclick={() => openRequest(req)}
              class="roomio-card cursor-pointer p-5 text-left transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none"
            >
              <div class="mb-3 flex items-start justify-between gap-2">
                <span class="rounded-full border border-black px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider {statusBadgeClass(req.status)}">
                  {getStatusLabel(req.status)}
                </span>
                {#if req.priority === 'important'}
                  <span class="rounded-full border border-black bg-red-500 px-2 py-0.5 text-[9px] font-black uppercase text-black">Gấp</span>
                {/if}
              </div>
              <h3 class="truncate text-base font-black leading-tight text-black">{req.title}</h3>
              <p class="mt-1 truncate text-xs font-semibold text-zinc-600">{req.buildingName} - Phòng {req.roomNumber}</p>
              <p class="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-zinc-500">{req.description}</p>
              <div class="mt-4 flex items-center gap-1.5 border-t border-black/15 pt-3 text-xs font-bold text-zinc-600">
                <User class="h-4 w-4 text-black" />
                {req.tenant.user.name} · {req.tenant.user.phone}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'meters'}
      <!-- TAB: Chốt số điện nước -->
      {#if meters.length === 0}
        <div class="roomio-blue-card mx-auto max-w-md p-12 text-center">
          <Gauge class="mx-auto h-7 w-7" />
          <h3 class="mt-2 text-lg font-black text-black">Không có chỉ số chờ duyệt</h3>
          <p class="mt-2 text-sm font-semibold text-zinc-600">Các chỉ số khách gửi đang chờ sẽ hiện ở đây để bạn chốt.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each meters as m}
            <div class="roomio-card p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-black text-black">
                    {m.propertyName} - Phòng {m.roomNumber}
                    <span class="ml-1 rounded border border-black bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold">{m.serviceName}</span>
                  </p>
                  <p class="mt-0.5 text-[11px] font-bold text-zinc-500">Tháng {m.month} · gửi ngày {new Date(m.recordedAt).toLocaleDateString('vi-VN')}</p>
                </div>
                {#if m.isAnomalous}
                  <span class="flex items-center gap-1 rounded-full border border-black bg-yellow-200 px-2 py-0.5 text-[10px] font-black text-yellow-800">
                    <AlertTriangle class="h-3 w-3" /> Lệch bất thường
                  </span>
                {/if}
              </div>

              <div class="mt-3 flex flex-wrap items-end gap-3">
                <div class="space-y-1">
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chỉ số cũ</span>
                  <input type="number" bind:value={m.prevValue} class="w-24 rounded-lg border-2 border-black px-2 py-1.5 text-center text-xs font-black text-black focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div class="space-y-1">
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chỉ số mới</span>
                  <input type="number" bind:value={m.currValue} class="w-24 rounded-lg border-2 border-black px-2 py-1.5 text-center text-xs font-black text-black focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div class="space-y-1">
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tiêu thụ</span>
                  <p class="py-1.5 text-sm font-black text-blue-600">{m.currValue - m.prevValue}</p>
                </div>
                {#if m.photoUrl}
                  <a href={m.photoUrl} target="_blank" rel="noreferrer" class="flex items-center gap-1 rounded-[6px] border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold text-black shadow-secondary transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">
                    <ImageIcon class="h-3.5 w-3.5" /> Ảnh
                  </a>
                {/if}
                <div class="ml-auto flex gap-2">
                  <button onclick={() => reviewMeter(m, 'reject')} class="flex items-center gap-1 rounded-[6px] border-2 border-black bg-red-200 px-3 py-1.5 text-xs font-black text-red-800 shadow-secondary transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">
                    <X class="h-4 w-4" /> Từ chối
                  </button>
                  <button onclick={() => reviewMeter(m, 'approve')} class="flex items-center gap-1 rounded-[6px] border-2 border-black bg-green-200 px-3 py-1.5 text-xs font-black text-green-800 shadow-secondary transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">
                    <Check class="h-4 w-4" /> Chốt số
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'rooms'}
      <!-- TAB: Phòng & Khách (chỉ đọc) -->
      {#if rooms.length === 0}
        <div class="roomio-blue-card mx-auto max-w-md p-12 text-center">
          <Home class="mx-auto h-7 w-7" />
          <h3 class="mt-2 text-lg font-black text-black">Chưa có phòng nào</h3>
        </div>
      {:else}
        <div class="roomio-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm">
              <thead>
                <tr class="border-b-2 border-black bg-blue-300 text-xs font-black uppercase text-black">
                  <th class="px-4 py-3">Phòng</th>
                  <th class="px-4 py-3">Cơ sở</th>
                  <th class="px-4 py-3">Khách thuê</th>
                  <th class="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {#each rooms as room}
                  <tr class="border-b border-black/15 font-semibold text-black">
                    <td class="px-4 py-3 font-black">Phòng {room.roomNumber}</td>
                    <td class="px-4 py-3">{room.property?.shortName ?? '—'}</td>
                    <td class="px-4 py-3">
                      {#if room.tenant}
                        {room.tenant.user.name} · {room.tenant.user.phone}
                      {:else}
                        <span class="font-bold text-zinc-400">Trống</span>
                      {/if}
                    </td>
                    <td class="px-4 py-3">
                      {#if room.status === 'paid'}
                        <span class="rounded-full border border-black bg-green-200 px-2 py-0.5 text-[10px] font-black uppercase text-green-800">Đã thu</span>
                      {:else if room.status === 'debt'}
                        <span class="rounded-full border border-black bg-red-200 px-2 py-0.5 text-[10px] font-black uppercase text-red-800">Còn nợ</span>
                      {:else}
                        <span class="rounded-full border border-black bg-zinc-200 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">Trống</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  </main>
</div>

<!-- Chi tiết sự cố + cập nhật -->
{#if selectedRequest}
  <div
    class="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
    onclick={() => (selectedRequest = null)}
    onkeydown={(e) => e.key === 'Escape' && (selectedRequest = null)}
    role="button"
    tabindex="0"
  >
    <div
      class="flex h-full w-full max-w-lg flex-col justify-between overflow-hidden border-l-2 border-black bg-white shadow-primary"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
    >
      <div class="flex shrink-0 items-center gap-2 border-b-2 border-black bg-zinc-50 px-4 py-3 select-none">
        <Wrench class="h-4 w-4 text-blue-500" />
        <span class="text-xs font-black text-zinc-600">Chi tiết sự cố được giao</span>
        <button onclick={() => (selectedRequest = null)} class="ml-auto cursor-pointer rounded-[6px] border border-transparent p-1 text-black hover:bg-zinc-200">
          <X class="h-4.5 w-4.5" />
        </button>
      </div>

      <div class="flex-1 space-y-5 overflow-y-auto p-6">
        <div>
          <h3 class="text-lg font-black leading-tight text-black">{selectedRequest.title}</h3>
          <p class="mt-1 text-xs font-bold text-zinc-600">
            {selectedRequest.buildingName} - Phòng {selectedRequest.roomNumber} · {getCategoryLabel(selectedRequest.category)}
          </p>
        </div>

        <div class="rounded-lg border-2 border-black bg-white p-4 text-xs font-semibold leading-relaxed text-zinc-700 shadow-secondary">
          {selectedRequest.description}
        </div>

        <div class="rounded-lg border-2 border-black bg-zinc-50 p-3 text-xs font-bold text-black">
          Khách báo: {selectedRequest.tenant.user.name} · {selectedRequest.tenant.user.phone}
        </div>

        {#if selectedRequest.imageUrl}
          <img src={selectedRequest.imageUrl} alt="Ảnh sự cố" class="max-h-64 w-full rounded-lg border-2 border-black object-contain shadow-secondary" />
        {/if}

        <div class="space-y-2">
          <label for="staff-reply" class="block text-xs font-black uppercase tracking-wider text-zinc-600">Ghi chú / biên bản xử lý</label>
          <textarea
            id="staff-reply"
            bind:value={replyText}
            rows="3"
            placeholder="Ghi lại tình trạng, cách xử lý, ngày hoàn thành..."
            class="w-full rounded-lg border-2 border-black p-3 text-xs font-semibold text-black focus:outline-none focus:ring-2 focus:ring-blue-300"
          ></textarea>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap gap-3 border-t-2 border-black bg-zinc-100 p-4">
        <button onclick={() => updateRequest('in_progress')} disabled={isSubmitting} class="min-w-[100px] flex-1 cursor-pointer rounded-[6px] border-2 border-black bg-blue-300 py-2.5 text-xs font-black text-black shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
          Đang sửa
        </button>
        <button onclick={() => updateRequest('completed')} disabled={isSubmitting} class="flex min-w-[100px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-2 border-black bg-green-200 py-2.5 text-xs font-black text-green-800 shadow-secondary transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
          Đã xong <Check class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
{/if}
