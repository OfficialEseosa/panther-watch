import { cn } from "@/lib/ui/cn";
import styles from "./LiquidFill.module.css";

/**
 * The AI Assistant pill's moving fill (motion.md 4.20): three fields of tiny dots flowing through
 * the brand blue at different speeds, over one faint drifting navy mass. Decorative; the parent
 * supplies the shape (`position: relative`, `isolation: isolate`, a border radius) and the white
 * label on top.
 */
export function LiquidFill({ className }: { className?: string }) {
  return (
    <span className={cn(styles.fill, className)} aria-hidden="true">
      <span className={styles.mass} />
      <span className={cn(styles.dots, styles.far)} />
      <span className={cn(styles.dots, styles.mid)} />
      <span className={cn(styles.dots, styles.near)} />
    </span>
  );
}
