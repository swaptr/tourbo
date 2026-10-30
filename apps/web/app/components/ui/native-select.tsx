import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

// Heights match Button / Input / Toggle / TabsList: xs h-6, sm h-7, default h-8, lg h-9, xl h-10.
const nativeSelectVariants = cva(
  "w-full min-w-0 appearance-none rounded-lg border border-field bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-8",
        xs: "h-6 rounded-[min(var(--radius-md),10px)] py-0 pr-6 pl-2 text-xs",
        sm: "h-7 rounded-[min(var(--radius-md),10px)] py-0.5",
        lg: "h-9",
        xl: "h-10 pl-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> &
  VariantProps<typeof nativeSelectVariants>

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={nativeSelectVariants({ size })}
        {...props}
      />
      <ChevronDownIcon
        className={cn(
          "pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none",
          size === "xs" && "right-1.5 size-3.5"
        )}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  nativeSelectVariants,
}
