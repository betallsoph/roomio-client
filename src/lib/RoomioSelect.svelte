<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';

	export type SelectOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	type Props = {
		value?: string;
		options: SelectOption[];
		id?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		compact?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	};

	let {
		value = $bindable(''),
		options,
		id,
		placeholder = 'Chọn một mục',
		required = false,
		disabled = false,
		compact = false,
		class: className = '',
		onchange
	}: Props = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let trigger: HTMLButtonElement;

	const selectedOption = () => options.find((option) => option.value === value);

	function openMenu() {
		if (disabled) return;
		open = true;
		const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
		activeIndex =
			selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);
	}

	function choose(option: SelectOption) {
		if (option.disabled) return;
		value = option.value;
		open = false;
		onchange?.(option.value);
		trigger?.focus();
	}

	function moveActive(direction: 1 | -1) {
		if (!open) openMenu();
		if (!options.length) return;

		let next = activeIndex;
		for (let attempts = 0; attempts < options.length; attempts += 1) {
			next = (next + direction + options.length) % options.length;
			if (!options[next]?.disabled) {
				activeIndex = next;
				break;
			}
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveActive(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveActive(-1);
		} else if ((event.key === 'Enter' || event.key === ' ') && open) {
			event.preventDefault();
			const option = options[activeIndex];
			if (option) choose(option);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openMenu();
		} else if (event.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window onpointerdown={() => (open = false)} />

<div class="relative {className}">
	<select
		id={id ? `${id}-native` : undefined}
		bind:value
		{required}
		{disabled}
		tabindex="-1"
		aria-hidden="true"
		class="pointer-events-none absolute h-px w-px opacity-0"
		oninvalid={(event) => {
			event.preventDefault();
			trigger?.focus();
			openMenu();
		}}
	>
		{#if !options.some((option) => option.value === '')}
			<option value="">{placeholder}</option>
		{/if}
		{#each options as option}
			<option value={option.value} disabled={option.disabled}>{option.label}</option>
		{/each}
	</select>

	<button
		bind:this={trigger}
		{id}
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={id ? `${id}-menu` : undefined}
		{disabled}
		onpointerdown={(event) => event.stopPropagation()}
		onclick={() => (open ? (open = false) : openMenu())}
		onkeydown={handleKeydown}
		class="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-black bg-white text-left font-semibold text-black transition-colors hover:bg-blue-50 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 {compact
			? 'min-h-9 px-2.5 py-1.5 text-xs'
			: 'min-h-11 px-3 py-2 text-sm'}"
	>
		<span class="truncate" class:text-zinc-400={!selectedOption()}>
			{selectedOption()?.label ?? placeholder}
		</span>
		<ChevronDown
			class="h-4 w-4 shrink-0 text-zinc-600 transition-transform {open ? 'rotate-180' : ''}"
		/>
	</button>

	{#if open}
		<div
			id={id ? `${id}-menu` : undefined}
			role="listbox"
			tabindex="-1"
			onpointerdown={(event) => event.stopPropagation()}
			class="absolute top-[calc(100%+6px)] right-0 left-0 z-50 max-h-72 overflow-y-auto rounded-lg border-2 border-black bg-white p-1"
		>
			{#each options as option, index}
				<button
					type="button"
					role="option"
					aria-selected={value === option.value}
					disabled={option.disabled}
					onpointerenter={() => (activeIndex = index)}
					onclick={() => choose(option)}
					class="flex w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-bold text-black transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-zinc-300"
					class:bg-blue-100={value === option.value || activeIndex === index}
				>
					<span class="truncate">{option.label}</span>
					{#if value === option.value}
						<Check class="h-4 w-4 shrink-0 text-blue-600" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
