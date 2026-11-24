import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { ItemForm } from "@/components/item-form";
import { Alert } from "@/components/ui";
import { appContext } from "@/lib/app";
import { pickBasePrice } from "@/lib/price-pick";
import { ensureCard } from "@/lib/price-service";
import { CARD_ID_RE } from "@/lib/validation";
import { VARIANTS, type Variant } from "@/lib/valuation";

export const metadata = { title: "Adicionar carta" };

const LANG_MAP = { pt: "PT", en: "EN", ja: "JP" } as const;

export default async function NovaCarta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { db } = await appContext();
  const raw = await searchParams;
  const id = String((Array.isArray(raw.card) ? raw.card[0] : raw.card) ?? "");
  const langRaw = String((Array.isArray(raw.lang) ? raw.lang[0] : raw.lang) ?? "");
  const lang = langRaw === "pt" || langRaw === "en" || langRaw === "ja" ? langRaw : undefined;

  if (!CARD_ID_RE.test(id)) {
    return <Alert kind="error">Carta inválida. Volte e escolha uma carta na busca.</Alert>;
  }
  let data = null;
  try {
    data = await ensureCard(db, id, { lang });
  } catch {
    return (
      <div className="space-y-3">
        <Alert kind="error">Não foi possível falar com a TCGdex agora. Tente de novo em instantes.</Alert>
        <Link href="/buscar" className="text-sm text-accent hover:underline">
          Voltar para a busca
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Alert kind="error">Carta não encontrada no catálogo.</Alert>
        <Link href="/buscar" className="text-sm text-accent hover:underline">
          Voltar para a busca
        </Link>
      </div>
    );
  }

  const { card, prices } = data;
  const available = VARIANTS.filter((v) => card.variants[v]) as Variant[];
  const first = available[0] ?? "normal";
  const pickedPrice = pickBasePrice(prices, first, true);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Adicionar carta</h1>
      <div className="flex gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="w-32 shrink-0 sm:w-40">
          <CardImage base={card.imageBase} alt={card.name} quality="high" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold">{card.name}</div>
          <div className="text-sm text-ink-2">
            {card.setName ?? card.setId} · nº {card.localId}
            {card.rarity ? ` · ${card.rarity}` : ""}
          </div>
          {data.stale ? <p className="mt-2 text-xs text-gold">Mostrando dados antigos: o catálogo não respondeu agora.</p> : null}
          {!pickedPrice ? <p className="mt-2 text-xs text-ink-3">Esta carta ainda não tem preço nas fontes. Você pode informar um valor manual.</p> : null}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <ItemForm
          cancelHref="/buscar"
          variants={available}
          initial={{
            cardId: card.id,
            lang: card.catalogLang,
            variant: first,
            condition: "NM",
            ownedLanguage: LANG_MAP[card.catalogLang as keyof typeof LANG_MAP] ?? "EN",
            quantity: "1",
            paid: "",
            manual: "",
            note: "",
          }}
        />
      </div>
    </div>
  );
}
