<script lang="ts">
	import { page } from '$app/state';
	import AdminPage from '../../+page.svelte';
</script>

<AdminPage landlordId={page.params.id} />
