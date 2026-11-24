import { SettingsForm } from "@/components/settings-form";
import { appContext } from "@/lib/app";

export const metadata = { title: "Configurações" };

export default async function Config() {
  const { settings } = await appContext();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-ink-2">Como o valor estimado das suas cartas é calculado. Vale só para a sua conta.</p>
      </div>
      <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink-2">
        Valor estimado = preço (em dólar) x câmbio do dia x fator do estado x fator do idioma. Um valor manual na carta sempre vence o estimado.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
