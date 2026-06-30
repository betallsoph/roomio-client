<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2, Play } from '@lucide/svelte';

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
		{
			id: 'overdue_sweep',
			title: 'Quét quá hạn',
			description: 'Chuyển các hóa đơn chưa thu đủ đã qua hạn sang trạng thái trễ hạn.'
		},
		{
			id: 'invoice_reminder',
			title: 'Nhắc thanh toán',
			description: 'Tạo thông báo nhắc các hóa đơn chưa thu đủ.'
		},
		{
			id: 'meter_reminder',
			title: 'Nhắc điện nước',
			description: 'Tạo thông báo cho phòng chưa gửi chỉ số tháng đã chọn.'
		},
		{
			id: 'contract_reminder',
			title: 'Nhắc hợp đồng',
			description: 'Tạo nhắc cho hợp đồng hết hạn trong 30 ngày.'
		}
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

	function jobStatusLabel(status: string) {
		if (status === 'completed') return 'Hoàn tất';
		if (status === 'failed') return 'Thất bại';
		return 'Đang chạy';
	}

	function channelLabel(channel: string) {
		if (channel.toLowerCase() === 'telegram') return 'Telegram';
		if (channel.toLowerCase() === 'in_app') return 'Trong ứng dụng';
		return channel;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl leading-none font-black text-black sm:text-2xl">Tự Động Hoá</h1>
			<p class="mt-1 text-xs font-bold text-zinc-500 sm:text-sm">
				Gom các việc định kỳ của nhà trọ vào một nơi.
			</p>
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

	<section>
		<div class="mb-2 flex items-end justify-between gap-4">
			<div>
				<h2 class="text-sm font-black text-blue-600">Tác vụ định kỳ</h2>
				<p class="mt-0.5 text-xs font-semibold text-zinc-500">Chạy riêng khi cần xử lý ngay.</p>
			</div>
		</div>
		<div class="border-y border-zinc-200">
			{#each actions as action}
				<button
					onclick={() => runAutomation(action.id)}
					disabled={!!isRunning}
					class="flex w-full items-center justify-between gap-4 border-b border-zinc-200 px-1 py-3.5 text-left transition-colors last:border-b-0 hover:bg-blue-50 disabled:opacity-50"
				>
					<div class="min-w-0">
						<h3 class="text-sm font-black text-black">{action.title}</h3>
						<p class="mt-0.5 text-xs font-semibold text-zinc-500">{action.description}</p>
					</div>
					<span class="flex h-8 w-8 shrink-0 items-center justify-center text-blue-600">
						{#if isRunning === action.id}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Play class="h-4 w-4" />
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</section>

	{#if isLoading}
		<div class="flex h-64 items-center justify-center">
			<Loader2 class="h-10 w-10 animate-spin text-black" />
		</div>
	{:else}
		<div class="grid gap-8 lg:grid-cols-2">
			<section>
				<h2 class="mb-2 text-sm font-black text-blue-600">Lần chạy gần đây</h2>
				<div class="divide-y divide-zinc-200 border-y border-zinc-200">
					{#each jobs as job}
						<div class="px-1 py-3.5 text-xs font-bold text-zinc-700">
							<div class="flex items-center justify-between gap-3">
								<span class="font-black text-black">{job.type}</span>
								<span
									class="text-[11px] font-black {job.status === 'completed'
										? 'text-green-700'
										: job.status === 'failed'
											? 'text-red-700'
											: 'text-blue-600'}">{jobStatusLabel(job.status)}</span
								>
							</div>
							<p class="mt-1 font-semibold text-zinc-500">{parseResult(job.result)}</p>
						</div>
					{:else}
						<p class="py-10 text-center text-sm font-semibold text-zinc-400">
							Chưa có lần chạy nào.
						</p>
					{/each}
				</div>
			</section>

			<section>
				<h2 class="mb-2 text-sm font-black text-blue-600">Thông báo đang chờ gửi</h2>
				<div
					class="max-h-[520px] divide-y divide-zinc-200 overflow-y-auto border-y border-zinc-200"
				>
					{#each queuedNotifications as item}
						<div class="px-1 py-3.5">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-sm font-black text-black">{item.title}</h3>
								<span class="text-[11px] font-black text-blue-600"
									>{channelLabel(item.channel)}</span
								>
							</div>
							<p class="mt-1 text-xs leading-relaxed font-semibold text-zinc-500">{item.content}</p>
						</div>
					{:else}
						<p class="py-10 text-center text-sm font-semibold text-zinc-400">
							Không có thông báo nào đang chờ.
						</p>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>
