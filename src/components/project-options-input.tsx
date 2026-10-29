"use client";
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Currency, ProjectCostOption } from "@/lib/project-model";

export type ProjectOptionsInputHandle = { focusName: (id: string) => void };
export function ProjectOptionsInput({
  value,
  onChange,
  activeId,
  onActiveChange,
  defaultCurrency,
  ref,
}: {
  value: ProjectCostOption[];
  onChange: (value: ProjectCostOption[]) => void;
  activeId: string;
  onActiveChange: (id: string) => void;
  defaultCurrency: Currency;
  ref?: Ref<ProjectOptionsInputHandle>;
}) {
  const root = useRef<HTMLDivElement>(null),
    name = useRef<HTMLInputElement>(null),
    id = useId();
  const [removing, setRemoving] = useState("");
  const [focusRequest, setFocusRequest] = useState<{
    target: "name" | "option" | "add";
  } | null>(null);
  // Focus the committed option before the browser can accept another field's
  // input. A queued animation-frame callback could steal that later input.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target =
      focusRequest.target === "name"
        ? name.current
        : root.current?.querySelector<HTMLButtonElement>(
            focusRequest.target === "option"
              ? '[aria-pressed="true"]'
              : ".project-add-option",
          );
    target?.focus();
  }, [focusRequest]);
  const active = value.find((option) => option.id === activeId) || value[0];
  const count = value.reduce((sum, option) => sum + option.items.length, 0);
  useImperativeHandle(ref, () => ({
    focusName(optionId) {
      onActiveChange(optionId);
      setRemoving("");
      setFocusRequest({ target: "name" });
    },
  }));
  function remove() {
    if (!active) return;
    const remaining = value.filter((option) => option.id !== active.id);
    onChange(remaining);
    onActiveChange(remaining[0]?.id || "");
    setRemoving("");
    setFocusRequest({ target: remaining.length ? "option" : "add" });
  }
  return (
    <div className="project-options-input" ref={root}>
      <div className="project-options-heading">
        <div>
          <h4 id={`${id}-heading`}>
            Project options <span>{value.length}/10</span>
          </h4>
          <p className="field-help">
            Define the options here, then enter each option’s costs below.
          </p>
        </div>
        <button
          type="button"
          className="button secondary small-button project-add-option"
          disabled={value.length >= 10}
          onClick={() => {
            let number = value.length + 1;
            while (
              value.some(
                (option) =>
                  option.title.trim().toLowerCase() === `option ${number}`,
              )
            )
              number++;
            const option: ProjectCostOption = {
              id: crypto.randomUUID(),
              title: `Option ${number}`,
              items:
                count < 50
                  ? [
                      {
                        id: crypto.randomUUID(),
                        title: "",
                        unit: defaultCurrency,
                        amount: "",
                      },
                    ]
                  : [],
            };
            onChange([...value, option]);
            onActiveChange(option.id);
            setRemoving("");
            setFocusRequest({ target: "name" });
          }}
        >
          <Plus size={14} />
          Add option
        </button>
      </div>
      {value.length > 0 && (
        <div
          className="project-option-choices"
          role="group"
          aria-labelledby={`${id}-heading`}
        >
          {value.map((option, index) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={option.id === active?.id}
              onClick={() => {
                onActiveChange(option.id);
                setRemoving("");
              }}
            >
              {option.title.trim() || `Untitled option ${index + 1}`}
            </button>
          ))}
        </div>
      )}
      {active ? (
        <>
          <div className="project-option-name-row">
            <label htmlFor={`${id}-name`}>
              Option name
              <input
                id={`${id}-name`}
                ref={name}
                aria-label="Option name"
                maxLength={120}
                required
                value={active.title}
                onChange={(event) =>
                  onChange(
                    value.map((option) =>
                      option.id === active.id
                        ? { ...option, title: event.target.value }
                        : option,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove option"
              onClick={() =>
                active.items.length ? setRemoving(active.id) : remove()
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
          {removing === active.id && (
            <div
              className="cost-option-remove"
              role="group"
              aria-label="Remove cost option"
            >
              <p>
                Remove “{active.title || "Untitled option"}” and its{" "}
                {active.items.length} cost items? This takes effect when you
                save.
              </p>
              <button
                type="button"
                className="button secondary small-button"
                onClick={() => setRemoving("")}
              >
                Keep option
              </button>
              <button
                type="button"
                className="button danger-button small-button"
                onClick={remove}
              >
                Remove option and costs
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="cost-empty-note">
          No options yet. Add an option to enter its costs.
        </p>
      )}
    </div>
  );
}
