import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  ListTodo,
  ScanLine,
} from "lucide-react";
import { focusLinks, type WorkspaceFocus } from "@/lib/workspace-focus";
import "./workspace-focus.css";

export function WorkspaceFocusBrief({
  focus,
  email,
}: {
  focus: WorkspaceFocus;
  email: string;
}) {
  const links = focusLinks(email);
  const cards = [
    {
      key: "myOpen" as const,
      label: "My open work",
      detail: "Assigned to you",
      icon: ListTodo,
    },
    {
      key: "overdue" as const,
      label: "Past due",
      detail: "Open tasks across the team",
      icon: Clock3,
    },
    {
      key: "dueToday" as const,
      label: "Due today",
      detail: "Open tasks across the team",
      icon: CalendarDays,
    },
    {
      key: "needsReview" as const,
      label: "Documents to review",
      detail: "Board projects awaiting review",
      icon: ClipboardCheck,
    },
    {
      key: "noFiles" as const,
      label: "Missing documents",
      detail: "Board projects without ready files",
      icon: FileQuestion,
    },
    {
      key: "incomplete" as const,
      label: "Incomplete project data",
      detail: "Board records to complete",
      icon: ScanLine,
    },
  ];
  return (
    <section
      className="workspace-focus"
      aria-labelledby="workspace-focus-heading"
    >
      <header>
        <div>
          <span className="workspace-focus-kicker">YOUR WORKSPACE BRIEF</span>
          <h2 id="workspace-focus-heading">Where to focus next</h2>
        </div>
        <span className="workspace-focus-date">
          {focus.today} · {focus.timeZone}
        </span>
      </header>
      <div className="workspace-focus-grid">
        {cards.map(({ key, label, detail, icon: Icon }) => (
          <Link key={key} href={links[key]} className="workspace-focus-card">
            <div>
              <Icon size={17} />
              <span>{label}</span>
              <ArrowUpRight size={15} />
            </div>
            <strong>{focus[key].toLocaleString("en-US")}</strong>
            <small>{detail}</small>
          </Link>
        ))}
      </div>
      <p>
        Current counts across both rooms. Open any item to explore the matching
        records.
      </p>
    </section>
  );
}
