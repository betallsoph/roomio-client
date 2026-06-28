<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		const sessionStr = localStorage.getItem('roomio_user');
		if (!sessionStr) {
			goto('/login');
			return;
		}

		try {
			const session = JSON.parse(sessionStr);
			if (session.role === 'SUPER_ADMIN') {
				goto('/admin');
			} else if (session.role === 'LANDLORD') {
				goto('/dashboard');
			} else if (session.role === 'TENANT') {
				goto('/tenant');
			} else {
				goto('/login');
			}
		} catch (e) {
			localStorage.removeItem('roomio_user');
			goto('/login');
		}
	});
</script>

<div class="flex h-screen w-screen items-center justify-center bg-slate-50">
	<div class="flex flex-col items-center gap-3">
		<div
			class="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"
		></div>
		<p class="font-medium text-slate-500">Đang chuyển hướng...</p>
	</div>
</div>
