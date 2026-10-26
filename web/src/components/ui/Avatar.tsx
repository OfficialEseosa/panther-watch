"use client";

import { useState } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Avatar.module.css";

export type AvatarProps = {
  /** Google picture URL. Missing or failing URLs fall back to initials. */
  src?: string | null;
  /** Used for initials and, when `alt` isn't given, nothing else (decorative by default). */
  name?: string | null;
  size?: 24 | 32 | 40 | 64;
  /** Alt text. Default "" (decorative: the name is next to it everywhere). */
  alt?: string;
  className?: string;
};

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Avatar (spec.md §2.18): a plain <img referrerPolicy="no-referrer"> (Google profile photos
 * refuse hotlinking with a referrer), initials on accent-subtle as the fallback. No caching.
 */
export function Avatar({ src, name, size = 32, alt = "", className }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <span
      className={cn(styles.avatar, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {showImage && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar; next/image adds nothing here
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          decoding="async"
          className={styles.image}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        // Drawn by CSS (::before), not as DOM text: the avatar is decorative, and as text the
        // initials became "visible text" missing from the button's name (WCAG 2.5.3 Label in Name).
        <span className={styles.initials} data-initials={initialsOf(name)} />
      )}
    </span>
  );
}
