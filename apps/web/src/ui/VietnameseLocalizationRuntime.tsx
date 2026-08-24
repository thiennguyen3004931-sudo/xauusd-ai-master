import { useEffect, type ReactNode } from "react";

type Phase7CViHook = {
  translate?: (value: string) => string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

declare global {
  var __PHASE7C_VI_TEST__: Phase7CViHook | undefined;
}

const SKIP_SELECTOR = "script,style,code,pre,textarea,[data-no-vi-localize-self]";

function translateTextNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_SELECTOR)) return;

  const before = node.nodeValue || "";
  const translate = globalThis.__PHASE7C_VI_TEST__?.translate;
  if (!before || typeof translate !== "function") return;

  const after = translate(before);
  if (after !== before) node.nodeValue = after;
}

function translateAttributes(element: Element) {
  if (element.matches(SKIP_SELECTOR)) return;
  const translate = globalThis.__PHASE7C_VI_TEST__?.translate;
  if (typeof translate !== "function") return;

  for (const attribute of ["title", "placeholder", "aria-label", "alt"]) {
    if (!element.hasAttribute(attribute)) continue;
    const before = element.getAttribute(attribute) || "";
    const after = translate(before);
    if (after !== before) element.setAttribute(attribute, after);
  }
}

function translateSubtree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (!(root instanceof Element)) return;

  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode);
}

export function VietnameseLocalizationRuntime({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    // Disable the legacy full-body translator. This component replaces it with
    // a scoped, idle-time queue so frequent React updates do not block rendering.
    document.body.setAttribute("data-no-vi-localize", "runtime-managed");

    const pending = new Set<Node>();
    const idleWindow = window as IdleWindow;
    let scheduledHandle: number | null = null;
    let usingIdleCallback = false;

    const schedule = () => {
      if (scheduledHandle !== null) return;

      const flush = () => {
        scheduledHandle = null;
        usingIdleCallback = false;
        const batch = Array.from(pending);
        pending.clear();

        const started = performance.now();
        for (let index = 0; index < batch.length; index += 1) {
          translateSubtree(batch[index]);
          if (performance.now() - started > 6 && index < batch.length - 1) {
            for (let rest = index + 1; rest < batch.length; rest += 1) pending.add(batch[rest]);
            schedule();
            break;
          }
        }
      };

      if (typeof idleWindow.requestIdleCallback === "function") {
        usingIdleCallback = true;
        scheduledHandle = idleWindow.requestIdleCallback(flush, { timeout: 120 });
      } else {
        scheduledHandle = window.setTimeout(flush, 0);
      }
    };

    pending.add(root);
    schedule();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          pending.add(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) pending.add(node);
      }
      schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      pending.clear();
      document.body.removeAttribute("data-no-vi-localize");
      if (scheduledHandle !== null) {
        if (usingIdleCallback && typeof idleWindow.cancelIdleCallback === "function") {
          idleWindow.cancelIdleCallback(scheduledHandle);
        } else {
          window.clearTimeout(scheduledHandle);
        }
      }
    };
  }, []);

  return children;
}
