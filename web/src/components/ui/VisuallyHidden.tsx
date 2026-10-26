import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/ui/cn";

export type VisuallyHiddenProps = ComponentProps<"span"> & { as?: ElementType };

/** Content for assistive tech only (uses the global `.sr-only` class). */
export function VisuallyHidden({ as: Element = "span", className, ...rest }: VisuallyHiddenProps) {
  return <Element className={cn("sr-only", className)} {...rest} />;
}
