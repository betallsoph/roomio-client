<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import {
    ArrowLeft,
    ArrowRight,
    BedDouble,
    Building2,
    Gauge,
    Home,
    Loader2,
    Receipt,
    Users
  } from '@lucide/svelte';

  interface Block {
    id: string;
    name: string;
  }

  interface Property {
    id: string;
    name: string;
    shortName: string;
    address: string;
    rentalType: string;
    blocks: Block[];
  }

  interface Tenant {
    user: {
      name: string;
      phone: string;
    };
  }

  interface Room {
    id: string;
    roomNumber: string;
    roomCode: string | null;
    roomType: string;
    floor: number | null;
    status: string;
    monthlyRent: number;
    debtAmount: number | null;
    tenant: Tenant | null;
  }

  let isLoading = $state(true);
  let property = $state<Property | null>(null);
  let rooms = $state<Room[]>([]);

  const propertyId = page.params.propertyId;

  const WORKSPACE_META: Record<
    string,
    {
      label: string;
      unitLabel: string;
      groupLabel: string;
      primaryAction: string;
      workflows: string[];
      billing: string[];
      note?: string;
    }
  > = {
    APARTMENT: {
      label: 'Chung cư',
      unitLabel: 'Căn / phòng',
      groupLabel: 'Block',
      primaryAction: 'Quản lý căn hộ',
      workflows: ['Sơ đồ căn theo block/tầng', 'Hợp đồng theo căn', 'Tài sản bàn giao', 'Phí quản lý và dịch vụ tòa nhà'],
      billing: ['Tiền thuê căn', 'Điện nước theo chỉ số', 'Phí quản lý / gửi xe / dịch vụ']
    },
    MOTEL: {
      label: 'Phòng trọ',
      unitLabel: 'Phòng',
      groupLabel: 'Dãy',
      primaryAction: 'Quản lý phòng trọ',
      workflows: ['Chốt điện nước nhanh theo dãy', 'Số người và số xe', 'Sinh hóa đơn hàng loạt', 'Theo dõi nợ theo phòng'],
      billing: ['Tiền phòng', 'Điện nước', 'Rác / wifi / gửi xe theo phòng, người hoặc xe']
    },
    SERVICED_APARTMENT: {
      label: 'Căn hộ dịch vụ',
      unitLabel: 'Căn dịch vụ',
      groupLabel: 'Tầng / khu',
      primaryAction: 'Quản lý căn dịch vụ',
      workflows: ['Lịch dọn phòng', 'Nội thất và ảnh bàn giao', 'Dịch vụ giặt ủi / vệ sinh', 'Hợp đồng ngắn hoặc trung hạn'],
      billing: ['Tiền thuê căn', 'Dịch vụ cộng thêm', 'Điện nước hoặc gói trọn']
    },
    DORM: {
      label: 'KTX / Sleepbox',
      unitLabel: 'Giường / box',
      groupLabel: 'Phòng / khu',
      primaryAction: 'Quản lý giường / box',
      workflows: ['Check-in/out theo người', 'Quản lý giường hoặc box trong cùng phòng', 'Giới tính / khu yên tĩnh', 'Gói dịch vụ trọn gói'],
      billing: ['Tiền giường / box', 'Dịch vụ trọn gói hoặc chia theo đầu người', 'Cọc chìa khóa / thẻ / locker'],
      note: 'Hiện tại hệ thống vẫn dùng phòng làm đơn vị tạm cho KTX/Sleepbox. Bước tiếp theo sẽ tách thêm Bed/Box dưới Room.'
    }
  };

  onMount(() => {
    loadWorkspace();
  });

  async function loadWorkspace() {
    isLoading = true;
    try {
      const [propertiesRes, roomsRes] = await Promise.all([
        fetch('/api/properties'),
        fetch(`/api/rooms?propertyId=${propertyId}`)
      ]);
      const propertiesData = await propertiesRes.json();
      const roomsData = await roomsRes.json();

      if (!propertiesRes.ok) throw new Error(propertiesData.error || 'Không tải được danh sách cơ sở');
      if (!roomsRes.ok) throw new Error(roomsData.error || 'Không tải được danh sách phòng');

      property = propertiesData.find((item: Property) => item.id === propertyId) ?? null;
      if (!property) {
        toast.error('Không tìm thấy cơ sở này');
        goto('/dashboard/buildings');
        return;
      }

      rooms = roomsData;
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      isLoading = false;
    }
  }

  function meta() {
    return WORKSPACE_META[property?.rentalType ?? 'APARTMENT'] ?? WORKSPACE_META.APARTMENT;
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
  }

  function statusLabel(status: string) {
    if (status === 'paid') return 'Đã đóng';
    if (status === 'debt') return 'Còn nợ';
    return 'Trống';
  }

  function statusClass(status: string) {
    if (status === 'paid') return 'bg-green-100 text-green-800';
    if (status === 'debt') return 'bg-red-100 text-red-800';
    return 'bg-zinc-100 text-zinc-600';
  }

  const stats = $derived(() => {
    const occupiedRooms = rooms.filter((room) => room.tenant || room.status !== 'empty').length;
    return {
      totalRooms: rooms.length,
      occupiedRooms,
      emptyRooms: rooms.filter((room) => room.status === 'empty').length,
      debtRooms: rooms.filter((room) => room.status === 'debt').length,
      rentTotal: rooms.reduce((sum, room) => sum + room.monthlyRent, 0)
    };
  });
