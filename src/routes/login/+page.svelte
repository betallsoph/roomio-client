<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Loader2, ArrowRight } from '@lucide/svelte';

	let email = $state('');
	let password = $state('');
	let isLoading = $state(false);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (sessionStr) {
			try {
				const session = JSON.parse(sessionStr);
				if (session.role === 'SUPER_ADMIN') goto('/admin');
				else if (session.role === 'LANDLORD') goto('/dashboard');
				else if (session.role === 'STAFF') goto('/staff');
				else if (session.role === 'TENANT') goto('/tenant');
			} catch {
				localStorage.removeItem('roomio_user');
			}
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (isLoading) return;

		if (!email) {
			toast.error('Vui lòng nhập Email hoặc Số điện thoại');
			return;
		}
		if (!password) {
			toast.error('Vui lòng nhập mật khẩu');
			return;
		}

		isLoading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'login',
					email: email.includes('@') ? email : undefined,
					phone: !email.includes('@') ? email : undefined,
					password
				})
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Không đăng nhập được');

			toast.success(`Chào mừng trở lại, ${data.name}!`);
			localStorage.setItem('roomio_user', JSON.stringify(data));

			if (data.role === 'SUPER_ADMIN') goto('/admin');
			else if (data.role === 'LANDLORD') goto('/dashboard');
			else if (data.role === 'STAFF') goto('/staff');
			else if (data.role === 'TENANT') goto('/tenant');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="relative min-h-screen overflow-hidden bg-white font-sans text-black">
	<div class="roomio-grid-bg fixed inset-0 -z-10 opacity-50"></div>
	<div
		class="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/80 via-white/60 to-white/80"
	></div>

	<main
		class="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-8 sm:px-6 lg:grid-cols-[1fr_430px] lg:items-center lg:py-12"
	>
		<section class="max-w-2xl self-start lg:self-center">
			<img src="/brand/roomio-wordmark-blue600.png" alt="Roomio" class="h-auto w-48 sm:w-64" />
			<h1 class="mt-8 max-w-xl text-3xl leading-tight font-black sm:text-5xl">
				Một chỗ để chủ trọ chạy hết việc vận hành.
			</h1>
		</section>

		<section class="w-full max-w-md lg:justify-self-end">
			<div class="roomio-window">
				<div class="roomio-window-bar">
					<div class="roomio-window-dots">
						<div class="roomio-window-dot bg-red-500"></div>
						<div class="roomio-window-dot bg-yellow-500"></div>
						<div class="roomio-window-dot bg-green-500"></div>
					</div>
				</div>

				<div class="p-5 sm:p-6">
					<div class="mb-5">
						<h2 class="text-2xl leading-none font-bold">Đăng nhập</h2>
					</div>

					<form onsubmit={handleSubmit} class="space-y-4">
						<div>
							<label for="email" class="mb-1 block text-sm font-bold"
								>Email hoặc số điện thoại</label
							>
							<input
								id="email"
								type="text"
								bind:value={email}
								required
								placeholder="Email hoặc SĐT đăng nhập"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>

						<div>
							<label for="password" class="mb-1 block text-sm font-bold">Mật khẩu</label>
							<input
								id="password"
								type="password"
								bind:value={password}
								required
								placeholder="••••••••"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-300 focus:outline-none"
							/>
						</div>

						<button type="submit" disabled={isLoading} class="roomio-button mt-2 w-full">
							{#if isLoading}
								Đang xử lý
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								Vào hệ thống
								<ArrowRight class="h-4 w-4" />
							{/if}
						</button>
					</form>
				</div>
			</div>

			<div class="mt-6 border-t-2 border-black/20 pt-5 text-center">
				<p class="text-sm font-semibold text-zinc-600">
					Chủ trọ: `ngochau@gmail.com` / `password` · Nhân viên: `nhanvien@nhatro.com` / `staff`
				</p>
			</div>
		</section>
	</main>
</div>
