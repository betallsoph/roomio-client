<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let email = $state('');
	let password = $state('');
	let isLoading = $state(false);
	const officialUrl = import.meta.env.VITE_OFFICIAL_URL?.trim();
	const officialLabel = import.meta.env.VITE_OFFICIAL_LABEL?.trim() || 'Dùng bản chính thức';
	const loginButtonLabel = import.meta.env.VITE_LOGIN_BUTTON_LABEL?.trim() || 'Léc gô';
	const shouldAutoLoginDemo = import.meta.env.VITE_DEMO_AUTO_LOGIN === 'true';

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

		if (!shouldAutoLoginDemo && !email) {
			toast.error('Vui lòng nhập Email hoặc Số điện thoại');
			return;
		}
		if (!shouldAutoLoginDemo && !password) {
			toast.error('Vui lòng nhập mật khẩu');
			return;
		}

		isLoading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					shouldAutoLoginDemo
						? { action: 'demo-login' }
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
		class="mx-auto flex min-h-screen w-full items-center justify-center px-5 py-8 sm:px-6 lg:py-12"
	>
		<section class="w-full max-w-md">
			<div class="p-0">
				<div class="mb-5 flex justify-center">
					<img src="/brand/roomio-wordmark-blue600.png" alt="Roomio" class="h-auto w-48 sm:w-64" />
				</div>

				<form onsubmit={handleSubmit} class="space-y-4">
					<div>
						<label for="email" class="mb-1 block text-sm font-bold">Email hoặc số điện thoại</label>
						<input
							id="email"
							type="text"
							bind:value={email}
							required={!shouldAutoLoginDemo}
							placeholder={shouldAutoLoginDemo ? 'Nhập bất kỳ để vào demo' : 'Email hoặc SĐT đăng nhập'}
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<div>
						<label for="password" class="mb-1 block text-sm font-bold">Mật khẩu</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							required={!shouldAutoLoginDemo}
							placeholder={shouldAutoLoginDemo ? 'Nhập gì cũng được' : '••••••••'}
							class="w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-300 focus:outline-none"
						/>
					</div>

					<button
						type="submit"
						disabled={isLoading}
						class="login-submit mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-bold text-black shadow-secondary transition-all hover:bg-white disabled:pointer-events-none disabled:opacity-50"
					>
						{#if isLoading}
							Đang xử lý
						{:else}
							<span>{loginButtonLabel}</span>
						{/if}
					</button>
				</form>

				{#if officialUrl}
					<div class="my-5 flex items-center gap-3 text-xs font-bold text-slate-400">
						<div class="h-px flex-1 bg-slate-200"></div>
						<span>hoặc</span>
						<div class="h-px flex-1 bg-slate-200"></div>
					</div>

					<a
						href={officialUrl}
						target="_blank"
						rel="noreferrer"
						class="inline-flex w-full items-center justify-center rounded-[6px] border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-secondary transition-all hover:-translate-y-0.5 hover:bg-blue-50"
					>
						{officialLabel}
					</a>
				{/if}
			</div>
		</section>
	</main>
</div>

<style>
	.login-submit:hover span {
		color: #2563eb;
		font-weight: 900;
		animation: login-word-pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes login-word-pop {
		0%,
		100% {
			transform: scale(1);
		}
		52% {
			transform: scale(1.08);
		}
	}
</style>
