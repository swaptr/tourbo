import { Popover } from "@base-ui/react/popover";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

// The one "?" / "why?" pattern: a small button that opens a popover on click or tap (and on hover
// with a pointer), so explanations never shift the layout. Content renders only while open, in a
// portal on <body> (cards with overflow-hidden can't clip it), and always stays inside the
// viewport: flip to the other side, shift along the edge, 8 px padding, scroll when tall.
export function Hint({
  children,
  label = "More info",
  text,
  className,
  side = "bottom",
  align = "start",
}: {
  children: ReactNode;
  label?: string; // accessible name of the icon trigger
  text?: string; // visible trigger text, e.g. "why?"; omitted = a "?" icon
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        aria-label={text ? undefined : label}
        data-hint=""
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full align-middle text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          // One look for every text trigger ("why?", "more"): a small outlined pill, never an underlined link.
          text ? "h-6 rounded-full border border-border px-2 text-xs leading-none text-foreground/80 hover:bg-muted" : "size-6 justify-center",
          className,
        )}
      >
        {text ?? <CircleHelp className="size-4" />}
        {/* Visible text ("why?") stays the start of the name; the label says what it explains. */}
        {text && label !== "More info" && <span className="sr-only">: {label}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "end" }}
          className="isolate z-50"
        >
          <Popover.Popup
            data-hint-popup=""
            className="max-h-[min(24rem,calc(var(--available-height)-8px))] w-max max-w-[min(280px,calc(100vw-16px))] origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
