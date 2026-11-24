"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

/**
 * Como useActionState, mas envia via onSubmit: o React 19 limpa formulários com `action`
 * depois do envio — num erro de validação a pessoa perderia tudo o que digitou.
 */
export function useFormAction<S extends object>(fn: (prev: S, fd: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    fn as (prev: Awaited<S>, fd: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}

export function SubmitButton({
  children,
  className = "",
  pendingText = "Salvando…",
  pending: pendingProp,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${kind === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-ok"}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
