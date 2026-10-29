"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type AriaAttributes,
  type ReactNode,
} from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { PriorityIcon, StatusIcon } from "./ui";
import { PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/types";

// Radix manages aria-hidden and focus trapping. Use an independent inert scope:
// sharing aria-hidden's counters for both attributes can leave a parent dialog
// hidden when nested pickers close.
function inertBackground(menu: HTMLElement) {
  const changed: HTMLElement[] = [];
  let branch: HTMLElement | null = menu;
  while (branch?.parentElement && branch !== document.body) {
    const parent: HTMLElement = branch.parentElement;
    for (const sibling of parent.children) {
      if (
        sibling !== branch &&
        sibling instanceof HTMLElement &&
        !sibling.inert &&
        !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)
      ) {
        sibling.inert = true;
        changed.push(sibling);
      }
    }
    branch = parent;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of changed) element.inert = false;
  };
}

const EMPTY = "__evolve_empty_option__";
type Option = {
  value: string;
  text: string;
  disabled: boolean;
  color?: string;
};
function plainText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child): string =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("");
}
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
        "data-color"?: string;
      }>(child)
    )
      return [];
    if (child.type === Fragment) return optionsFrom(child.props.children);
    if (child.type !== "option") return [];
    const text = plainText(child.props.children);
    return [
      {
        value: String(child.props.value ?? text),
        text,
        disabled: Boolean(child.props.disabled),
        color: child.props["data-color"],
      },
    ];
  });
}
function OptionIcon({ option }: { option: Option }) {
  if ((STATUSES as readonly string[]).includes(option.value))
    return <StatusIcon status={option.value as Status} />;
  if ((PRIORITIES as readonly string[]).includes(option.value))
    return <PriorityIcon priority={option.value as Priority} />;
  if (option.color)
    return (
      <i className={`select-swatch color-${option.color}`} aria-hidden="true" />
    );
  return null;
}

/** A single accessible, keyboard-operated picker for workspace forms and filters. */
export function AppSelect({
  value,
  onValueChange,
  children,
  disabled,
  name,
  form,
  required,
  className = "",
  ...labelProps
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  name?: string;
  form?: string;
  required?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
}) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const releaseBackground = useRef<(() => void) | null>(null);
  // The portal mounts after the open state update. Suppress the background
  // when its actual DOM node arrives, and restore it when the portal unmounts.
  const setMenu = useCallback((node: HTMLDivElement | null) => {
    releaseBackground.current?.();
    releaseBackground.current =
      node && openRef.current ? inertBackground(node) : null;
  }, []);
  const options = optionsFrom(children);
  const selected = options.find((option) => option.value === String(value));
  return (
    <Select.Root
      open={open}
      onOpenChange={(next) => {
        openRef.current = next;
        if (!next) {
          releaseBackground.current?.();
          releaseBackground.current = null;
        }
        setOpen(next);
      }}
      value={String(value) || EMPTY}
      onValueChange={(next) => onValueChange(next === EMPTY ? "" : next)}
      disabled={disabled}
      name={name}
      form={form}
      required={required}
    >
      <Select.Trigger
        ref={triggerRef}
        {...labelProps}
        className={`app-select ${className}`}
        data-value={String(value)}
      >
        <span className="select-value">
          {selected && <OptionIcon option={selected} />}
          <Select.Value />
        </span>
        <Select.Icon className="select-chevron">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          ref={setMenu}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openRef.current) return;
            releaseBackground.current?.();
            releaseBackground.current = null;
            const active = document.activeElement;
            // FocusScope restores focus after unmount. A user may already have
            // moved to another field; do not redirect their next keystrokes.
            if (
              active instanceof HTMLElement &&
              active !== document.body &&
              active !== triggerRef.current &&
              active !== triggerRef.current?.closest('[role="dialog"]') &&
              active.isConnected &&
              !active.closest('[role="listbox"]')
            )
              return;
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className="select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value || EMPTY}
                data-value={option.value}
                disabled={option.disabled}
                className="select-option"
              >
                <OptionIcon option={option} />
                <Select.ItemText>{option.text}</Select.ItemText>
                <Select.ItemIndicator className="select-check">
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