</script>

<div class="space-y-6">
  {#if isLoading}
    <div class="flex h-[54vh] items-center justify-center">
      <Loader2 class="h-10 w-10 animate-spin text-black" />
    </div>
  {:else if property}
    <section class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <a href="/dashboard/buildings" class="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:underline">
          <ArrowLeft class="h-4 w-4" /> Cơ sở
        </a>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-black leading-tight text-black">{property.name}</h1>
          <span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-800">{meta().label}</span>
        </div>
        <p class="mt-1 text-sm font-bold text-zinc-500">{property.shortName} · {property.address}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <a href="/dashboard/rooms?propertyId={property.id}" class="roomio-button px-3 py-2 text-xs">
          <Home class="h-4 w-4" /> {meta().primaryAction}
        </a>
        <a href="/dashboard/meters?propertyId={property.id}" class="roomio-button-white px-3 py-2 text-xs">
          <Gauge class="h-4 w-4" /> Chốt số
        </a>
        <a href="/dashboard/invoices/bulk?propertyId={property.id}" class="roomio-button-white px-3 py-2 text-xs">
          <Receipt class="h-4 w-4" /> Hóa đơn
        </a>
      </div>
    </section>

    <section class="flex flex-wrap gap-x-8 gap-y-3 text-sm font-bold">
      <div>
        <span class="text-zinc-500">Đơn vị</span>
        <span class="ml-2 text-lg font-black">{stats().totalRooms}</span>
      </div>
      <div>
        <span class="text-zinc-500">Đang thuê</span>
        <span class="ml-2 text-lg font-black">{stats().occupiedRooms}</span>
      </div>
      <div>
        <span class="text-zinc-500">Trống</span>
        <span class="ml-2 text-lg font-black">{stats().emptyRooms}</span>
      </div>
      <div>
        <span class="text-zinc-500">Còn nợ</span>
        <span class="ml-2 text-lg font-black">{stats().debtRooms}</span>
      </div>
      <div>
        <span class="text-zinc-500">Tiền thuê tháng</span>
        <span class="ml-2 text-lg font-black">{formatCurrency(stats().rentTotal)}</span>
      </div>
    </section>

    <section class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="space-y-5">
        {#if meta().note}
          <div class="border-2 border-black bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
            {meta().note}
          </div>
        {/if}

        <div>
          <div class="mb-3 flex items-center gap-2">
            <Building2 class="h-5 w-5 text-blue-500" />
            <h2 class="text-lg font-black text-black">Luồng vận hành</h2>
          </div>
          <div class="overflow-hidden border-2 border-black">
            {#each meta().workflows as workflow, index}
              <div class="flex items-center gap-3 border-t-2 border-black px-4 py-3 text-sm font-bold first:border-t-0">
                <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-black">{index + 1}</span>
                <span>{workflow}</span>
              </div>
            {/each}
          </div>
        </div>

        <div>
          <div class="mb-3 flex items-center gap-2">
            <BedDouble class="h-5 w-5 text-blue-500" />
            <h2 class="text-lg font-black text-black">{meta().unitLabel}</h2>
          </div>
          {#if rooms.length === 0}
            <div class="border-2 border-black bg-white px-4 py-8 text-center text-sm font-bold text-zinc-500">
              Cơ sở này chưa có đơn vị cho thuê.
            </div>
          {:else}
            <div class="overflow-x-auto border-2 border-black">
              <div class="grid min-w-[680px] grid-cols-[120px_minmax(180px,1fr)_120px_140px_120px] bg-zinc-50 px-4 py-3 text-xs font-black text-zinc-500">
                <span>Đơn vị</span>
                <span>Khách thuê</span>
                <span>Trạng thái</span>
                <span>Giá thuê</span>
                <span>Công nợ</span>
              </div>
              {#each rooms as room}
                <a
                  href="/dashboard/rooms?propertyId={property.id}"
                  class="grid min-w-[680px] grid-cols-[120px_minmax(180px,1fr)_120px_140px_120px] items-center border-t-2 border-black px-4 py-3 text-sm font-bold hover:bg-blue-50"
                >
                  <span class="font-black">{room.roomNumber}</span>
                  <span class="truncate">{room.tenant ? `${room.tenant.user.name} · ${room.tenant.user.phone}` : 'Chưa có khách'}</span>
                  <span class="w-fit rounded-full px-2.5 py-1 text-[10px] font-black {statusClass(room.status)}">
                    {statusLabel(room.status)}
                  </span>
                  <span>{formatCurrency(room.monthlyRent)}</span>
                  <span>{formatCurrency(room.debtAmount ?? 0)}</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <aside class="space-y-5">
        <div class="border-2 border-black bg-white p-4">
          <h2 class="text-lg font-black text-black">Cấu trúc</h2>
          <div class="mt-4 space-y-3 text-sm font-bold">
            <div class="flex items-center justify-between gap-3">
              <span class="text-zinc-500">Loại hình</span>
              <span>{meta().label}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-zinc-500">Nhóm</span>
              <span>{meta().groupLabel}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-zinc-500">Đơn vị thu tiền</span>
              <span>{meta().unitLabel}</span>
            </div>
          </div>
        </div>

        <div class="border-2 border-black bg-white p-4">
          <h2 class="text-lg font-black text-black">Tính tiền</h2>
          <div class="mt-3 space-y-2">
            {#each meta().billing as item}
              <div class="flex items-start gap-2 text-sm font-bold">
                <ArrowRight class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span>{item}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="border-2 border-black bg-white p-4">
          <h2 class="text-lg font-black text-black">Đi nhanh</h2>
          <div class="mt-3 grid gap-2">
            <a href="/dashboard/tenants" class="roomio-button-white justify-between px-3 py-2 text-xs">
              <span class="inline-flex items-center gap-1.5"><Users class="h-4 w-4" /> Khách thuê</span>
              <ArrowRight class="h-4 w-4" />
            </a>
            <a href="/dashboard/contracts" class="roomio-button-white justify-between px-3 py-2 text-xs">
              <span class="inline-flex items-center gap-1.5"><Receipt class="h-4 w-4" /> Hợp đồng</span>
              <ArrowRight class="h-4 w-4" />
            </a>
          </div>
        </div>
      </aside>
    </section>
  {/if}
</div>
