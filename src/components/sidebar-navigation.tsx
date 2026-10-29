"use client";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SidebarNavigation({
  children,
  page,
}: {
  children: ReactNode;
  page: string;
}) {
  const nav = useRef<HTMLElement>(null),
    content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ up: false, down: false });
  const measure = useCallback(() => {
    const element = nav.current;
    if (!element) return;
    const up = element.scrollTop > 3,
      down =
        element.scrollTop + element.clientHeight < element.scrollHeight - 3;
    setEdges((previous) =>
      previous.up === up && previous.down === down ? previous : { up, down },
    );
  }, []);
  useLayoutEffect(() => {
    const element = nav.current,
      inner = content.current;
    if (!element || !inner) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measure]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = nav.current,
        active = element?.querySelector<HTMLElement>(
          '[aria-current="page"],.project-nav.active',
        );
      if (!element || !active) return;
      const bounds = element.getBoundingClientRect(),
        item = active.getBoundingClientRect();
      if (item.top < bounds.top + 12)
        element.scrollBy({ top: item.top - bounds.top - 12 });
      else if (item.bottom > bounds.bottom - 24)
        element.scrollBy({ top: item.bottom - bounds.bottom + 24 });
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);
  return (
    <div
      className="sidebar-scroll-area"
      data-can-up={edges.up}
      data-can-down={edges.down}
    >
      <nav ref={nav} aria-label="Main navigation" onScroll={measure}>
        <div ref={content} className="sidebar-nav-items">
          {children}
        </div>
      </nav>
      {(edges.up || edges.down) && (
        <>
          <button
            className="sidebar-scroll-control scroll-up"
            aria-label="Scroll navigation up"
            disabled={!edges.up}
            onClick={() => nav.current?.scrollBy({ top: -180 })}
          >
            <ChevronUp size={15} />
          </button>
          <button
            className="sidebar-scroll-control scroll-down"
            aria-label="Scroll navigation down"
            disabled={!edges.down}
            onClick={() => nav.current?.scrollBy({ top: 180 })}
          >
            <ChevronDown size={15} />
          </button>
        </>
      )}
    </div>
  );
}
