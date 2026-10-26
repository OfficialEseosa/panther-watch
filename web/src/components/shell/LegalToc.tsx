"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./LegalLayout.module.css";

/** Sticky table of contents; the section in view is bolded (IntersectionObserver). */
export function LegalToc({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        const first = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="On this page" className={styles.toc}>
      <p className={styles.tocLabel}>On this page</p>
      <ul className={styles.tocList}>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(styles.tocLink, active === section.id && styles.tocActive)}
              aria-current={active === section.id ? "location" : undefined}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
