"use client";
import { useRoomLocations } from "./connected/personal";
import { UnifiedSearch } from "./connected/search";
import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronsUpDown,
  Grid2X2,
  ListTodo,
  Settings,
  X,
  Shapes,
} from "lucide-react";
export function RoomSwitcher({
  room,
  email,
  beforeNavigate,
}: {
  room: "locker" | "board";
  email: string;
  beforeNavigate?: (href: string) => void;
}) {
  const locations = useRoomLocations(email);
  const [open, setOpen] = useState(false);
  const name = room === "locker" ? "Locker Room" : "Board Room";
  const Icon = room === "locker" ? ListTodo : ChartNoAxesCombined;
  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    setOpen(false);
    if (!beforeNavigate) return;
    event.preventDefault();
    beforeNavigate(href);
  }
  return (
    <>
      <UnifiedSearch beforeNavigate={beforeNavigate} />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          className="room-switcher"
          aria-label={`Switch apps, currently ${name}`}
          title={`Switch apps · ${name}`}
        >
          <span className="room-switcher-icon">
            <Icon size={19} />
          </span>
          <span className="room-switcher-label">
            <strong>{name}</strong>
            <small>
              {room === "locker" ? "Task management" : "Project monitoring"}
            </small>
          </span>
          <ChevronsUpDown size={15} />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="room-switch-overlay" />
          <Dialog.Content className="room-switch-dialog">
            <header>
              <div>
                <Dialog.Title>Your workspace, two perspectives.</Dialog.Title>
                <Dialog.Description>
                  Choose where you want to work. Your account stays with you.
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="Close app switcher">
                <X size={19} />
              </Dialog.Close>
            </header>
            <div className="room-switch-options">
              {[
                {
                  id: "board",
                  name: "Board Room",
                  description:
                    "See project stages, yearly plans and document readiness.",
                  href: locations.board,
                  Icon: ChartNoAxesCombined,
                },
                {
                  id: "locker",
                  name: "Locker Room",
                  description:
                    "Plan tasks. Coordinate the team. Move work forward.",
                  href: locations.locker,
                  Icon: ListTodo,
                },
              ].map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  prefetch="auto"
                  onClick={(e) => {
                    if (
                      r.id === room &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      !e.shiftKey &&
                      !e.altKey
                    ) {
                      e.preventDefault();
                      setOpen(false);
                      return;
                    }
                    navigate(e, r.href);
                  }}
                  aria-current={room === r.id ? "page" : undefined}
                >
                  <r.Icon size={24} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.description}</small>
                  </span>
                  {room === r.id ? (
                    <Check size={18} aria-label="Current app" />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </Link>
              ))}
            </div>
            <footer>
              <Link
                href="/workspace"
                prefetch="auto"
                onClick={(e) => navigate(e, "/workspace")}
              >
                <Grid2X2 size={16} />
                Home
              </Link>
              <Link
                href="/workspace/templates"
                onClick={(e) => navigate(e, "/workspace/templates")}
              >
                <Shapes size={16} />
                Templates
              </Link>
              <Link
                href="/workspace/settings"
                onClick={(e) => navigate(e, "/workspace/settings")}
              >
                <Settings size={16} />
                Shared settings
              </Link>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
