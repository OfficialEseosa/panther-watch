"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BookmarkIcon, ChartIcon, DashboardIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import { SampleCourseCard } from "./SampleCourseCard";
import card from "./SampleCourseCard.module.css";
import styles from "./WhatsNewFinale.module.css";

/** Finale timeline (ms from mount). The showcase holds the finale for FINALE_MS, then fades. */
const MORPH_DELAY = 650;
const MORPH_MS = 750;
const SECTION_MS = 1600;
const CYCLE_START = MORPH_DELAY + MORPH_MS - 100;
const HEADLINE_FADE_AT = CYCLE_START + SECTION_MS * 4;
const HEADLINE_FADE_MS = 600;
export const FINALE_MS = HEADLINE_FADE_AT + HEADLINE_FADE_MS;

const SECTIONS: { id: string; label: string; short: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", short: "Overview", icon: <DashboardIcon size={16} /> },
  { id: "grades", label: "Grade history", short: "Grades", icon: <ChartIcon size={16} /> },
  { id: "ratings", label: "Professor ratings", short: "Ratings", icon: <UsersIcon size={16} /> },
  { id: "syllabus", label: "Syllabus", short: "Syllabus", icon: <BookmarkIcon size={16} /> },
];

const GRADES: [key: "a" | "b" | "c" | "d" | "f", label: string, pct: number][] = [
  ["a", "A", 29],
  ["b", "B", 38],
  ["c", "C", 20],
  ["d", "D", 8],
  ["f", "F", 5],
];

const DIST: [label: string, score: number, count: number][] = [
  ["Awesome", 5, 9],
  ["Great", 4, 6],
  ["Good", 3, 3],
  ["OK", 2, 1],
  ["Awful", 1, 1],
];

function Overview() {
  return (
    <>
      <div className={cn(card.enrollment, styles.enrollment)}>
        <div className={card.enrollmentItem}>
          <span className={cn(card.enrollmentNumber, card.available)}>12</span>
          <span className={card.enrollmentLabel}>Available</span>
        </div>
        <div className={card.enrollmentItem}>
          <span className={card.enrollmentNumber}>28</span>
          <span className={card.enrollmentLabel}>Enrolled</span>
        </div>
        <div className={card.enrollmentItem}>
          <span className={card.enrollmentNumber}>40</span>
          <span className={card.enrollmentLabel}>Capacity</span>
        </div>
      </div>
      <div className={card.faculty}>
        <div className={card.facultyTitle}>Instructor</div>
        <div className={card.facultyName}>
          <span className={card.facultyNameText}>Alina Nemira</span>
        </div>
      </div>
      <div className={card.meeting}>
        <div className={card.timeRow}>
          <span className={card.timeRange}>10:00 AM - 10:50 AM</span>
          <span className={card.days}>
            {["M", "T", "W", "T", "F"].map((day, index) => (
              <span key={index} className={cn(card.day, index % 2 === 0 && card.dayOn)}>
                {day}
              </span>
            ))}
          </span>
        </div>
        <div className={card.location}>
          <span className={card.building}>Classroom South</span> - Room 404
        </div>
      </div>
    </>
  );
}

function Grades() {
  return (
    <div className={styles.block}>
      <p className={styles.blockTitle}>How Alina Nemira grades</p>
      <p className={styles.blockSpan}>3 semesters · Fall 2023–Fall 2025</p>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={cn(styles.metricValue, styles.good)}>3.12</span>
          <span className={styles.metricLabel}>Avg GPA</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>14%</span>
          <span className={styles.metricLabel}>DWF rate</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>86</span>
          <span className={styles.metricLabel}>Students</span>
        </div>
      </div>
      <span className={cn(card.gradeBar, styles.gradeBar)}>
        {GRADES.map(([key, , pct]) => (
          <span key={key} className={cn(card.gradeSeg, card[key])} style={{ width: `${pct}%` }} />
        ))}
      </span>
      <p className={styles.legend}>
        {GRADES.map(([key, label, pct]) => (
          <span key={key} className={styles.legendItem}>
            <span className={cn(styles.dot, card[key])} />
            {label} {pct}%
          </span>
        ))}
      </p>
    </div>
  );
}

function Ratings() {
  return (
    <div className={styles.rmp}>
      <div className={styles.rmpHead}>
        <div className={styles.rmpScore}>
          <span className={styles.rmpNum}>
            4.1<span className={styles.rmpMax}>/5</span>
          </span>
          <span className={styles.rmpMeta}>
            <span className={styles.rmpLabel}>Overall quality</span>
            <span className={styles.rmpSub}>Based on 20 ratings</span>
          </span>
        </div>
        <div className={styles.rmpStats}>
          <span>
            <strong>78%</strong> would take again
          </span>
          <span>
            <strong>3.2</strong> difficulty
          </span>
        </div>
      </div>
      <div className={styles.dist}>
        {DIST.map(([label, score, count]) => (
          <div key={label} className={styles.distRow}>
            <span className={styles.distLabel}>
              {label} <strong>{score}</strong>
            </span>
            <span className={styles.distTrack}>
              <span className={styles.distFill} style={{ width: `${(count / 9) * 100}%` }} />
            </span>
            <span className={styles.distCount}>{count}</span>
          </div>
        ))}
      </div>
      <span className={styles.rmpBrand}>
        <Image src="/brand/rmp.svg" alt="" width={38} height={22} unoptimized />
      </span>
    </div>
  );
}

