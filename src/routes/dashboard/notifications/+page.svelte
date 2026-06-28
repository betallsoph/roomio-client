<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/dashboard/messages?tab=announcements', { replaceState: true });
	});
</script>

<div class="flex justify-center py-16">
	<p class="text-sm font-bold text-zinc-500">Đang mở Liên lạc...</p>
</div>
