// MapLibre can't parse oklch(), so maps read the theme tokens and convert them to rgba
// by painting one pixel. Client-only.
export function tokenColor(name: string, alpha = 1, el: Element = document.documentElement): string {
  const value = getComputedStyle(el).getPropertyValue(`--${name}`).trim();
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!value || !ctx) return `rgba(128,128,128,${alpha})`;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${Math.round((a / 255) * alpha * 1000) / 1000})`;
}

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
