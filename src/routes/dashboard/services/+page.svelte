<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Plug, Plus, X, Loader2, Pencil, Trash2, Power, PowerOff } from '@lucide/svelte';

  interface Service {
    id: string;
    landlordId: string;
    name: string;
    type: string; // METERED | FLAT_ROOM | FLAT_PERSON | FLAT_VEHICLE
    defaultRate: number;
    isActive: boolean;
  }

  const TYPE_LABELS: Record<string, string> = {
    METERED: 'Theo đồng hồ (điện/nước)',
    FLAT_ROOM: 'Cố định theo phòng',
    FLAT_PERSON: 'Theo đầu người',
    FLAT_VEHICLE: 'Theo xe'
  };
  const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

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
      toast.error('Vui lòng nhập tên dịch vụ và đơn giá');
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
    if (!confirm(`Xóa dịch vụ "${svc.name}"? Dịch vụ sẽ bị gỡ khỏi các phòng.`)) return;
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
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 class="text-xl sm:text-2xl font-black text-black">Quản Lý Dịch Vụ</h1>
      <p class="text-zinc-600 text-xs sm:text-sm mt-1 font-bold">
        Đơn giá điện, nước, wifi, rác, gửi xe... áp dụng khi lập hóa đơn cho phòng
      </p>
    </div>
    <button
      onclick={() => window.setTimeout(openAdd, 200)}
      class="bg-blue-300 text-black border-2 border-black px-4 py-2.5 rounded-[6px] shadow-secondary transition-all flex items-center gap-1.5 cursor-pointer font-black text-sm w-full sm:w-auto justify-center sm:justify-start"
    >
      Thêm dịch vụ <Plus class="h-4 w-4" />
    </button>
  </div>

  <!-- Quick stats -->
  <div class="grid grid-cols-2 gap-3">
    <div class="bg-white border-2 border-black p-4 rounded-lg shadow-secondary">
      <Plug class="h-5 w-5 text-blue-500 mb-2" />
      <p class="text-zinc-500 text-[10px] font-bold">Tổng dịch vụ</p>
      <h3 class="text-base sm:text-xl font-black text-black mt-0.5">{services.length}</h3>
    </div>
    <div class="bg-white border-2 border-black p-4 rounded-lg shadow-secondary">
      <Power class="h-5 w-5 text-green-600 mb-2" />
      <p class="text-zinc-500 text-[10px] font-bold">Đang áp dụng</p>
      <h3 class="text-base sm:text-xl font-black text-black mt-0.5">{activeCount}</h3>
    </div>
  </div>

  {#if isLoading}
    <div class="h-[40vh] w-full flex items-center justify-center">
      <Loader2 class="h-10 w-10 text-black animate-spin" />
    </div>
  {:else if services.length === 0}
    <div class="bg-white border-2 border-black p-12 rounded-lg text-center max-w-md mx-auto shadow-secondary">
      <Plug class="h-7 w-7 mx-auto" />
      <h3 class="font-black text-black text-lg mt-2">Chưa có dịch vụ nào</h3>
      <p class="text-zinc-600 text-sm mt-2 font-semibold">Thêm dịch vụ để tính vào hóa đơn hàng tháng của khách.</p>
    </div>
  {:else}
    <!-- Service list -->
    <div class="bg-white border-2 border-black rounded-lg shadow-secondary overflow-hidden">
      <!-- Mobile card list -->
      <div class="sm:hidden divide-y-2 divide-black bg-white">
        {#each services as svc}
          <div class="p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-black text-black text-sm">{svc.name}</p>
                <p class="text-xs text-zinc-500 font-bold mt-0.5">{TYPE_LABELS[svc.type] ?? svc.type}</p>
              </div>
              <span class="text-sm font-black text-blue-600 shrink-0">{formatCurrency(svc.defaultRate)}</span>
            </div>
            <div class="flex items-center justify-between">
              {#if svc.isActive}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-black border border-black bg-green-200 text-green-800">Áp dụng</span>
              {:else}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-black border border-black bg-zinc-200 text-zinc-600">Tạm ngưng</span>
              {/if}
              <div class="flex gap-2">
                <button onclick={() => toggleActive(svc)} class="px-2.5 py-1.5 border-2 border-black bg-white text-black rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">{svc.isActive ? 'Ngưng' : 'Bật'}</button>
                <button onclick={() => window.setTimeout(() => openEdit(svc), 200)} class="px-2.5 py-1.5 border-2 border-black bg-white text-black rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">Sửa</button>
                <button onclick={() => handleDelete(svc)} class="px-2.5 py-1.5 border-2 border-black bg-red-200 text-red-800 rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">Xóa</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
      <!-- Desktop table -->
      <div class="hidden sm:block overflow-x-auto bg-white">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="bg-blue-300 border-b-2 border-black text-black font-black text-xs">
              <th class="px-4 py-3">Tên dịch vụ</th>
              <th class="px-4 py-3">Cách tính</th>
              <th class="px-4 py-3">Đơn giá</th>
              <th class="px-4 py-3">Trạng thái</th>
              <th class="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {#each services as svc}
              <tr class="border-b border-black/15 hover:bg-slate-50 transition-all font-semibold text-black">
                <td class="px-4 py-4 font-black">{svc.name}</td>
                <td class="px-4 py-4">{TYPE_LABELS[svc.type] ?? svc.type}</td>
                <td class="px-4 py-4 font-black text-blue-600">{formatCurrency(svc.defaultRate)}</td>
                <td class="px-4 py-4">
                  {#if svc.isActive}
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-black border border-black bg-green-200 text-green-800">Áp dụng</span>
                  {:else}
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-black border border-black bg-zinc-200 text-zinc-600">Tạm ngưng</span>
                  {/if}
                </td>
                <td class="px-4 py-4">
                  <div class="flex items-center justify-end gap-2">
                    <button onclick={() => toggleActive(svc)} title={svc.isActive ? 'Tạm ngưng' : 'Bật lại'} class="p-2 border-2 border-black bg-white hover:bg-zinc-150 text-black rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
                      {#if svc.isActive}
                        <PowerOff class="h-4 w-4" />
                      {:else}
                        <Power class="h-4 w-4" />
                      {/if}
                    </button>
                    <button onclick={() => window.setTimeout(() => openEdit(svc), 200)} title="Sửa" class="p-2 border-2 border-black bg-white hover:bg-zinc-150 text-black rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
                      <Pencil class="h-4 w-4" />
                    </button>
                    <button onclick={() => handleDelete(svc)} title="Xóa" class="p-2 border-2 border-black bg-red-200 hover:bg-red-300 text-red-800 rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
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
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)}
      onkeydown={(e) => e.key === 'Escape' && (isDialogOpen = false)}
      role="button"
      tabindex="0"
    >
      <div
        class="bg-white rounded-lg w-full max-w-md border-2 border-black shadow-primary overflow-hidden relative flex flex-col max-h-[90vh] animate-[scale-up_0.2s_ease-out]"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div class="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b-2 border-black shrink-0 select-none">
          <div class="w-2.5 h-2.5 rounded-full bg-red-500 border border-black"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-black"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-green-500 border border-black"></div>
          <span class="text-xs font-bold text-zinc-500 ml-2 font-black">
            {editingId ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}
          </span>
          <button onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)} class="ml-auto text-black hover:bg-zinc-200 p-1 border border-transparent rounded-[6px] cursor-pointer">
            <X class="h-4.5 w-4.5" />
          </button>
        </div>

        <form onsubmit={handleSubmit} class="p-6 space-y-4 overflow-y-auto">
          <div class="space-y-1">
            <label for="sv-name" class="text-[10px] text-zinc-600 font-bold block">Tên dịch vụ</label>
            <input id="sv-name" type="text" bind:value={name} required placeholder="Ví dụ: Điện, Nước, Wifi, Gửi xe..." class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
          </div>

          <div class="space-y-1">
            <label for="sv-type" class="text-[10px] text-zinc-600 font-bold block">Cách tính tiền</label>
            {#if editingId}
              <input id="sv-type" type="text" value={TYPE_LABELS[type] ?? type} disabled class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg bg-zinc-100 text-zinc-500 font-semibold cursor-not-allowed" />
              <p class="text-[10px] text-zinc-400 font-semibold">Không đổi được cách tính sau khi tạo.</p>
            {:else}
              <select id="sv-type" bind:value={type} class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black">
                {#each TYPE_OPTIONS as opt}
                  <option value={opt}>{TYPE_LABELS[opt]}</option>
                {/each}
              </select>
            {/if}
          </div>

          <div class="space-y-1">
            <label for="sv-rate" class="text-[10px] text-zinc-600 font-bold block">Đơn giá (đ)</label>
            <input id="sv-rate" type="number" bind:value={defaultRate} required min="0" placeholder="Ví dụ: 3500" class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t-2 border-black">
            <button type="button" onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)} class="border-2 border-black bg-white hover:bg-zinc-150 text-black px-4 py-2 rounded-[6px] text-xs font-bold transition-all cursor-pointer">
              Hủy
            </button>
            <button type="submit" disabled={isSubmitting} class="bg-blue-300 hover:bg-blue-400 disabled:opacity-50 text-black border-2 border-black px-4 py-2 rounded-[6px] text-xs font-black shadow-secondary transition-all flex items-center gap-1.5 cursor-pointer">
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
