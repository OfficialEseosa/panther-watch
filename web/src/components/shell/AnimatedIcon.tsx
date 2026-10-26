"use client";

import { useState } from "react";
import type { AnimationEvent, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./AnimatedIcon.module.css";

export type AnimatedIconProps = {
  /** The icon element, e.g. <SearchIcon size={24} /> (an element, so server components can pass it). */
  children: ReactNode;
  /** The item is the current page: the icon's micro-animation plays when this turns true. */
  active?: boolean;
  /** Changes on each navigation (the pathname), so the play repeats on every visit. */
  playKey?: string;
  className?: string;
};

/**
 * A nav icon with a per-icon micro-animation (styles keyed on the SVG's `data-icon`):
 * dashboard tiles pop in, the magnifier takes a quick look, the bookmark bounces and fills,
 * the calendar squashes and pops, the gear turns a quarter, the shield pulses with a ring.
 * Plays once when the item becomes active, and on hover / keyboard focus of the nearest
 * `[data-anim-host]` ancestor (the nav link or card). Nothing plays under reduced motion.
 */
export function AnimatedIcon({ active = false, playKey, ...rest }: AnimatedIconProps) {
  // A new key remounts the player, which starts a fresh play.
  return <IconPlayer key={active ? `on:${playKey ?? ""}` : "off"} play={active} {...rest} />;
}

function IconPlayer({
  children,
  play,
  className,
}: Omit<AnimatedIconProps, "active" | "playKey"> & { play: boolean }) {
  const [done, setDone] = useState(false);
  // The play attribute comes off once every part has finished, so hover can replay later
  // without the route play restarting when the pointer leaves.
  const onAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (event.currentTarget.getAnimations({ subtree: true }).length === 0) setDone(true);
  };
  return (
    <span
      className={cn(styles.wrap, className)}
      data-playing={(play && !done) || undefined}
      onAnimationEnd={play && !done ? onAnimationEnd : undefined}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
