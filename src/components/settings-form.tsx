"use client";

import { resetSettingsAction, saveSettingsAction } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { Alert, Field, SubmitButton, inputCls, useFormAction } from "@/components/ui";
import { bpToPercent } from "@/lib/format";
import type { Settings } from "@/lib/settings";
import { CONDITIONS, CONDITION_LABEL, LANGUAGES, LANGUAGE_LABEL } from "@/lib/valuation";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, onSubmit, pending] = useFormAction(saveSettingsAction, {});
  const err = state.fieldErrors ?? {};
  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        {state.error ? <Alert kind="error">{state.error}</Alert> : null}
        {state.ok ? <Alert kind="ok">{state.ok}</Alert> : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Fator por estado de conservação (% do preço Near Mint)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {CONDITIONS.map((c) => (
              <Field key={c} label={CONDITION_LABEL[c]} error={err[c]}>
                <input name={c} defaultValue={bpToPercent(settings.factors.conditions[c])} required inputMode="decimal" className={inputCls} />
              </Field>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Fator por idioma da carta (% do preço)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {LANGUAGES.map((l) => (
              <Field key={l} label={LANGUAGE_LABEL[l]} error={err[l]}>
                <input name={l} defaultValue={bpToPercent(settings.factors.languages[l])} required inputMode="decimal" className={inputCls} />
              </Field>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Fonte de preço</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="useCardmarketFallback" defaultChecked={settings.useCardmarketFallback} className="mt-1 h-4 w-4" />
            <span>
              <strong>Usar o Cardmarket (euro) quando não houver preço em dólar</strong>
              <span className="block text-xs text-ink-2">
                O preço principal é o TCGplayer, em dólar. Cartas japonesas só têm preço no Cardmarket. Desligado, elas ficam &quot;sem preço&quot; até você informar um valor manual.
              </span>
            </span>
          </label>
        </section>

        <SubmitButton pending={pending}>Salvar</SubmitButton>
      </form>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs text-ink-2">
          Os valores iniciais (estado 100/85/65/45/25% e idioma EN 100, JP 95, PT 90%) são <strong>estimativas</strong>, não dados de mercado do Brasil. Ajuste olhando os preços que você vê na prática.
        </p>
        <ActionForm action={resetSettingsAction} confirm="Voltar aos valores iniciais?">
          Restaurar valores iniciais
        </ActionForm>
      </div>
    </div>
  );
}
