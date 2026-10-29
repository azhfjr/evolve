"use client";
import { Modal } from "../ui";
export function BoardModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      open
      wide
      className="br-modal br-shared-modal"
      title={title}
      description="Board Room · Shared project monitoring"
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}
