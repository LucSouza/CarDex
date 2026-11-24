import type { ReactNode } from "react";

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "ok" | "danger" }) {
  const color = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`tabular mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-2">{hint}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "ok" }) {
  const cls = {
    neutral: "border-border text-ink-2",
    accent: "border-accent/40 bg-accent/10 text-accent",
    warn: "border-gold/50 bg-gold/10 text-gold",
    ok: "border-ok/40 bg-ok/10 text-ok",
  }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Card({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}
