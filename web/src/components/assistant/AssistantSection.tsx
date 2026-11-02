import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { ButtonAnchor } from "@/components/ui/Button";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { assistantEnabled } from "@/lib/assistant/config";
import { getCurrentUser } from "@/lib/auth/session";
import { AssistantChat } from "./AssistantChat";
import { ChatShell } from "./ChatShell";
import { ClearChatStorage } from "./ClearChatStorage";
import { UNAVAILABLE_TEXT } from "./copy";
import styles from "./AssistantChat.module.css";

/** Origins whose links in replies open in-app: this deployment's APP_URL and the production hosts. */
function appOrigins(): string[] {
  const origins = new Set(["https://www.pantherwatch.app", "https://pantherwatch.app"]);
  try {
    if (process.env.APP_URL) origins.add(new URL(process.env.APP_URL).origin);
  } catch {
    /* malformed APP_URL: the production hosts still match */
  }
  return [...origins];
}

/**
 * The chat at the top of /assistant. Members get the live chat; guests a short sign-in prompt in
 * its place; when the feature is off (no API key), a quiet "not available" card. User-dependent,
 * so it streams in behind its own Suspense boundary while the rest of the page prerenders.
 */
export function AssistantSection() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat />
    </Suspense>
  );
}

async function Chat() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("assistant chat: could not load the current user", error instanceof Error ? error.name : typeof error);
    user = null;
  }
  if (!user) {
    return (
      <ChatShell>
        <ClearChatStorage />
        <div className={styles.gate}>
          <p className={styles.intro}>
            Sign in to chat with the PantherWatch Assistant. It can check open seats, track sections and add classes to
            your schedule for you.
          </p>
          <ButtonAnchor href={SIGN_IN_HREF} size="sm">
            Sign in with Google
          </ButtonAnchor>
        </div>
      </ChatShell>
    );
  }
  if (!assistantEnabled()) {
    return (
      <ChatShell>
        <p className={styles.intro}>{UNAVAILABLE_TEXT}</p>
      </ChatShell>
    );
  }
  return <AssistantChat userId={user.id} appOrigins={appOrigins()} />;
}

function ChatSkeleton() {
  return (
    <ChatShell>
      <SkeletonGroup label="Loading the assistant" className={styles.skeleton}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={14} />
        <Skeleton height={44} radius="sm" style={{ marginTop: "var(--space-6)" }} />
      </SkeletonGroup>
    </ChatShell>
  );
}
