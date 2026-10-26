import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import type { SectionMeta } from "@/lib/courses/meta";
import { cn } from "@/lib/ui/cn";
import { featuredGrades, formatGpa, gpaBadgeTone, usableRating } from "./format";
import styles from "./MetaBadges.module.css";

/** "GPA 3.12" toned by gpaTone; null when there is no grade history (no "N/A" badges). */
export function GpaBadge({ meta, className }: { meta: SectionMeta | undefined; className?: string }) {
  const featured = featuredGrades(meta?.grades);
  if (!featured || featured.aggregate.gpa == null) return null;
  const who = featured.instructor ? "this instructor" : "all instructors";
  return (
    <Badge
      tone={gpaBadgeTone(featured.aggregate.gpa)}
      className={className}
      title={`Average GPA for ${who} (${featured.aggregate.total} grades)`}
    >
      <span className="sr-only">Average </span>GPA {formatGpa(featured.aggregate.gpa)}
      {featured.instructor ? null : <span className="sr-only"> across all instructors</span>}
    </Badge>
  );
}

/** RMP chip (spec.md §2.6): logo + score; null when there is no usable rating. */
export function RmpBadge({ meta, className }: { meta: SectionMeta | undefined; className?: string }) {
  const rating = usableRating(meta);
  if (!rating || rating.avgRating == null) return null;
  return (
    <span
      className={cn(styles.rmp, className)}
      title={`${rating.avgRating.toFixed(1)} out of 5 on Rate My Professors (${rating.numRatings} ratings)`}
    >
      <Image src="/brand/rmp.svg" alt="" width={28} height={16} className={styles.logo} unoptimized />
      <span className="sr-only">Rate My Professors </span>
      <span className={styles.score}>{rating.avgRating.toFixed(1)}</span>
      <span className="sr-only"> out of 5</span>
    </span>
  );
}
