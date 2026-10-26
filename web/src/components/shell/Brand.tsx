import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import styles from "./Brand.module.css";

/** The panther mark is 901×715; widths below keep that ratio for each rendered height. */
const WIDTH_FOR: Record<28 | 32 | 40, number> = { 28: 35, 32: 40, 40: 50 };

export type BrandProps = {
  href?: string;
  /** Mark height: 28 (top bar, legal), 32 (sidebar), 40 (landing header). */
  size?: 28 | 32 | 40;
  /** Show the "PantherWatch" wordmark next to the mark. */
  showName?: boolean;
  /** Preload the mark (landing page only). */
  priority?: boolean;
  className?: string;
  /** Extra class for the wordmark (e.g. to hide it on the rail). */
  nameClassName?: string;
};

/** Panther mark + wordmark, linking home (spec.md §1.10). */
export function Brand({
  href = "/",
  size = 32,
  showName = true,
  priority = false,
  className,
  nameClassName,
}: BrandProps) {
  return (
    <Link href={href} className={cn(styles.brand, className)} aria-label={showName ? undefined : "PantherWatch"}>
      <Image
        src="/brand/panther-128.webp"
        alt=""
        width={WIDTH_FOR[size]}
        height={size}
        priority={priority}
        unoptimized
        className={styles.mark}
      />
      {showName ? <span className={cn(styles.name, nameClassName)}>PantherWatch</span> : null}
    </Link>
  );
}
