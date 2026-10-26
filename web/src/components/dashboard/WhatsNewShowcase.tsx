"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BellIcon, CalendarCheckIcon, ClockIcon, MailIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import { SampleCourseCard } from "./SampleCourseCard";
import { FINALE_MS, WhatsNewFinale } from "./WhatsNewFinale";
import styles from "./WhatsNewShowcase.module.css";

/**
 * The "What's new" showcase: a port of the original app's full-screen 3D story
 * (old components/WhatsNew/WhatsNewShowcase.jsx, which used framer-motion). Same mechanics,
 * done with CSS 3D transforms and timers:
 *
 * - a dark blurred overlay with floating headline + subline above a 3D stage;
 * - one persistent "rotor" owns the turn for the whole story: it sweeps rotateY -22deg -> 22deg
 *   linearly across every scene (held at a 6deg tilt), never settling flat;
 * - scenes auto-advance; each swaps in place with a scale crossfade riding on that rotation;
 * - a "Welcome to PantherWatch" finale: the course card morphs into the expanded card and
 *   cycles its four sections, the headline fades, then the whole overlay fades out;
 * - Skip, Esc or a click outside the stage closes it.
 *
 * Reduced motion: no sweep and no looping visuals (each scene shows its settled state); scenes
 * still advance with plain fades.
 */

type Scene =
  | { kind: "blocks" | "alerts" | "card" | "schedule"; headline: string; sub: string; dur: number }
  | { kind: "welcome"; dur: number };

const SCENES: Scene[] = [
  {
    kind: "blocks",
    headline: "Rebuilt from the ground up",
    sub: "Faster, steadier, and easier to use on your laptop or your phone.",
    dur: 6600,
  },
  {
    kind: "card",
    headline: "Grade history and ratings, on every card",
    sub: "See how each professor grades and how students rate them, right on the course card.",
    dur: 4600,
  },
  {
    kind: "alerts",
    headline: "Seat alerts you can trust",
    sub: "We check every 3 minutes, and if a class fills and reopens, you’ll hear about it again.",
    dur: 4600,
  },
  {
    kind: "schedule",
    headline: "Your schedule, everywhere",
    sub: "Build it once, see it on any device, export it to Google or Apple Calendar.",
    dur: 4400,
  },
  // The finale's own timeline (WhatsNewFinale): morph, one cycle of the four sections, then the
  // headline fades; the overlay fades after this.
  { kind: "welcome", dur: FINALE_MS },
];

/** Runtime of the story scenes: the rotor sweeps across exactly this span. */
const STORY_MS = SCENES.filter((scene) => scene.kind !== "welcome").reduce((sum, scene) => sum + scene.dur, 0);
/** The card scene reveals the ratings chip and grade line after this long (the original's reveal beat). */
const REVEAL_AFTER_MS = 1100;
const EXIT_MS = 500;
const FADE_OUT_MS = 900;

const CUBES = [0, 1, 2, 3, 4, 5];
const FACES = ["fFront", "fBack", "fTop", "fBottom", "fLeft", "fRight"] as const;

/**
 * Six lit cubes: a wobbly tower that gives way, tumbles, and hops into a 3-2-1 pyramid, then
 * breathes. All motion is in the CSS (see the BLOCKS section of the module).
 */
