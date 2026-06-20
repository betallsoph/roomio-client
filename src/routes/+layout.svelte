<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { Toaster } from 'svelte-sonner';

  let { children } = $props();
  const TAP_ACTION_DELAY = 200;

  onMount(() => {
    function animateTap(element: HTMLElement) {
      element.classList.remove('tap-bounce');
      void element.offsetWidth;
      element.classList.add('tap-bounce');
      window.setTimeout(() => element.classList.remove('tap-bounce'), 260);
    }

    function delayInternalLink(event: MouseEvent, anchor: HTMLAnchorElement) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      window.setTimeout(() => {
        goto(`${url.pathname}${url.search}${url.hash}`);
      }, TAP_ACTION_DELAY);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const interactive = target.closest<HTMLElement>('button, a[href], [role="button"]');
      if (!interactive || interactive.dataset.tapImmediate === 'true') return;
      if (interactive.matches(':disabled, [aria-disabled="true"]')) return;

      animateTap(interactive);

      const anchor = interactive instanceof HTMLAnchorElement
        ? interactive
        : interactive.closest<HTMLAnchorElement>('a[href]');
      if (anchor) {
        delayInternalLink(event, anchor);
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Roomio - Quản Lý Trọ Thông Minh</title>
</svelte:head>

<Toaster position="top-right" richColors />
{@render children()}
