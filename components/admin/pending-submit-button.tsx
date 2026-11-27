"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  children: ReactNode;
  pendingLabel: string;
  /** Asks before submitting actions the owner cannot undo from the admin (archive, remove a photo). */
  confirmMessage?: string;
};

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel,
  confirmMessage,
  onClick,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      type="submit"
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
