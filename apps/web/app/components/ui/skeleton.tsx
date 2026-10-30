import { cn } from "cn"

// Decorative unless labelled: a labelled skeleton is a polite loading status ("Reading fan data").
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const labelled = props["aria-label"] != null
  return (
    <div
      data-slot="skeleton"
      role={labelled ? "status" : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
