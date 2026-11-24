import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="mx-auto max-w-sm pt-10">
      <div className="mb-3 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">PokeDex</h1>
        <p className="mb-5 text-sm text-ink-2">Entre para ver a sua coleção de cartas e o valor estimado.</p>
        <LoginForm />
      </div>
    </div>
  );
}
