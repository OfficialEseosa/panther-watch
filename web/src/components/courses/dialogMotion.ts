/**
 * Card <-> detail dialog motion: a FLIP morph on the compositor.
 *
 * Only `transform` and `opacity` animate (Web Animations API, precomputed keyframes, linear
 * timing over eased samples), so the browser never lays out or repaints per frame:
 * - the panel (the <dialog>) is shown at its final rect at once, then animated from the card's
 *   rect: translate + non-uniform scale -> none, fading in over the first half;
 * - its content wrapper gets the inverse scale every sample ("layout projection"), so text and
 *   numbers are never stretched while the box morphs;
 * - the card itself stays visible underneath (its hover lift reset), so its content never
 *   disappears: the panel grows out of it and, on close, shrinks back onto it and fades.
 * Without a card (deep link, Back/Forward) the panel fades + scales; reduced motion fades only.
 * Nothing here touches React state; callers act on `finished`.
 */

export const MORPH_MS = 280;
const FADE_MS = 150;
const REDUCED_MS = 120;
/** Samples per morph (the panel and its content share them, so they never drift apart). */
const STEPS = 20;

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of time (0..1). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t) => {
    if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let i = 0; i < 24; i++) {
      s = (lo + hi) / 2;
      if (at(x1, x2, s) < t) lo = s;
      else hi = s;
    }
    return at(y1, y2, s);
  };
}

const ease = cubicBezier(0.2, 0.8, 0.2, 1);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function inViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && rect.width > 0;
}

/**
 * The card for `key` when it's on screen, with its hover lift and transitions switched off
 * (data-morphing) so it measures, and stays, exactly where it rests.
 */
export function morphTarget(key: string | null): HTMLElement | null {
  if (!key) return null;
  const card = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`);
  if (!card) return null;
  card.dataset.morphing = "";
  if (inViewport(card.getBoundingClientRect())) return card;
  delete card.dataset.morphing;
  return null;
}

/** Gives every card back its hover behavior. */
export function releaseCards(): void {
  for (const card of document.querySelectorAll<HTMLElement>("[data-morphing]")) delete card.dataset.morphing;
}

function backdrop(el: HTMLElement, from: number, to: number, duration: number): Animation | null {
  try {
    return el.animate({ opacity: [from, to] }, { duration, easing: "linear", fill: "both", pseudoElement: "::backdrop" });
  } catch {
    return null;
  }
}

export type MotionRun = { finished: Promise<void>; cancel: () => void };

function run(animations: Array<Animation | null>, cleanup: () => void): MotionRun {
  const list = animations.filter((x): x is Animation => x !== null);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
  };
  const finished = Promise.all(list.map((x) => x.finished.catch(() => undefined))).then(finish);
  return {
    finished,
    cancel: () => {
      for (const x of list) x.cancel();
      finish();
    },
  };
}

/** Panel / content / backdrop keyframes between the card rect (p = 0) and the panel's (p = 1). */
function frames(from: DOMRect, to: DOMRect, opening: boolean) {
  const a = from.width / to.width;
  const b = from.height / to.height;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const panel: Keyframe[] = [];
  const content: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const offset = i / STEPS;
    const e = ease(offset);
    const p = opening ? e : 1 - e;
    const sx = a + (1 - a) * p;
    const sy = b + (1 - b) * p;
    panel.push({
      offset,
      transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p)}px) scale(${sx}, ${sy})`,
      // In over the first half of the move; out over the last half (the card shows through).
      opacity: Math.min(1, p * 2),
    });
    content.push({ offset, transform: `scale(${1 / sx}, ${1 / sy})` });
  }
  return { panel, content };
}

function morph(el: HTMLDialogElement, content: HTMLElement | null, card: HTMLElement, opening: boolean): MotionRun {
  const to = el.getBoundingClientRect();
  const from = card.getBoundingClientRect();
  const { panel, content: inner } = frames(from, to, opening);
  // Set once, never per frame. The height is held so late meta can't resize the panel mid-move.
  el.style.height = `${to.height}px`;
  el.style.transformOrigin = "0 0";
  el.style.willChange = "transform, opacity";
  if (content) {
    content.style.transformOrigin = "0 0";
    content.style.willChange = "transform";
  }
  const timing: KeyframeAnimationOptions = { duration: MORPH_MS, easing: "linear", fill: "both" };
  return run(
    [el.animate(panel, timing), content?.animate(inner, timing) ?? null, backdrop(el, opening ? 0 : 1, opening ? 1 : 0, MORPH_MS)],
    () => {
      for (const prop of ["height", "transform-origin", "will-change"]) el.style.removeProperty(prop);
      content?.style.removeProperty("transform-origin");
      content?.style.removeProperty("will-change");
    },
  );
}

/** Ends a run by dropping every held animation frame on the dialog (same frame, no flash). */
function settle(el: HTMLDialogElement, motion: MotionRun): MotionRun {
  return {
    cancel: motion.cancel,
    finished: motion.finished.then(() => {
      for (const animation of el.getAnimations({ subtree: true })) animation.cancel();
    }),
  };
}

/** Entrance. `card` (from morphTarget) morphs into the panel; null fades in. Call right after showModal(). */
export function animateOpen(el: HTMLDialogElement, content: HTMLElement | null, card: HTMLElement | null): MotionRun {
  if (reducedMotion()) {
    releaseCards();
    return settle(el, run([el.animate({ opacity: [0, 1] }, { duration: REDUCED_MS, fill: "both" }), backdrop(el, 0, 1, REDUCED_MS)], () => {}));
  }
  if (!card) {
    return settle(
      el,
      run(
        [
          el.animate([{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "none" }], {
            duration: FADE_MS,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            fill: "both",
          }),
          backdrop(el, 0, 1, FADE_MS),
        ],
        () => {},
      ),
    );
  }
  return settle(el, morph(el, content, card, true));
}

/**
 * Exit. Shrinks back onto the card for `key` when it's on screen (re-measured now), else fades.
 * The held end state is left in place: the caller closes the dialog, then cancels them.
 */
export function animateClose(el: HTMLDialogElement, content: HTMLElement | null, key: string | null): MotionRun {
  if (reducedMotion()) {
    return run([el.animate({ opacity: [1, 0] }, { duration: REDUCED_MS, fill: "forwards" }), backdrop(el, 1, 0, REDUCED_MS)], () => {});
  }
  const card = morphTarget(key);
  if (!card) {
    return run(
      [
        el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.98)" }], {
          duration: FADE_MS,
          easing: "ease-in",
          fill: "forwards",
        }),
        backdrop(el, 1, 0, FADE_MS),
      ],
      () => {},
    );
  }
  return morph(el, content, card, false);
}
