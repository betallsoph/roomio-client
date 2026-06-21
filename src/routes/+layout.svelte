<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { Toaster } from 'svelte-sonner';
  import ConfirmPopup from '$lib/ConfirmPopup.svelte';

  let { children } = $props();
  const TAP_ACTION_DELAY = 200;

  onMount(() => {
    function findTapTarget(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;

      const interactive = target.closest<HTMLElement>('button, a[href], [role="button"]');
      if (!interactive || interactive.dataset.tapImmediate === 'true') return null;
      if (interactive.closest('[data-tap-zone="plain"]')) return null;
      if (interactive.matches(':disabled, [aria-disabled="true"]')) return null;

      return interactive;
    }

    function bounceTouchTarget(element: HTMLElement) {
      element.classList.remove('tap-sink', 'tap-bounce');
      void element.offsetWidth;
      element.classList.add('tap-sink');

      window.setTimeout(() => {
        if (!document.body.contains(element)) return;

        element.classList.remove('tap-sink');
        void element.offsetWidth;
        element.classList.add('tap-bounce');
      }, 100);
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

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType !== 'touch') return;

      const interactive = findTapTarget(event.target);
      if (!interactive) return;

      bounceTouchTarget(interactive);
    }

    function handleClick(event: MouseEvent) {
      const interactive = findTapTarget(event.target);
      if (!interactive) return;

      const anchor =
        interactive instanceof HTMLAnchorElement
          ? interactive
          : interactive.closest<HTMLAnchorElement>('a[href]');
      if (anchor) {
        delayInternalLink(event, anchor);
      }
    }

    function handleAnimationEnd(event: AnimationEvent) {
      if (event.animationName !== 'tap-bounce') return;
      if (event.target instanceof HTMLElement) {
        event.target.classList.remove('tap-bounce');
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('click', handleClick, true);
    document.addEventListener('animationend', handleAnimationEnd, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('animationend', handleAnimationEnd);
    };
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Roomio - Quản Lý Trọ Thông Minh</title>
</svelte:head>

<Toaster position="top-right" richColors />
<ConfirmPopup />
{@render children()}
