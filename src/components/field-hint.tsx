import type { ReactNode } from "react";
export function FieldHint({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <small id={id} className="field-hint">
      {children}
    </small>
  );
}