function BlocksVisual() {
  return (
    <div className={styles.blocksStage}>
      <div className={styles.structure}>
        <div className={styles.floor}>
          {CUBES.map((index) => (
            <span key={index} className={cn(styles.shadow, styles[`sh${index}`])} />
          ))}
        </div>
        {CUBES.map((index) => (
          <div key={index} className={cn(styles.cube, styles[`k${index}`])}>
            {FACES.map((face) => (
              <span key={face} className={cn(styles.face, styles[face])} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A full section whose one seat opens, fills and reopens; the bell rings and an email lands each time. */
function AlertsVisual() {
  return (
    <div className={styles.alertsStage}>
      <div className={cn(styles.panel, styles.alertsPanel)}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelTitle}>Data Structures (CSC 2720)</p>
            <p className={styles.panelMeta}>
              <ClockIcon size={14} /> Checked 3 min ago
            </p>
          </div>
          <span className={styles.bell}>
            <BellIcon size={22} />
          </span>
        </div>
        <div className={styles.seats}>
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} className={cn(styles.seat, index === 7 && styles.seatHot)} />
          ))}
        </div>
        <p className={styles.seatsLegend}>
          <span className={styles.legendTaken}>Taken</span>
          <span className={styles.legendOpen}>Open</span>
        </p>
      </div>
      <div className={styles.mail}>
        <span className={styles.mailIcon}>
          <MailIcon size={18} />
        </span>
        <span>
          <strong>A seat opened</strong>
          <span className={styles.mailSub}>CSC 2720 · Section 003</span>
        </span>
      </div>
    </div>
  );
}

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"];
/** [day column, start row, rows, color class] on a 6-row grid. */
const BLOCKS: [number, number, number, "c1" | "c2" | "c3" | "c4"][] = [
  [1, 1, 2, "c1"],
  [3, 1, 2, "c1"],
  [2, 3, 2, "c2"],
  [4, 3, 2, "c2"],
  [1, 4, 2, "c3"],
  [5, 2, 3, "c4"],
];

/** The same week on a laptop-sized grid and a phone agenda, plus the calendar export. */
function ScheduleVisual() {
  return (
    <div className={styles.scheduleStage}>
      <div className={cn(styles.panel, styles.laptop)}>
        <div className={styles.weekHead}>
          {WEEK.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className={styles.weekGrid}>
          {BLOCKS.map(([day, row, span, color], index) => (
            <span
              key={index}
              className={cn(styles.classBlock, styles[color])}
              style={{ gridColumn: day, gridRow: `${row} / span ${span}` } as CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className={cn(styles.panel, styles.phone)}>
        <span className={styles.phoneNotch} />
        <p className={styles.phoneDay}>Monday</p>
        <span className={cn(styles.agendaRow, styles.c1)} />
        <span className={cn(styles.agendaRow, styles.c3)} />
        <span className={cn(styles.agendaRow, styles.c2, styles.agendaShort)} />
      </div>
      <div className={styles.exportPill}>
        <CalendarCheckIcon size={16} /> Added to your calendar
      </div>
    </div>
  );
}

function Visual({ kind, reveal }: { kind: Scene["kind"]; reveal: boolean }) {
  switch (kind) {
    case "blocks":
      return <BlocksVisual />;
    case "alerts":
      return <AlertsVisual />;
    case "card":
      return <SampleCourseCard reveal={reveal} className={styles.cardFloating} />;
    case "schedule":
      return <ScheduleVisual />;
    default:
      return null;
  }
}

export type WhatsNewShowcaseProps = {
  /** Called once the story ends (after the fade) or the visitor skips it. */
  onClose: () => void;
};

export function WhatsNewShowcase({ onClose }: WhatsNewShowcaseProps) {
  const [scene, setScene] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [revealScene, setRevealScene] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const skipRef = useRef<HTMLButtonElement>(null);
  const closedRef = useRef(false);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  // Auto-advance; after the finale has held, fade the overlay out.
  useEffect(() => {
    const isLast = scene >= SCENES.length - 1;
    const timer = window.setTimeout(() => {
      if (isLast) {
        setFading(true);
      } else {
        setLeaving(scene);
        setScene(scene + 1);
      }
    }, SCENES[scene].dur);
    return () => window.clearTimeout(timer);
  }, [scene]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (SCENES[scene].kind !== "card") return;
    const timer = window.setTimeout(() => setRevealScene(scene), REVEAL_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [scene]);

  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(close, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [fading, close]);

  // Page scroll lock, Esc to close, focus on Skip (and back where it was on close).
  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [close]);

  const current = SCENES[scene];
  const stageScenes = [leaving, scene].filter(
    (index): index is number => index !== null && SCENES[index].kind !== "welcome",
  );

  let text: ReactNode = null;
  if (current.kind !== "welcome") {
    text = (
      // The blocks scene's headline lands as the pyramid snaps into place (CSS delay).
      <div key={scene} className={cn(styles.textInner, current.kind === "blocks" && styles.textOnSnap)}>
        <h2 className={styles.headline}>{current.headline}</h2>
        <p className={styles.subline}>{current.sub}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(styles.overlay, fading && styles.fading)}
      role="dialog"
      aria-modal="true"
      aria-label="What's new in PantherWatch"
      onClick={close}
    >
      {current.kind === "welcome" ? (
        <WhatsNewFinale />
      ) : null}

      <div className={cn(styles.story, current.kind === "welcome" && styles.storyGone)} aria-hidden={current.kind === "welcome" || undefined}>
        <div className={styles.text} aria-live="polite">
          {text}
        </div>

        <div className={styles.perspective} onClick={(event) => event.stopPropagation()}>
          <div className={styles.rotor} style={{ animationDuration: `${STORY_MS}ms` }}>
            {stageScenes.map((index) => (
              <div
                key={index}
                className={cn(styles.stageItem, index === leaving ? styles.exit : styles.enter)}
                data-scene={SCENES[index].kind}
              >
                <Visual kind={SCENES[index].kind} reveal={revealScene === index} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {!fading ? (
        <button
          ref={skipRef}
          type="button"
          className={styles.skip}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}

export default WhatsNewShowcase;
