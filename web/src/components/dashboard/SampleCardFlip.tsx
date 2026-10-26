"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { SampleCourseCard } from "./SampleCourseCard";
import styles from "./SampleCardFlip.module.css";

const MAX_TILT_DEG = 8;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The landing page's sample course card as a 3D card: click / tap / Enter / Space flips it to
 * the panther on GSU blue; a mouse tilts it gently toward the pointer; it floats a little when
 * idle. Pure CSS 3D transforms; React only toggles the side and writes the tilt variables.
 * Reduced motion: no tilt or float, and the flip is an instant swap.
 */
export function SampleCardFlip({ className }: { className?: string }) {
  const [flipped, setFlipped] = useState(false);
  // Set after the first flip, so the mid-flip lift never plays on page load.
  const [touched, setTouched] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);

  const flip = () => {
    setTouched(true);
    setFlipped((value) => !value);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || event.pointerType !== "mouse" || window.matchMedia(REDUCED_MOTION).matches) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.dataset.tilting = "";
    el.style.setProperty("--tilt-x", `${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
  };

  const onPointerLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flip();
    }
  };

  return (
    <div className={cn(styles.scene, className)}>
      <div
        ref={tiltRef}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        className={styles.tilt}
        onClick={flip}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {/* The name comes from this text, not aria-label: both faces are decorative (aria-hidden),
            and an aria-label over visible text fails axe's label-content-name-mismatch. */}
        <span className="sr-only">Flip sample card</span>
        <div className={styles.lift} data-flip={touched ? (flipped ? "back" : "front") : undefined}>
          <div className={cn(styles.flipper, flipped && styles.flipped)}>
            <div className={cn(styles.face, styles.front)}>
              <SampleCourseCard className={styles.card} />
            </div>
            <div className={cn(styles.face, styles.back)} aria-hidden="true">
              <Image
                src="/brand/panther-128.webp"
                alt=""
                width={161}
                height={128}
                unoptimized
                className={styles.logo}
              />
              <p className={styles.wordmark}>PantherWatch</p>
              <p className={styles.tagline}>Georgia State monitoring suite</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
