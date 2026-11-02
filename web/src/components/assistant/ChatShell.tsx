import type { ReactNode } from "react";
import { ChatIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import ui from "@/components/settings/Settings.module.css";
import styles from "./AssistantChat.module.css";

export const CHAT_TITLE_ID = "assistant-chat-title";

/** The chat's card: the page's section card (icon + title over a rule), with room for New chat. */
export function ChatShell({ actions, children, className }: { actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(ui.section, styles.card, className)} aria-labelledby={CHAT_TITLE_ID}>
      <div className={cn(ui.sectionHeader, styles.header)}>
        <span className={ui.sectionIcon} aria-hidden="true">
          <ChatIcon />
        </span>
        <h2 id={CHAT_TITLE_ID} className={ui.sectionTitle}>
          PantherWatch Assistant
        </h2>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
