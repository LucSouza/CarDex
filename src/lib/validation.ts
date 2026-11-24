import { z } from "zod";
import { CONDITIONS, LANGUAGES, VARIANTS } from "./valuation";

/** Erro com mensagem segura para mostrar à pessoa. */
export class UserError extends Error {}

/** "12,50", "1.234,56", "12.5" -> 1250 / 123456 / 1250 (centavos). Vazio = null. Inválido = erro. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/i, "");
  if (s === "") return null;
  let norm: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) norm = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(s)) norm = s.replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(s)) norm = s;
  else throw new UserError("Valor inválido. Use o formato 12,50.");
  const [int, frac = ""] = norm.split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_00) throw new UserError("Valor alto demais.");
  return cents;
}

const money = z
  .string()
  .max(20, "Valor inválido.")
  .transform((v, ctx) => {
    try {
      return parseMoney(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof UserError ? e.message : "Valor inválido." });
      return z.NEVER;
    }
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

export const CARD_ID_RE = /^[A-Za-z0-9._-]{1,40}$/;

/** Cadastro/edição de uma carta na coleção. */
export const itemFormSchema = z.object({
  cardId: z.string().regex(CARD_ID_RE, "Carta inválida."),
  variant: z.enum(VARIANTS, "Escolha a variante."),
  condition: z.enum(CONDITIONS, "Escolha o estado."),
  ownedLanguage: z.enum(LANGUAGES, "Escolha o idioma."),
  quantity: z.coerce.number().int("Quantidade inválida.").min(1, "Mínimo 1.").max(9999, "Máximo 9999."),
  paid: money.default(null),
  manual: money.default(null),
  note: optionalText(200).default(null),
});
export type ItemForm = z.infer<typeof itemFormSchema>;

export const removeFormSchema = z.object({
  id: z.uuid("Carta inválida."),
  reason: z.enum(["SOLD", "TRADED", "OTHER"], "Escolha o motivo."),
  sold: money.default(null),
});

/** Fatores em PORCENTAGEM na tela (ex.: "85" ou "85,5") -> basis points. */
const percent = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(v);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Use um número de 0 a 200 (ex.: 85)." });
      return z.NEVER;
    }
    const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
    if (bp > 20_000) {
      ctx.addIssue({ code: "custom", message: "No máximo 200%." });
      return z.NEVER;
    }
    return bp;
  });

export const settingsFormSchema = z.object({
  NM: percent,
  SP: percent,
  MP: percent,
  HP: percent,
  D: percent,
  EN: percent,
  JP: percent,
  PT: percent,
  /** checkbox: desmarcado = a chave nem vem no FormData */
  useCardmarketFallback: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Informe o usuário.").max(60),
  password: z.string().min(1, "Informe a senha.").max(200),
});

export const searchSchema = z.object({
  name: z.string().trim().max(60).default(""),
  number: z.string().trim().max(12).default(""),
  setId: z.string().trim().max(40).default(""),
  page: z.coerce.number().int().min(1).max(50).catch(1).default(1),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "_");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export const centsToInput = (c: number | null): string => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
