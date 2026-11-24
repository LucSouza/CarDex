"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/(app)/actions";

/**
 * Botão pequeno que dispara uma Server Action (com confirmação opcional) e mostra o resultado ao lado.
 * `fields` vira <input type="hidden">; `extra` são campos visíveis antes do botão (ex.: um select).
 */
export function ActionForm({
  action,
  fields = {},
  children,
  confirm,
  className = "rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2",
  extra,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields?: Record<string, string>;
  children: ReactNode;
  confirm?: string;
  className?: string;
  extra?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {extra}
      <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
        {pending ? "…" : children}
      </button>
      {state.error ? <span role="alert" className="text-xs text-danger">{state.error}</span> : null}
      {state.ok ? <span role="status" className="text-xs text-ok">{state.ok}</span> : null}
    </form>
  );
}
