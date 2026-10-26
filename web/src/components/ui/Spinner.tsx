import { cn } from "@/lib/ui/cn";
import styles from "./Spinner.module.css";

/** 16 px (default) indeterminate spinner, decorative. Pair with aria-busy on the owner. */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(styles.spinner, className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
