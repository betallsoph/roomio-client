<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import {
		LayoutDashboard,
		Building2,
		Home,
		Receipt,
		Users,
		Wrench,
		Settings,
		Bell,
		LogOut,
		Menu,
		X,
		Gauge,
		FileText,
		TrendingUp,
		MessageSquare,
		UserCog,
		Plug,
		Bot
	} from '@lucide/svelte';

	let { children } = $props();

	let user = $state<{ name: string; role: string; landlordProfileId: string } | null>(null);
	let isMobileMenuOpen = $state(false);
	const activeRoute = $derived(page.url.pathname);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) {
			goto('/login');
			return;
		}

		try {
			const session = JSON.parse(sessionStr);
			if (session.role !== 'LANDLORD' && session.role !== 'SUPER_ADMIN') {
				toast.error('Bạn không có quyền truy cập cổng chủ trọ');
				goto('/login');
				return;
			}
			user = session;
		} catch {
			localStorage.removeItem('roomio_user');
			goto('/login');
		}
	});

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
		toast.success('Đã đăng xuất thành công');
		goto('/login');
	}

	const menuGroups = [
		{
			label: 'Vận hành chính',
			items: [
				{ name: 'Tổng quan', path: '/dashboard', icon: LayoutDashboard },
				{ name: 'Phòng trọ', path: '/dashboard/rooms', icon: Home },
				{ name: 'Hóa đơn', path: '/dashboard/invoices', icon: Receipt },
				{ name: 'Khách thuê', path: '/dashboard/tenants', icon: Users }
			]
		},
		{
			label: 'Công việc hằng ngày',
			items: [
				{ name: 'Chốt số', path: '/dashboard/meters', icon: Gauge },
				{ name: 'Sự cố', path: '/dashboard/requests', icon: Wrench },
				{ name: 'Hợp đồng', path: '/dashboard/contracts', icon: FileText },
				{ name: 'Tin nhắn', path: '/dashboard/messages', icon: MessageSquare },
				{ name: 'Bảng tin', path: '/dashboard/notifications', icon: Bell }
			]
		},
		{
			label: 'Thiết lập & quản trị',
			items: [
				{ name: 'Tòa nhà', path: '/dashboard/buildings', icon: Building2 },
				{ name: 'Nhân viên', path: '/dashboard/staff', icon: UserCog },
				{ name: 'Tài chính', path: '/dashboard/finance', icon: TrendingUp },
				{ name: 'Dịch vụ', path: '/dashboard/services', icon: Plug },
				{ name: 'Tự động', path: '/dashboard/automation', icon: Bot },
				{ name: 'Cài đặt', path: '/dashboard/settings', icon: Settings }
			]
		}
	];

	function isActive(path: string) {
		return activeRoute === path;
	}
</script>

{#if user}
	<div class="relative min-h-screen overflow-hidden bg-white font-sans text-black">
		<div class="roomio-grid-bg fixed inset-0 -z-10 opacity-50"></div>
		<div class="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/80 via-white/60 to-white/80"></div>

		<div class="flex min-h-screen">
			<aside data-tap-zone="plain" class="sticky top-0 hidden h-screen w-68 shrink-0 overflow-y-auto border-r-2 border-black bg-white/92 px-5 py-6 backdrop-blur lg:block">
				<div class="mb-7">
					<img
						src="/brand/roomio-wordmark-blue600.png"
						alt="Roomio"
						class="h-auto w-36"
					/>
				</div>

				<nav class="space-y-6">
					{#each menuGroups as group}
						<div>
							<p class="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
								{group.label}
							</p>
							<div class="space-y-1">
								{#each group.items as item}
									{@const Icon = item.icon}
									<a
										href={item.path}
										class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition-colors {isActive(
											item.path
										)
											? 'bg-blue-100 text-black'
											: 'text-zinc-600 hover:bg-zinc-100 hover:text-black'}"
									>
										<Icon class="h-4 w-4 shrink-0" />
										<span>{item.name}</span>
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</nav>

				<div class="mt-8 border-t border-zinc-200 pt-5">
					<p class="truncate text-sm font-bold text-black">{user.name}</p>
					<p class="mt-1 text-xs font-semibold text-zinc-500">{user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Chủ trọ'}</p>
					<button onclick={handleLogout} class="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-500 hover:underline">
						Đăng xuất <LogOut class="h-3.5 w-3.5" />
					</button>
				</div>
			</aside>

			<div class="flex min-w-0 flex-1 flex-col">
				<header class="sticky top-0 z-30 flex items-center justify-between border-b-2 border-black bg-white/95 px-5 py-3 backdrop-blur lg:hidden">
					<div class="flex items-center gap-3">
						<div>
							<img
								src="/brand/roomio-wordmark-blue600.png"
								alt="Roomio"
								class="h-auto w-28"
							/>
						</div>
					</div>
					<button
						onclick={() => window.setTimeout(() => (isMobileMenuOpen = true), 200)}
						class="rounded-lg border-2 border-black bg-white p-2 text-black shadow-secondary transition-all"
						aria-label="Mở menu"
					>
						<Menu class="h-5 w-5" />
					</button>
				</header>

				<main class="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-6 sm:py-8">
				{@render children()}
				</main>
			</div>
		</div>

		{#if isMobileMenuOpen}
			<div
				class="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm lg:hidden"
				onclick={() => window.setTimeout(() => (isMobileMenuOpen = false), 200)}
				onkeydown={(e) => e.key === 'Escape' && (isMobileMenuOpen = false)}
				role="button"
				tabindex="0"
			></div>
			<aside data-tap-zone="plain" class="fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs overflow-y-auto border-r-2 border-black bg-white px-5 py-5 shadow-primary lg:hidden">
				<div class="mb-6 flex items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<div>
							<img
								src="/brand/roomio-wordmark-blue600.png"
								alt="Roomio"
								class="h-auto w-32"
							/>
							<p class="mt-1 text-xs font-semibold text-zinc-500">{user.name}</p>
						</div>
					</div>
					<button
						onclick={() => (isMobileMenuOpen = false)}
						class="rounded-lg border-2 border-black bg-white p-2"
						aria-label="Đóng menu"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<nav class="space-y-6">
					{#each menuGroups as group}
						<div>
							<p class="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
								{group.label}
							</p>
							<div class="space-y-1">
								{#each group.items as item}
									{@const Icon = item.icon}
									<a
										href={item.path}
										onclick={() => (isMobileMenuOpen = false)}
										class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition-colors {isActive(
											item.path
										)
											? 'bg-blue-100 text-black'
											: 'text-zinc-600 hover:bg-zinc-100 hover:text-black'}"
									>
										<Icon class="h-4 w-4 shrink-0" />
										<span>{item.name}</span>
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</nav>

				<button onclick={handleLogout} class="mt-8 inline-flex items-center gap-1 text-sm font-bold text-blue-500 hover:underline">
					Đăng xuất <LogOut class="h-3.5 w-3.5" />
				</button>
			</aside>
		{/if}
		</div>
{/if}
