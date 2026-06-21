<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Bot, CalendarClock, CheckCircle2, Loader2, Play, ReceiptText, Send, Zap } from '@lucide/svelte';

	interface AutomationJob {
		id: string;
		type: string;
		status: string;
		scheduledFor: string;
		result: string | null;
		createdAt: string;
		completedAt: string | null;
	}

	interface QueuedNotification {
		id: string;
		type: string;
		title: string;
		content: string;
		channel: string;
		status: string;
		scheduledFor: string;
		createdAt: string;
	}

	let isLoading = $state(true);
	let isRunning = $state<string | null>(null);
	let month = $state(new Date().toISOString().slice(0, 7));
	let jobs = $state<AutomationJob[]>([]);
	let queuedNotifications = $state<QueuedNotification[]>([]);

	const actions = [
		{ id: 'run_all', title: 'Chạy toàn bộ', description: 'Quét quá hạn, tạo nhắc tiền, nhắc chỉ số và nhắc hợp đồng.', icon: Bot },
		{ id: 'overdue_sweep', title: 'Quét quá hạn', description: 'Tự chuyển hóa đơn pending/partial đã quá hạn sang overdue.', icon: CalendarClock },
		{ id: 'invoice_reminder', title: 'Nhắc thanh toán', description: 'Tạo thông báo nhắc các hóa đơn chưa thu đủ.', icon: ReceiptText },
		{ id: 'meter_reminder', title: 'Nhắc điện nước', description: 'Tạo thông báo cho phòng chưa gửi chỉ số tháng đã chọn.', icon: Zap },
		{ id: 'contract_reminder', title: 'Nhắc hợp đồng', description: 'Tạo nhắc cho hợp đồng hết hạn trong 30 ngày.', icon: Send }
	];

	onMount(loadAutomation);

	async function loadAutomation() {
		isLoading = true;
		try {
			const res = await fetch('/api/automation');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không tải được automation');
			jobs = data.jobs;
			queuedNotifications = data.queuedNotifications;
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isLoading = false;
		}
	}

	async function runAutomation(action: string) {
		if (isRunning) return;
		isRunning = action;
		try {
			const res = await fetch('/api/automation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, month })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Không chạy được automation');
			toast.success(`Đã chạy ${data.jobs.length} job`);
			await loadAutomation();
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			isRunning = null;
		}
	}

	function parseResult(result: string | null) {
		if (!result) return '--';
		try {
			return Object.entries(JSON.parse(result))
				.map(([key, value]) => `${key}: ${value}`)
				.join(', ');
		} catch {
			return result;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl font-black leading-none text-black sm:text-2xl">Tự Động Hoá</h1>
			<p class="mt-1 text-xs font-bold text-zinc-500 sm:text-sm">Gom các việc định kỳ của nhà trọ vào một nơi.</p>
		</div>
		<div class="flex items-center gap-2">
			<input
				type="month"
				bind:value={month}
				class="rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-black text-black"
			/>
			<button
				onclick={() => runAutomation('run_all')}
				disabled={!!isRunning}
				class="flex items-center gap-1.5 rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-black text-black shadow-secondary transition-all disabled:opacity-50"
			>
				{#if isRunning === 'run_all'}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Play class="h-4 w-4" />
				{/if}
				Chạy tất cả
			</button>
		</div>
	</div>

	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
		{#each actions as action}
			{@const Icon = action.icon}
			<button
				onclick={() => runAutomation(action.id)}
				disabled={!!isRunning}
				class="min-h-36 rounded-lg border-2 border-black bg-white p-4 text-left shadow-secondary transition-all disabled:opacity-50"
			>
				<div class="flex items-center justify-between">
					<Icon class="h-5 w-5 text-blue-500" />
					{#if isRunning === action.id}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Play class="h-4 w-4" />
					{/if}
				</div>
				<h2 class="mt-3 text-sm font-black text-black">{action.title}</h2>
				<p class="mt-1 text-xs font-bold leading-relaxed text-zinc-600">{action.description}</p>
			</button>
		{/each}
	</div>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-2">
			<section class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
				<div class="flex items-center justify-between border-b-2 border-black bg-zinc-50 p-4">
					<h2 class="text-sm font-black text-black">Job gần đây</h2>
					<CheckCircle2 class="h-5 w-5 text-green-600" />
				</div>
				<div class="divide-y divide-black/15">
					{#each jobs as job}
						<div class="p-4 text-xs font-bold text-zinc-700">
							<div class="flex items-center justify-between gap-3">
								<span class="font-black text-black">{job.type}</span>
								<span class="rounded-full border border-black px-2 py-0.5 text-[10px] uppercase {job.status === 'completed' ? 'bg-green-200 text-green-800' : job.status === 'failed' ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-800'}">{job.status}</span>
							</div>
							<p class="mt-1 text-zinc-500">{parseResult(job.result)}</p>
						</div>
					{:else}
						<p class="p-6 text-center text-sm font-bold text-zinc-500">Chưa có job nào.</p>
					{/each}
				</div>
			</section>

			<section class="overflow-hidden rounded-lg border-2 border-black bg-white shadow-secondary">
				<div class="flex items-center justify-between border-b-2 border-black bg-zinc-50 p-4">
					<h2 class="text-sm font-black text-black">Thông báo đang chờ gửi</h2>
					<Send class="h-5 w-5 text-blue-500" />
				</div>
				<div class="max-h-[520px] divide-y divide-black/15 overflow-y-auto">
					{#each queuedNotifications as item}
						<div class="p-4">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-sm font-black text-black">{item.title}</h3>
								<span class="rounded-full border border-black bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-800">{item.channel}</span>
							</div>
							<p class="mt-1 text-xs font-bold leading-relaxed text-zinc-600">{item.content}</p>
						</div>
					{:else}
						<p class="p-6 text-center text-sm font-bold text-zinc-500">Không có thông báo nào đang chờ.</p>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>
