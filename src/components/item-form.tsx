"use client";

import Link from "next/link";
import { saveItemAction } from "@/app/(app)/actions";
import { Alert, Field, SubmitButton, inputCls, useFormAction } from "@/components/ui";
import { CONDITIONS, CONDITION_LABEL, LANGUAGES, LANGUAGE_LABEL, VARIANTS, VARIANT_LABEL, type Variant } from "@/lib/valuation";

export interface ItemInitial {
  id?: string;
  cardId: string;
  /** idioma do catálogo em que a carta foi achada (pt|en|ja); só na criação */
  lang?: string;
  variant: Variant;
  condition: string;
  ownedLanguage: string;
  quantity: string;
  paid: string;
  manual: string;
  note: string;
}

/** Cadastro e edição de uma carta da coleção. `variants` = as variantes que a carta tem (vazio = qualquer). */
export function ItemForm({ initial, variants, cancelHref }: { initial: ItemInitial; variants: Variant[]; cancelHref: string }) {
  const [state, onSubmit, pending] = useFormAction(saveItemAction, {});
  const err = state.fieldErrors ?? {};
  const options = variants.length > 0 ? variants : [...VARIANTS];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="cardId" value={initial.cardId} />
      {initial.lang ? <input type="hidden" name="lang" value={initial.lang} /> : null}
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {err.cardId ? <Alert kind="error">{err.cardId}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Variante" error={err.variant}>
          <select name="variant" defaultValue={initial.variant} required className={inputCls}>
            {options.map((v) => (
              <option key={v} value={v}>
                {VARIANT_LABEL[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado de conservação" error={err.condition}>
          <select name="condition" defaultValue={initial.condition} required className={inputCls}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Idioma da carta que você tem" error={err.ownedLanguage}>
          <select name="ownedLanguage" defaultValue={initial.ownedLanguage} required className={inputCls}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantidade" error={err.quantity}>
          <input name="quantity" type="number" min={1} max={9999} step={1} defaultValue={initial.quantity} required inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Quanto pagou (R$, por carta)" error={err.paid} hint="Opcional. Serve para ver lucro ou prejuízo.">
          <input name="paid" defaultValue={initial.paid} inputMode="decimal" className={inputCls} placeholder="12,50" />
        </Field>
        <Field label="Valor manual (R$, por carta)" error={err.manual} hint="Opcional. Se preencher, vale este valor no lugar do estimado.">
          <input name="manual" defaultValue={initial.manual} inputMode="decimal" className={inputCls} placeholder="ex.: preço da LigaPokemon" />
        </Field>
      </div>

      <Field label="Observação" error={err.note}>
        <input name="note" defaultValue={initial.note} maxLength={200} className={inputCls} placeholder="Opcional" />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton pending={pending}>{initial.id ? "Salvar alterações" : "Adicionar à coleção"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-2 hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
