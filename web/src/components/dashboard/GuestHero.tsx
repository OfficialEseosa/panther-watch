import { SIGN_IN_HREF } from "@/components/shell/nav";
import { ButtonAnchor } from "@/components/ui/Button";
import styles from "./GuestHero.module.css";

const STEPS = [
  { title: "Search a course", body: "Pick a term and subject to see live seats, grade history and ratings for every section." },
  { title: "Watch a full section", body: "One click adds it to your tracked classes. No more refreshing GoSolar." },
  { title: "Get an email when a seat opens", body: "We keep checking and email you the moment a seat or waitlist spot frees up." },
];

/** The guest explainer (pages.md §2 guest variant): how it works, plus the sign-in CTA. */
export function GuestHero() {
  return (
    <section className={styles.hero} aria-labelledby="guest-hero-title">
      <div className={styles.copy}>
        <h2 id="guest-hero-title" className={styles.title}>
          Sign in to watch classes and plan your week
        </h2>
        <p className={styles.lead}>
          Search, grades and ratings are open to everyone. With a free account, PantherWatch also watches full
          sections for you and keeps your schedule in sync across devices.
        </p>
        <div className={styles.actions}>
          <ButtonAnchor href={SIGN_IN_HREF} size="lg" className={styles.cta}>
            Sign in with Google
          </ButtonAnchor>
        </div>
        <p className={styles.note}>We only use your name, email and profile photo.</p>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
