"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function SummaryStrip({
  kind,
  className,
  children,
  entries,
}: {
  kind: "stages" | "years";
  className: string;
  children: ReactNode;
  entries: {
    label: string;
    count: number;
    selected: boolean;
    select: () => void;
  }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const selection = entries.map((e) => e.selected).join();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft <= 1,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      });
    const selected = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (selected) {
      const box = el.getBoundingClientRect(),
        s = selected.getBoundingClientRect();
      if (s.left < box.left) el.scrollLeft -= box.left - s.left;
      else if (s.right > box.right) el.scrollLeft += s.right - box.right;
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [selection]);
  return (
    <div className="summary-strip">
      <div className="connected-actions" aria-label={`${kind} navigation`}>
        <button
          type="button"
          disabled={edges.start}
          aria-label={`Previous ${kind}`}
          onClick={() =>
            ref.current?.scrollBy({
              left: -Math.max(200, ref.current.clientWidth * 0.8),
              behavior: "auto",
            })
          }
        >
          ← Previous
        </button>
        <small>Scroll or use the arrows to explore all {kind}</small>
        <button
          type="button"
          disabled={edges.end}
          aria-label={`Next ${kind}`}
          onClick={() =>
            ref.current?.scrollBy({
              left: Math.max(200, ref.current.clientWidth * 0.8),
              behavior: "auto",
            })
          }
        >
          Next →
        </button>
      </div>
      <div className={className} ref={ref}>
        {children}
      </div>
      <details>
        <summary>All {kind === "stages" ? "stage" : "year"} counts</summary>
        <table
          aria-label={`Complete ${kind === "stages" ? "stage" : "year"} counts`}
        >
          <thead>
            <tr>
              <th scope="col">{kind === "stages" ? "Stage" : "Planned COD"}</th>
              <th scope="col">Projects</th>
              <th scope="col">Explore</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.label}>
                <th scope="row">{e.label}</th>
                <td>{e.count.toLocaleString()}</td>
                <td>
                  <button
                    type="button"
                    aria-pressed={e.selected}
                    onClick={e.select}
                  >
                    Focus {e.label}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
