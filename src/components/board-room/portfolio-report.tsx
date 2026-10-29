"use client";
import "@/app/board-evidence.css";
import { FileText, ArrowUpRight } from "lucide-react";
import type { BoardQuery } from "@/lib/board-room/model";
export function PortfolioReport({ query }: { query: BoardQuery }) {
  const params = new URLSearchParams(
    Object.entries(query)
      .filter(([key, value]) => key !== "page" && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return (
    <section className="br-evidence-panel" aria-label="Portfolio report">
      <div className="br-evidence-heading">
        <div>
          <h2>
            <FileText size={19} /> Explore the portfolio report
          </h2>
          <p className="br-note">
            A dated report of every project matching these filters, including
            its workflow stage, capacity unit, responsibility and admin-reviewed
            document status.
          </p>
        </div>
        <a
          className="br-primary"
          href={`/api/board-room/report?${params}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open portfolio report <ArrowUpRight size={16} />
        </a>
      </div>
      <p className="br-note">
        Print or save as PDF from the report. Workflow stage is not physical
        completion. The report captures current values when opened; it is not a
        saved baseline.
      </p>
    </section>
  );
}
