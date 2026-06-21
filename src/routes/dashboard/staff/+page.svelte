<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    UserCog,
    Plus,
    X,
    Mail,
    Phone,
    Loader2,
    Pencil,
    Trash2,
    ShieldCheck,
    ShieldOff
  } from '@lucide/svelte';

  interface Staff {
    id: string;
    userId: string;
    landlordId: string;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string;
      isActive: boolean;
    };
  }

  let landlordId = $state<string | null>(null);
  let isLoading = $state(true);
  let staffList = $state<Staff[]>([]);

  // Dialog & form
  let isDialogOpen = $state(false);
  let isSubmitting = $state(false);
  let editingId = $state<string | null>(null); // null = thêm mới, có id = đang sửa

  let name = $state('');
  let phone = $state('');
  let email = $state('');
  let password = $state('');

  const activeCount = $derived(staffList.filter((s) => s.user.isActive).length);

  onMount(() => {
    const sessionStr = localStorage.getItem('roomio_user');
    if (!sessionStr) return;
    const session = JSON.parse(sessionStr);
    landlordId = session.landlordProfileId;
    fetchStaff(session.landlordProfileId);
  });

  async function fetchStaff(profileId: string) {
    isLoading = true;
    try {
      const res = await fetch(`/api/staff?landlordId=${profileId}`);
      const data = await res.json();
      if (res.ok) staffList = data;
      else toast.error(data.error || 'Lỗi khi tải danh sách nhân viên');
    } catch (e: any) {
      toast.error('Lỗi khi tải danh sách nhân viên: ' + e.message);
    } finally {
      isLoading = false;
    }
  }

  function openAdd() {
    editingId = null;
    name = '';
    phone = '';
    email = '';
    password = '';
    isDialogOpen = true;
  }

  function openEdit(staff: Staff) {
    editingId = staff.id;
    name = staff.user.name;
    phone = staff.user.phone;
    email = staff.user.email;
    password = ''; // để trống nếu không đổi mật khẩu
    isDialogOpen = true;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name || !phone || !email) {
      toast.error('Vui lòng nhập đầy đủ tên, số điện thoại và email');
      return;
    }
    if (!editingId && !password) {
      toast.error('Vui lòng đặt mật khẩu cho nhân viên mới');
      return;
    }

    isSubmitting = true;
    try {
      const isEdit = editingId !== null;
      const res = await fetch('/api/staff', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: editingId, name, phone, email, password: password || undefined }
            : { name, phone, email, password }
        )
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi lưu thông tin nhân viên');

      toast.success(isEdit ? 'Đã cập nhật nhân viên' : `Đã tạo tài khoản cho nhân viên ${name}`);
      isDialogOpen = false;
      if (landlordId) fetchStaff(landlordId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      isSubmitting = false;
    }
  }

  async function toggleActive(staff: Staff) {
    try {
      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staff.id, isActive: !staff.user.isActive })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật trạng thái');
      toast.success(staff.user.isActive ? 'Đã khóa tài khoản nhân viên' : 'Đã mở khóa nhân viên');
      if (landlordId) fetchStaff(landlordId);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDelete(staff: Staff) {
    if (!confirm(`Xóa vĩnh viễn tài khoản nhân viên "${staff.user.name}"?`)) return;
    try {
      const res = await fetch(`/api/staff?id=${staff.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa nhân viên');
      toast.success('Đã xóa nhân viên');
      if (landlordId) fetchStaff(landlordId);
    } catch (err: any) {
      toast.error(err.message);
    }
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 class="text-xl sm:text-2xl font-black text-black">Quản Lý Nhân Viên</h1>
      <p class="text-zinc-600 text-xs sm:text-sm mt-1 font-bold">
        Tài khoản nhân viên giúp xử lý sự cố và chốt số điện nước cho dàn trọ của bạn
      </p>
    </div>
    <button
      onclick={() => window.setTimeout(openAdd, 200)}
      class="bg-blue-300 text-black border-2 border-black px-4 py-2.5 rounded-[6px] shadow-secondary transition-all flex items-center gap-1.5 cursor-pointer font-black text-sm w-full sm:w-auto justify-center sm:justify-start"
    >
      Thêm nhân viên <Plus class="h-4 w-4" />
    </button>
  </div>

  <!-- Quick stats -->
  <div class="grid grid-cols-2 gap-3">
    <div class="bg-white border-2 border-black p-4 rounded-lg shadow-secondary">
      <UserCog class="h-5 w-5 text-blue-500 mb-2" />
      <p class="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Tổng nhân viên</p>
      <h3 class="text-base sm:text-xl font-black text-black mt-0.5">{staffList.length} người</h3>
    </div>
    <div class="bg-white border-2 border-black p-4 rounded-lg shadow-secondary">
      <ShieldCheck class="h-5 w-5 text-green-600 mb-2" />
      <p class="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Đang hoạt động</p>
      <h3 class="text-base sm:text-xl font-black text-black mt-0.5">{activeCount} người</h3>
    </div>
  </div>

  {#if isLoading}
    <div class="h-[40vh] w-full flex items-center justify-center">
      <Loader2 class="h-10 w-10 text-black animate-spin" />
    </div>
  {:else if staffList.length === 0}
    <div class="bg-white border-2 border-black p-12 rounded-lg text-center max-w-md mx-auto shadow-secondary">
      <UserCog class="h-7 w-7 mx-auto" />
      <h3 class="font-black text-black text-lg mt-2">Chưa có nhân viên nào</h3>
      <p class="text-zinc-600 text-sm mt-2 font-semibold">
        Tạo tài khoản nhân viên để giao xử lý sự cố và chốt số điện nước thay bạn.
      </p>
    </div>
  {:else}
    <!-- Staff list -->
    <div class="bg-white border-2 border-black rounded-lg shadow-secondary overflow-hidden">
      <!-- Mobile card list -->
      <div class="sm:hidden divide-y-2 divide-black bg-white">
        {#each staffList as staff}
          <div class="p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-black text-black text-sm">{staff.user.name}</p>
                <p class="text-xs text-zinc-500 font-bold mt-0.5">{staff.user.phone}</p>
              </div>
              {#if staff.user.isActive}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-black uppercase border border-black bg-green-200 text-green-800 shrink-0">Hoạt động</span>
              {:else}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-black uppercase border border-black bg-zinc-200 text-zinc-600 shrink-0">Đã khóa</span>
              {/if}
            </div>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button onclick={() => toggleActive(staff)} class="px-2.5 py-1.5 border-2 border-black bg-white text-black rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">
                {staff.user.isActive ? 'Khóa' : 'Mở'}
              </button>
              <button onclick={() => window.setTimeout(() => openEdit(staff), 200)} class="px-2.5 py-1.5 border-2 border-black bg-white text-black rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">
                Sửa
              </button>
              <button onclick={() => handleDelete(staff)} class="px-2.5 py-1.5 border-2 border-black bg-red-200 text-red-800 rounded-[6px] text-xs font-bold shadow-secondary active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer">
                Xóa
              </button>
            </div>
          </div>
        {/each}
      </div>
      <!-- Desktop table -->
      <div class="hidden sm:block overflow-x-auto bg-white">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="bg-blue-300 border-b-2 border-black text-black font-black uppercase text-xs">
              <th class="px-4 py-3">Tên nhân viên</th>
              <th class="px-4 py-3">Số điện thoại</th>
              <th class="px-4 py-3">Email đăng nhập</th>
              <th class="px-4 py-3">Trạng thái</th>
              <th class="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {#each staffList as staff}
              <tr class="border-b border-black/15 hover:bg-slate-50 transition-all font-semibold text-black">
                <td class="px-4 py-4 font-black">{staff.user.name}</td>
                <td class="px-4 py-4">{staff.user.phone}</td>
                <td class="px-4 py-4">{staff.user.email}</td>
                <td class="px-4 py-4">
                  {#if staff.user.isActive}
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase border border-black bg-green-200 text-green-800">Hoạt động</span>
                  {:else}
                    <span class="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase border border-black bg-zinc-200 text-zinc-600">Đã khóa</span>
                  {/if}
                </td>
                <td class="px-4 py-4">
                  <div class="flex items-center justify-end gap-2">
                    <button onclick={() => toggleActive(staff)} title={staff.user.isActive ? 'Khóa tài khoản' : 'Mở khóa'} class="p-2 border-2 border-black bg-white hover:bg-zinc-150 text-black rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
                      {#if staff.user.isActive}
                        <ShieldOff class="h-4 w-4" />
                      {:else}
                        <ShieldCheck class="h-4 w-4" />
                      {/if}
                    </button>
                    <button onclick={() => window.setTimeout(() => openEdit(staff), 200)} title="Sửa" class="p-2 border-2 border-black bg-white hover:bg-zinc-150 text-black rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
                      <Pencil class="h-4 w-4" />
                    </button>
                    <button onclick={() => handleDelete(staff)} title="Xóa" class="p-2 border-2 border-black bg-red-200 hover:bg-red-300 text-red-800 rounded-[6px] transition-all shadow-secondary active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
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
            {editingId ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
          </span>
          <button onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)} class="ml-auto text-black hover:bg-zinc-200 p-1 border border-transparent rounded-[6px] cursor-pointer">
            <X class="h-4.5 w-4.5" />
          </button>
        </div>

        <form onsubmit={handleSubmit} class="p-6 space-y-4 overflow-y-auto">
          <div class="space-y-1">
            <label for="s-name" class="text-[10px] text-zinc-600 font-bold uppercase tracking-wider block">Họ và tên nhân viên</label>
            <input id="s-name" type="text" bind:value={name} required placeholder="Trần Thị B" class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="s-phone" class="text-[10px] text-zinc-600 font-bold uppercase tracking-wider block">Số điện thoại</label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400"><Phone class="h-3.5 w-3.5" /></span>
                <input id="s-phone" type="tel" bind:value={phone} required placeholder="0987654321" class="w-full pl-8 pr-2.5 py-1.5 border-2 border-black text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
              </div>
            </div>
            <div class="space-y-1">
              <label for="s-email" class="text-[10px] text-zinc-600 font-bold uppercase tracking-wider block">Email đăng nhập</label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-400"><Mail class="h-3.5 w-3.5" /></span>
                <input id="s-email" type="email" bind:value={email} required placeholder="nhanvien@nhatro.com" class="w-full pl-8 pr-2.5 py-1.5 border-2 border-black text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
              </div>
            </div>
          </div>

          <div class="space-y-1">
            <label for="s-pass" class="text-[10px] text-zinc-600 font-bold uppercase tracking-wider block">
              {editingId ? 'Đặt lại mật khẩu (để trống nếu giữ nguyên)' : 'Mật khẩu truy cập'}
            </label>
            <input id="s-pass" type="password" bind:value={password} placeholder={editingId ? '••••••••' : 'Mật khẩu cho nhân viên'} class="w-full border-2 border-black px-2.5 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-semibold text-black" />
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t-2 border-black">
            <button type="button" onclick={() => window.setTimeout(() => (isDialogOpen = false), 200)} class="border-2 border-black bg-white hover:bg-zinc-150 text-black px-4 py-2 rounded-[6px] text-xs font-bold transition-all cursor-pointer">
              Hủy
            </button>
            <button type="submit" disabled={isSubmitting} class="bg-blue-300 hover:bg-blue-400 disabled:opacity-50 text-black border-2 border-black px-4 py-2 rounded-[6px] text-xs font-black shadow-secondary transition-all flex items-center gap-1.5 cursor-pointer">
              {editingId ? 'Lưu thay đổi' : 'Tạo nhân viên'}
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
