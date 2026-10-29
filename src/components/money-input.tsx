"use client";
import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import {
  finishMoneyInput,
  moneyCaret,
  moneyInputDisplay,
  moneyInputValue,
  moneyInputEditValue,
} from "@/lib/money-input";

export function MoneyInput({
  value,
  onValueChange,
  decimalPlaces = 2,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onValueChange: (value: string) => void;
  decimalPlaces?: 2 | 6;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [invalid, setInvalid] = useState(false);
  const display = moneyInputDisplay(value);
  const invalidAmount = moneyInputValue(value, decimalPlaces) === null;
  useLayoutEffect(() => {
    if (caret.current !== null && document.activeElement === input.current) {
      const position = moneyCaret(display, caret.current);
      input.current?.setSelectionRange(position, position);
    }
    caret.current = null;
  });
  return (
    <>
      <input
        {...props}
        ref={input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        aria-invalid={invalid || invalidAmount || props["aria-invalid"]}
        onChange={(event) => {
          const raw = moneyInputEditValue(
            event.target.value,
            value,
            decimalPlaces,
          );
          setInvalid(raw === null);
          if (raw === null) return;
          caret.current = event.target.value
            .slice(0, event.target.selectionStart ?? event.target.value.length)
            .replaceAll(",", "").length;
          onValueChange(raw);
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          const position = event.currentTarget.selectionStart;
          if (
            event.defaultPrevented ||
            position === null ||
            position !== event.currentTarget.selectionEnd
          )
            return;
          const back =
            event.key === "Backspace" && display[position - 1] === ",";
          const forward = event.key === "Delete" && display[position] === ",";
          if (!back && !forward) return;
          event.preventDefault();
          const index =
            display.slice(0, position).replaceAll(",", "").length -
            (back ? 1 : 0);
          caret.current = index;
          setInvalid(false);
          onValueChange(value.slice(0, index) + value.slice(index + 1));
        }}
        onBlur={(event) => {
          caret.current = null;
          const normalized = finishMoneyInput(value);
          if (normalized !== value) onValueChange(normalized);
          props.onBlur?.(event);
        }}
      />
      {(invalid || invalidAmount) && (
        <small role="alert" className="form-error">
          Use digits, one decimal point, and up to {decimalPlaces} decimal
          places.
        </small>
      )}
    </>
  );
}
