<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Loader2, ArrowRight } from '@lucide/svelte';

	let isRegister = $state(false);
	let email = $state('');
	let phone = $state('');
	let name = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (sessionStr) {
			try {
				const session = JSON.parse(sessionStr);
				if (session.role === 'SUPER_ADMIN') goto('/super-admin');
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

		if (isRegister) {
			if (!email || !phone || !password || !name) {
				toast.error('Vui lòng điền đầy đủ tất cả thông tin');
				return;
			}
			if (password !== confirmPassword) {
				toast.error('Mật khẩu nhập lại không trùng khớp');
				return;
			}
			if (password.length < 6) {
				toast.error('Mật khẩu phải dài ít nhất 6 ký tự');
				return;
			}
		} else {
			if (!email && !phone) {
				toast.error('Vui lòng nhập Email hoặc Số điện thoại');
				return;
			}
			if (!password) {
				toast.error('Vui lòng nhập mật khẩu');
				return;
			}
		}

		isLoading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					isRegister
						? { action: 'register', email, phone, password, name, role: 'LANDLORD' }
						: {
								action: 'login',
								email: email.includes('@') ? email : undefined,
								phone: !email.includes('@') ? email : undefined,
								password
							}
				)
			});
			const data = await res.json();

			if (!res.ok) throw new Error(data.error || 'Không đăng nhập được');

			toast.success(isRegister ? 'Đăng ký tài khoản chủ trọ thành công!' : `Chào mừng trở lại, ${data.name}!`);
			localStorage.setItem('roomio_user', JSON.stringify(data));

			if (data.role === 'SUPER_ADMIN') goto('/super-admin');
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
	<div class="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/80 via-white/60 to-white/80"></div>

	<main class="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-8 sm:px-6 lg:grid-cols-[1fr_430px] lg:items-center lg:py-12">
		<section class="max-w-2xl self-start lg:self-center">
			<img
				src="/brand/roomio-wordmark-blue600.png"
				alt="Roomio"
				class="h-auto w-48 sm:w-64"
			/>
			<h1 class="mt-8 max-w-xl text-3xl font-black leading-tight sm:text-5xl">
				Một chỗ để chủ trọ chạy hết việc vận hành.
			</h1>
			<p class="mt-4 max-w-xl text-base font-semibold leading-relaxed text-zinc-700 sm:text-lg">
				Quản lý phòng, khách thuê, hóa đơn, sự cố, nhân viên và thanh toán PayOS trong cùng một dashboard.
			</p>
		</section>

		<section class="w-full max-w-md lg:justify-self-end">
			<div class="roomio-window">
				<div class="roomio-window-bar">
					<div class="roomio-window-dots">
						<div class="roomio-window-dot bg-red-500"></div>
						<div class="roomio-window-dot bg-yellow-500"></div>
						<div class="roomio-window-dot bg-green-500"></div>
					</div>
					<button
						type="button"
						onclick={() => (isRegister = !isRegister)}
						class="text-xs font-bold text-zinc-500 transition-colors hover:text-black"
					>
						{isRegister ? 'Có tài khoản' : 'Tạo mới'}
					</button>
				</div>

				<div class="p-5 sm:p-6">
					<div class="mb-5">
						<h2 class="text-2xl font-bold leading-none">
							{isRegister ? 'Đăng ký chủ trọ' : 'Đăng nhập'}
						</h2>
						<p class="mt-2 text-sm font-semibold leading-relaxed text-zinc-600">
							{isRegister
								? 'Tạo tài khoản quản lý nhà trọ mới.'
								: 'Vào dashboard chủ trọ để xử lý phòng, hóa đơn và sự cố.'}
						</p>
					</div>

					<form onsubmit={handleSubmit} class="space-y-4">
						{#if isRegister}
							<div>
								<label for="name" class="mb-1 block text-sm font-bold">Họ và tên</label>
								<input
									id="name"
									type="text"
									bind:value={name}
									required
									placeholder="Nguyễn Văn Hậu"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
								/>
							</div>
						{/if}

						<div>
							<label for="email" class="mb-1 block text-sm font-bold">
								{isRegister ? 'Email liên hệ' : 'Email hoặc số điện thoại'}
							</label>
							<input
								id="email"
								type={isRegister ? 'email' : 'text'}
								bind:value={email}
								required
								placeholder={isRegister ? 'chu-nha@gmail.com' : 'Email hoặc SĐT đăng nhập'}
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
							/>
						</div>

						{#if isRegister}
							<div>
								<label for="phone" class="mb-1 block text-sm font-bold">Số điện thoại</label>
								<input
									id="phone"
									type="tel"
									bind:value={phone}
									required
									placeholder="0901234567"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
								/>
							</div>
						{/if}

						<div>
							<label for="password" class="mb-1 block text-sm font-bold">Mật khẩu</label>
							<input
								id="password"
								type="password"
								bind:value={password}
								required
								placeholder="••••••••"
								class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
							/>
						</div>

						{#if isRegister}
							<div>
								<label for="confirm" class="mb-1 block text-sm font-bold">Nhập lại mật khẩu</label>
								<input
									id="confirm"
									type="password"
									bind:value={confirmPassword}
									required
									placeholder="••••••••"
									class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
								/>
							</div>
						{/if}

						<button type="submit" disabled={isLoading} class="roomio-button mt-2 w-full">
							{#if isLoading}
								Đang xử lý
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								{isRegister ? 'Tạo tài khoản' : 'Vào hệ thống'}
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