function Syllabus() {
  return (
    <div className={styles.syllabus}>
      <div className={styles.page}>
        <span className={cn(styles.line, styles.lineTitle)} />
        <span className={cn(styles.line, styles.lineShort)} />
        <span className={styles.line} />
        <span className={styles.line} />
        <span className={cn(styles.line, styles.lineMid)} />
        <span className={styles.gap} />
        <span className={cn(styles.line, styles.lineShort)} />
        <span className={styles.line} />
        <span className={cn(styles.line, styles.lineMid)} />
      </div>
      <p className={styles.syllabusCaption}>CSC 4520 syllabus · Fall 2026 (PDF)</p>
    </div>
  );
}

const PANES = [Overview, Grades, Ratings, Syllabus];

/** A static, scaled-down replica of the expanded course card (the real SectionDialog look). */
function ExpandedReplica({ section }: { section: number }) {
  return (
    <div className={styles.expanded}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.title}>Computer Science (CSC 4520)</p>
          <p className={styles.subtitle}>Algorithms</p>
          <div className={styles.tags}>
            <span className={cn(styles.tag, styles.tagCrn)}>CRN 12345</span>
            <span className={styles.tag}>Section 001</span>
            <span className={styles.tag}>4 credits</span>
          </div>
        </div>
        <span className={styles.close}>
          <XIcon size={16} />
        </span>
      </div>
      <div className={styles.main}>
        <div className={styles.sidebar} style={{ "--i": section } as CSSProperties}>
          <span className={styles.indicator} />
          {SECTIONS.map((item, index) => (
            <span key={item.id} className={cn(styles.navItem, index === section && styles.navItemOn)}>
              {item.icon}
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.navShort}>{item.short}</span>
            </span>
          ))}
        </div>
        <div className={styles.pane}>
          {PANES.map((Pane, index) => (
            <div key={index} className={cn(styles.paneLayer, index === section && styles.paneOn)}>
              <Pane />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const ramp = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));

/**
 * The What's new finale: "Welcome to PantherWatch" over the sample course card morphing into
 * the expanded course card (FLIP: the shell scales from the card's box to its own, both layers
 * counter-scaled so nothing distorts and the card stays visible), then one cycle through
 * Overview / Grade history / Professor ratings / Syllabus, then the headline fades out.
 * Reduced motion: the expanded card on Overview, no morph or cycle.
 */
export function WhatsNewFinale() {
  const shellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState(0);
  const [headlineOut, setHeadlineOut] = useState(false);

  // FLIP morph, measured after layout (transform/opacity only, via the Web Animations API).
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const cardLayer = cardRef.current;
    const expanded = expandedRef.current;
    if (!shell || !cardLayer || !expanded) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cardLayer.style.opacity = "0";
      return;
    }
    const end = shell.getBoundingClientRect();
    const start = cardLayer.getBoundingClientRect();
    const sx0 = start.width / end.width;
    const sy0 = start.height / end.height;
    const N = 16;
    const shellFrames: Keyframe[] = [];
    const cardFrames: Keyframe[] = [];
    const expandedFrames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = easeOut(t);
      const sx = sx0 + (1 - sx0) * p;
      const sy = sy0 + (1 - sy0) * p;
      shellFrames.push({ offset: t, transform: `scale(${sx}, ${sy})` });
      cardFrames.push({ offset: t, transform: `scale(${1 / sx}, ${1 / sy})`, opacity: 1 - ramp(t, 0.3, 0.7) });
      expandedFrames.push({ offset: t, transform: `scale(${1 / sx}, ${1 / sy})`, opacity: ramp(t, 0.2, 0.6) });
    }
    const timing: KeyframeAnimationOptions = { duration: MORPH_MS, delay: MORPH_DELAY, fill: "both", easing: "linear" };
    const animations = [
      shell.animate(shellFrames, timing),
      cardLayer.animate(cardFrames, timing),
      expanded.animate(expandedFrames, timing),
    ];
    return () => animations.forEach((animation) => animation.cancel());
  }, []);

  // Section cycle and the headline fade.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = [1, 2, 3].map((index) => window.setTimeout(() => setSection(index), CYCLE_START + SECTION_MS * index));
    timers.push(window.setTimeout(() => setHeadlineOut(true), HEADLINE_FADE_AT));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div className={styles.finale}>
      <p className={cn(styles.headline, headlineOut && styles.headlineOut)}>Welcome to PantherWatch</p>
      <div className={styles.stage}>
        <div ref={shellRef} className={styles.shell}>
          <div ref={expandedRef} className={styles.expandedLayer}>
            <ExpandedReplica section={section} />
          </div>
          <div ref={cardRef} className={styles.cardLayer}>
            <SampleCourseCard className={styles.card} />
          </div>
        </div>
      </div>
    </div>
  );
}
