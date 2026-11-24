const TZ = "America/Sao_Paulo";

/** Centavos de R$ -> "R$ 1.234,56" (sem float: separa inteiro e centavos). */
export function fmtBRL(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R$ ${int},${frac}`;
}

/** Centésimos da moeda de origem -> "US$ 3,98" / "€ 20,96". */
export function fmtMinor(minor: number, currency: "USD" | "EUR"): string {
  const int = Math.floor(minor / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = String(minor % 100).padStart(2, "0");
  return `${currency === "USD" ? "US$" : "€"} ${int},${frac}`;
}

export function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Idade legível de uma data ("há 3 h", "há 2 dias"). */
export function ago(d: Date, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Basis points -> "90" ou "45,5" (para os campos de porcentagem). */
export function bpToPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}
