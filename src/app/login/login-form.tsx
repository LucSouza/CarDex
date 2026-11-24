"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Alert, Field, SubmitButton, inputCls } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      <Field label="Usuário" error={state.fieldErrors?.username}>
        <input name="username" autoComplete="username" autoCapitalize="none" required maxLength={60} className={inputCls} />
      </Field>
      <Field label="Senha" error={state.fieldErrors?.password}>
        <input name="password" type="password" autoComplete="current-password" required maxLength={200} className={inputCls} />
      </Field>
      <SubmitButton className="w-full" pendingText="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
