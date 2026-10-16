import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * Tabs (kit.html section 06). The default list is the underline tabs used
 * inside a page: 14px muted labels, the current one in ink with a 2px ink
 * underline. "segmented" is the soft grey switch for views, with the
 * current option raised on white. ("line" is kept as an alias of default.)
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-[var(--ds-muted)] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "gap-1 bg-transparent",
        line: "gap-1 bg-transparent",
        segmented: "gap-0.5 rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 text-[14px] whitespace-nowrap text-[var(--ds-muted)] outline-none transition-colors duration-[120ms] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-40 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // underline tabs
        "group-data-[variant=default]/tabs-list:border-b-2 group-data-[variant=default]/tabs-list:border-transparent group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:pt-[7px] group-data-[variant=default]/tabs-list:pb-3 group-data-[variant=default]/tabs-list:data-[state=active]:border-[var(--ds-ink)]",
        "group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:pt-[7px] group-data-[variant=line]/tabs-list:pb-3 group-data-[variant=line]/tabs-list:data-[state=active]:border-[var(--ds-ink)]",
        // segmented switch
        "group-data-[variant=segmented]/tabs-list:rounded-[8px] group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:py-1.5 group-data-[variant=segmented]/tabs-list:text-[13.5px] group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-[var(--ds-surface)] group-data-[variant=segmented]/tabs-list:data-[state=active]:shadow-[var(--ds-shadow-s)]",
        "data-[state=active]:font-medium data-[state=active]:text-[var(--ds-ink)]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
