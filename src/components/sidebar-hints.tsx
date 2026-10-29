"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export function SidebarHints({ selector = ".sidebar" }: { selector?: string }) {
  const id = useId();
  const [hint, setHint] = useState<{
    label: string;
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    let active: HTMLElement | null = null;
    function clear() {
      active?.removeAttribute("aria-describedby");
      active = null;
      setHint(null);
    }
    function show(event: Event) {
      const button = (event.target as HTMLElement).closest<HTMLElement>(
        `${selector} button[data-sidebar-label]`,
      );
      if (!button) return;
      active?.removeAttribute("aria-describedby");
      active = button;
      const bounds = button.getBoundingClientRect();
      const side = button.closest(selector)!.getBoundingClientRect();
      button.setAttribute("aria-describedby", id);
      setHint({
        label: button.dataset.sidebarLabel!,
        top: Math.max(
          8,
          Math.min(
            window.innerHeight - 48,
            bounds.top + bounds.height / 2 - 18,
          ),
        ),
        left: side.right + 10,
      });
    }
    function leave(event: Event) {
      if (active?.contains(event.target as Node)) clear();
    }
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", leave);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      active?.removeAttribute("aria-describedby");
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [id, selector]);
  return hint
    ? createPortal(
        <div
          id={id}
          role="tooltip"
          className="sidebar-hint"
          style={{ top: hint.top, left: hint.left }}
        >
          {hint.label}
        </div>,
        document.body,
      )
    : null;
}
