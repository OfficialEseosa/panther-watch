import styles from "./LoadingBar.module.css";

/** The original app's loading bar: a message over an animated track (old components/LoadingBar). */
export function LoadingBar({ message = "Loading..." }: { message?: string }) {
  return (
    <div className={styles.container} role="status">
      <div className={styles.text}>{message}</div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} />
      </div>
    </div>
  );
}
