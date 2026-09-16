"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useTransition,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

const GetNavigationPendingContext = createContext(false);

type GetNavigationFormProps = {
  action?: string;
  children: ReactNode;
  className?: string;
};

export function GetNavigationForm({
  action,
  children,
  className,
}: GetNavigationFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submissionInProgress = useRef(false);

  useEffect(() => {
    if (!isPending) {
      submissionInProgress.current = false;
    }
  }, [isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionInProgress.current) return;
    submissionInProgress.current = true;

    const query = new URLSearchParams();
    const formData = new FormData(event.currentTarget);

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value !== "") {
        query.append(key, value);
      }
    }

    const target = action ?? pathname;
    const queryString = query.toString();

    startTransition(() => {
      router.push(queryString ? `${target}?${queryString}` : target);
    });
  }

  return (
    <GetNavigationPendingContext.Provider value={isPending}>
      <form
        action={action}
        method="get"
        className={className}
        onSubmit={handleSubmit}
        aria-busy={isPending}
      >
        {children}
      </form>
    </GetNavigationPendingContext.Provider>
  );
}

type GetNavigationSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  children: ReactNode;
  pendingLabel: string;
};

export function GetNavigationSubmitButton({
  children,
  disabled,
  pendingLabel,
  ...props
}: GetNavigationSubmitButtonProps) {
  const isPending = useContext(GetNavigationPendingContext);

  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || isPending}
      aria-disabled={disabled || isPending}
    >
      {isPending ? pendingLabel : children}
    </button>
  );
}
