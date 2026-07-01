<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { CalendarClock, Loader2, Play, ReceiptText, Send, Zap } from '@lucide/svelte';

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
			description: 'Chuyển các hóa đơn chưa thu đủ đã qua hạn sang trạng thái trễ hạn.',
			icon: CalendarClock
		},
		{
			id: 'invoice_reminder',
			title: 'Nhắc thanh toán',
			description: 'Tạo thông báo nhắc các hóa đơn chưa thu đủ.',
			icon: ReceiptText
		},
		{
			id: 'meter_reminder',
			title: 'Nhắc điện nước',
			description: 'Tạo thông báo cho phòng chưa gửi chỉ số tháng đã chọn.',
			icon: Zap
		},
		{
			id: 'contract_reminder',
			title: 'Nhắc hợp đồng',
			description: 'Tạo nhắc cho hợp đồng hết hạn trong 30 ngày.',
			icon: Send
		}
	];

	const JOB_LABELS: Record<string, string> = {
		overdue_sweep: 'Quét hóa đơn quá hạn',
		invoice_reminder: 'Nhắc thanh toán',
		meter_reminder: 'Nhắc điện nước',
		contract_reminder: 'Nhắc hợp đồng'
	};

	const RESULT_LABELS: Record<string, string> = {
		overdueInvoices: 'hóa đơn được chuyển sang trễ hạn',
		queuedInvoiceReminders: 'thông báo nhắc thanh toán',
		queuedMeterReminders: 'thông báo nhắc điện nước',
		queuedContractReminders: 'thông báo nhắc hợp đồng'
	};

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
				.map(([key, value]) => `${value} ${RESULT_LABELS[key] ?? 'mục đã xử lý'}`)
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

	function formatJobTime(job: AutomationJob) {
		const value = job.completedAt || job.createdAt;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '--';
		return new Intl.DateTimeFormat('vi-VN', {
			hour: '2-digit',
			minute: '2-digit',
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		}).format(date);
	}

	function channelLabel(channel: string) {
		if (channel.toLowerCase() === 'telegram') return 'Telegram';
		if (channel.toLowerCase() === 'in_app') return 'Trong ứng dụng';
		return channel;
	}
</script>

<div class="space-y-6">
	<div class="flex justify-start">
		<div class="flex items-center gap-2">
			<input
				type="month"
				bind:value={month}
				class="rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-black text-black"
			/>
			<button
				onclick={() => runAutomation('run_all')}
				disabled={!!isRunning}
				class="rounded-[6px] border-2 border-black bg-blue-300 px-4 py-2 text-sm font-black text-black shadow-secondary transition-[transform,box-shadow] disabled:opacity-50"
			>
				{isRunning === 'run_all' ? 'Đang chạy...' : 'Chạy tất cả'}
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
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each actions as action}
				{@const Icon = action.icon}
				<button
					onclick={() => runAutomation(action.id)}
					disabled={!!isRunning}
					class="min-h-36 rounded-lg border-2 border-black bg-white p-4 text-left shadow-secondary transition-colors hover:bg-blue-50 disabled:opacity-50"
				>
					<div class="flex items-center justify-between">
						<Icon class="h-5 w-5 text-blue-600" />
						{#if isRunning === action.id}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Play class="h-4 w-4 text-blue-600" />
						{/if}
					</div>
					<h3 class="mt-3 text-sm font-black text-black">{action.title}</h3>
					<p class="mt-1 text-xs leading-relaxed font-semibold text-zinc-500">
						{action.description}
					</p>
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
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
								<div class="min-w-0">
									<p class="font-black text-black">{JOB_LABELS[job.type] ?? 'Tác vụ tự động'}</p>
									<p class="mt-1 font-semibold text-zinc-500">{parseResult(job.result)}</p>
								</div>
								<div class="shrink-0 text-right">
									<p
										class="text-[11px] font-black {job.status === 'completed'
											? 'text-green-700'
											: job.status === 'failed'
												? 'text-red-700'
												: 'text-blue-600'}"
									>
										{jobStatusLabel(job.status)}
									</p>
									<p class="mt-0.5 text-[10px] font-semibold text-zinc-400">{formatJobTime(job)}</p>
								</div>
							</div>
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
