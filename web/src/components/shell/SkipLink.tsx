import styles from "./SkipLink.module.css";

/** "Skip to content" (spec.md §2.15): first focusable element; targets <main id="main" tabIndex={-1}>. */
export function SkipLink({ target = "main" }: { target?: string }) {
  return (
    <a href={`#${target}`} className={styles.skip}>
      Skip to content
    </a>
  );
}
