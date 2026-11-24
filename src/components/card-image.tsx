import Image from "next/image";
import { imageSrc } from "@/lib/tcgdex";

/**
 * Imagem da carta. A URL base vem do catálogo e o `next.config` só aceita assets.tcgdex.net.
 * `unoptimized`: a TCGdex já serve webp pequeno (low) e assim não gastamos a cota de otimização da Vercel.
 */
export function CardImage({ base, alt, quality = "low", className = "" }: { base: string | null; alt: string; quality?: "low" | "high"; className?: string }) {
  const src = imageSrc(base, quality);
  if (!src) {
    return (
      <div className={`grid aspect-[63/88] place-items-center rounded-lg border border-dashed border-border bg-surface-2 text-center text-xs text-ink-3 ${className}`}>
        sem imagem
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={quality === "high" ? 600 : 245}
      height={quality === "high" ? 838 : 342}
      unoptimized
      loading="lazy"
      className={`aspect-[63/88] w-full rounded-lg bg-surface-2 object-contain ${className}`}
    />
  );
}
