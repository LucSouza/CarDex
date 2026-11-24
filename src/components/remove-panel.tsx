"use client";

import { useState } from "react";
import { removeItemAction } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { inputCls } from "@/components/ui";

/** Tirar a carta da coleção (vendida, trocada ou outro). Vai para o histórico e pode ser desfeito. */
export function RemovePanel({ id }: { id: string }) {
  const [reason, setReason] = useState("SOLD");
  return (
    <div className="space-y-3 rounded-xl border border-danger/30 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">Tirar da coleção</h2>
        <p className="text-xs text-ink-2">A carta sai do total e vai para o Histórico. Dá para desfazer depois.</p>
      </div>
      <ActionForm
        action={removeItemAction}
        fields={{ id, reason }}
        confirm="Tirar esta carta da coleção?"
        className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
        extra={
          <>
            <select aria-label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="SOLD">Vendida</option>
              <option value="TRADED">Trocada</option>
              <option value="OTHER">Outro motivo</option>
            </select>
            {reason === "SOLD" ? <input name="sold" aria-label="Valor da venda" placeholder="Vendeu por (R$)" inputMode="decimal" className={`${inputCls} w-40`} /> : null}
          </>
        }
      >
        Tirar da coleção
      </ActionForm>
    </div>
  );
}
