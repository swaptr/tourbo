import claudeDark from "~/assets/logos/claude.svg?url";
import claudeLight from "~/assets/logos/claude-white.svg?url";
import geminiDark from "~/assets/logos/gemini-cli.svg?url";
import geminiLight from "~/assets/logos/gemini-cli-white.svg?url";
import qlooDark from "~/assets/logos/qloo.svg?url";
import qlooLight from "~/assets/logos/qloo-white.svg?url";
import { cn } from "~/lib/utils";

// Official brand files, unmodified, used only to say "works with" (no endorsement implied).
// ChatGPT has no public official logo file, so it's a plain text label.
type Brand = { id: string; name: string; onDark?: string; onLight?: string; h: string };
export const BRANDS: Record<"qloo" | "claude" | "chatgpt" | "gemini", Brand> = {
  qloo: { id: "qloo", name: "Qloo", onDark: qlooLight, onLight: qlooDark, h: "h-5" },
  claude: { id: "claude", name: "Claude", onDark: claudeLight, onLight: claudeDark, h: "h-5" },
  chatgpt: { id: "chatgpt", name: "ChatGPT", h: "h-5" },
  gemini: { id: "gemini", name: "Gemini CLI", onDark: geminiLight, onLight: geminiDark, h: "h-5" },
};

export function BrandMark({ brand, className }: { brand: Brand; className?: string }) {
  if (!brand.onDark || !brand.onLight) return <span className={cn("font-heading text-lg leading-none", className)}>{brand.name}</span>;
  return (
    <>
      <img src={brand.onLight} alt={brand.name} className={cn(brand.h, "w-auto dark:hidden", className)} />
      <img src={brand.onDark} alt={brand.name} className={cn(brand.h, "hidden w-auto dark:block", className)} />
    </>
  );
}
