"use client";
import { useI18n } from "./i18n-provider";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import {
  Circle,
  CircleDashed,
  CircleDot,
  CheckCircle2,
  CircleCheck,
  X,
  Flag,
  ChevronsUp,
  ChevronUp,
  Minus,
  ArrowDown,
  LoaderCircle,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { initials } from "@/lib/utils";
import type { Priority, Status } from "@/lib/types";
export function Logo({
  small = false,
  name = "Evolve",
}: {
  small?: boolean;
  name?: string;
}) {
  return (
    <span className={clsx("brand", small && "brand-small")}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span className="brand-word">
          <strong>
            {name}
            <span className="brand-period">.</span>
          </strong>
          <small className="brand-tagline">Every Task Matters</small>
        </span>
      )}
    </span>
  );
}
export function Avatar({
  name,
  color = "violet",
  small = false,
  image,
}: {
  name: string;
  color?: string;
  small?: boolean;
  image?: string | null;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <span
      className={clsx("avatar", `color-${color}`, small && "avatar-small")}
      title={name}
    >
      {image && image !== failedImage ? (
        <Image
          src={image}
          alt=""
          width={32}
          height={32}
          unoptimized
          onError={() => setFailedImage(image)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
export function StatusIcon({ status }: { status: Status }) {
  const Icon = {
    backlog: CircleDashed,
    todo: Circle,
    in_progress: CircleDot,
    review: CircleCheck,
    done: CheckCircle2,
  }[status];
  return (
    <Icon
      size={17}
      className={`status-icon status-${status}`}
      aria-hidden="true"
    />
  );
}
export function PriorityIcon({ priority }: { priority: Priority }) {
  const Icon =
    {
      none: Minus,
      low: ArrowDown,
      medium: Minus,
      high: ChevronUp,
      urgent: ChevronsUp,
    }[priority] || Flag;
  return (
    <Icon
      size={15}
      className={`priority-icon priority-${priority}`}
      aria-hidden="true"
    />
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          ref={contentRef}
          className={clsx("modal", wide && "modal-wide", className)}
          onOpenAutoFocus={(e) => {
            returnFocus.current = document.activeElement as HTMLElement;
            const input = contentRef.current?.querySelector<HTMLElement>(
              "input:not([type=hidden]),textarea",
            );
            if (input) {
              e.preventDefault();
              input.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <header className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description
                className={description ? "modal-description" : "sr-only"}
              >
                {description || title}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label={t("Close dialog")}
            >
              <X size={18} />
            </Dialog.Close>
          </header>
          <div className="modal-body" tabIndex={0}>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Spinner() {
  const { t } = useI18n();
  return <LoaderCircle size={17} className="spin" aria-label={t("Loading")} />;
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
