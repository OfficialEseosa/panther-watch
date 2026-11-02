import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { AssistantSection } from "@/components/assistant/AssistantSection";
import { ClaudeCodeCommand, ConnectButtons, SettingsLink } from "@/components/assistant/ConnectButtons";
import { ConnectedAppsList, ConnectorUrl } from "@/components/settings/ConnectedApps";
import { PageHeader } from "@/components/shell/PageHeader";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor } from "@/components/ui/Button";
import { ChatIcon, CheckCircleIcon, LinkIcon, LockIcon, PlugIcon, SparkleIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { getCurrentUser } from "@/lib/auth/session";
import { listConnectedApps, MCP_PATH, SCOPE_INFO } from "@/lib/oauth";
import ui from "@/components/settings/Settings.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "AI Assistant",
  description:
    "Connect PantherWatch to Claude, ChatGPT, Cursor or another AI assistant: ask whether a class is open, track sections and edit your schedule from a chat.",
  alternates: { canonical: "/assistant" },
};

/**
 * /assistant: the AI integration for students (non-technical): what it does, the MCP connector
 * URL with Copy, step-by-step setup per assistant (tabs), example prompts, what each permission
 * lets it see, and the connected apps with Disconnect. Guests get the same page plus a sign-in
 * note (connecting needs an account). Everything but the guest note and the app list is static.
 *
 * The per-assistant steps were checked against each vendor's docs on 2026-11-01 (Claude:
 * support.claude.com "custom connectors using remote MCP"; ChatGPT: developers.openai.com
 * apps-sdk "connect ChatGPT"; Cursor: cursor.com/docs/context/mcp). Menus move between versions;
 * keep them short. Cursor and VS Code have install links (ConnectButtons); Claude and ChatGPT
 * have no link that pre-fills a connector, so their first step links to the right screen.
 */
/**
 * The connector URL: mcpResourceUrl()'s value, but from APP_URL read raw (like sitemap.ts), since
 * this part is prerendered and the full env validation would demand every runtime secret at build
 * time. Vercel builds with the deployment's APP_URL, so it matches the OAuth resource exactly.
 */
function connectorUrl(): string {
  return `${new URL(process.env.APP_URL || "https://www.pantherwatch.app").origin}${MCP_PATH}`;
}

export default function AssistantPage() {
  const mcpUrl = connectorUrl();
  return (
    <div className={styles.page}>
      <PageHeader
        title="AI Assistant"
        description="Chat with PantherWatch here, or use it from Claude, ChatGPT or another AI assistant."
      >
        <Suspense fallback={null}>
          <GuestNote />
        </Suspense>
      </PageHeader>

      <div className={ui.content}>
        <AssistantSection />

        <Section icon={<SparkleIcon />} title="What this does">
          <p className={styles.lead}>
            Connect PantherWatch to your AI assistant so you can ask it things like &ldquo;Is CSC 1301 open?&rdquo; or
            &ldquo;Track section 002 and add it to my schedule.&rdquo; It only does what you allow, and you can
            disconnect anytime.
          </p>
        </Section>

        <Section icon={<LinkIcon />} title="Your connector URL">
          <p className={ui.description}>You&rsquo;ll paste this into your assistant. It&rsquo;s the same for everyone.</p>
          <ConnectorUrl mcpUrl={mcpUrl} large />
        </Section>

        <Section icon={<CheckCircleIcon />} title="How to connect">
          <Tabs
            label="Assistant"
            panelClassName={styles.panel}
            tabs={[
              { id: "claude", label: "Claude", panel: <ClaudeSteps /> },
              { id: "chatgpt", label: "ChatGPT", panel: <ChatGptSteps /> },
              { id: "cursor", label: "Cursor", panel: <CursorSteps mcpUrl={mcpUrl} /> },
              { id: "vscode", label: "VS Code", panel: <VsCodeSteps mcpUrl={mcpUrl} /> },
              { id: "claude-code", label: "Claude Code", panel: <ClaudeCodeSteps mcpUrl={mcpUrl} /> },
              { id: "other", label: "Other", panel: <OtherSteps /> },
            ]}
          />
        </Section>

        <Section icon={<ChatIcon />} title="Things you can say">
          <ul className={styles.prompts}>
            {PROMPTS.map((prompt) => (
              <li key={prompt} className={styles.prompt}>
                &ldquo;{prompt}&rdquo;
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<LockIcon />} title="What it can see">
          <ul className={styles.scopes}>
            <li>
              <span className={styles.scopeLabel}>{SCOPE_INFO.read.label}</span>{" "}
              <span className={styles.scopeWhen}>(always)</span>
              <span className={styles.scopeDescription}>{SCOPE_INFO.read.description}</span>
            </li>
            <li>
              <span className={styles.scopeLabel}>{SCOPE_INFO["watches:write"].label}</span>{" "}
              <span className={styles.scopeWhen}>(if you allow it)</span>
              <span className={styles.scopeDescription}>{SCOPE_INFO["watches:write"].description}</span>
            </li>
            <li>
              <span className={styles.scopeLabel}>{SCOPE_INFO["schedule:write"].label}</span>{" "}
              <span className={styles.scopeWhen}>(if you allow it)</span>
              <span className={styles.scopeDescription}>{SCOPE_INFO["schedule:write"].description}</span>
            </li>
          </ul>
          <p className={ui.description}>
            You choose these when you click Allow. It never sees your Google password. See the{" "}
            <Link href="/privacy">Privacy Policy</Link> for details.
          </p>
        </Section>

        <Section icon={<PlugIcon />} title="Connected apps">
          <Suspense fallback={<AppsSkeleton />}>
            <Apps />
          </Suspense>
        </Section>

        <p className={ui.legal}>
          Building something? The <Link href="/developers">developer docs</Link> cover the MCP tools and the public API.
        </p>
      </div>
    </div>
  );
}

const PROMPTS = [
  "Is CSC 1301 open next semester?",
  "Find an online PSYC 1101 section that still has seats.",
  "Track section 002 of CSC 1301 and tell me when a seat opens.",
  "Add MATH 2211 section 004 to my schedule.",
  "Do any of the classes on my schedule overlap?",
  "Compare the ENGL 1101 professors by grades and ratings.",
];

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = `assistant-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className={ui.section} aria-labelledby={id}>
      <div className={ui.sectionHeader}>
        <span className={ui.sectionIcon} aria-hidden="true">
          {icon}
        </span>
        <h2 id={id} className={ui.sectionTitle}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Steps({ children, note, byHand }: { children: ReactNode; note?: ReactNode; byHand?: ReactNode }) {
  return (
    <>
      <ol className={styles.steps}>{children}</ol>
      {byHand ? (
        <>
          <p className={styles.byHandLabel}>Or do it by hand:</p>
          <ol className={styles.steps}>{byHand}</ol>
        </>
      ) : null}
      <p className={styles.note}>
        {note ? <>{note} </> : null}Steps may differ slightly by version.
      </p>
    </>
  );
}

const SIGN_IN_STEP = (
  <li>
    Sign in to PantherWatch when asked, then click <strong>Allow</strong>.
  </li>
);

function ClaudeSteps() {
  return (
    <Steps note="Works on claude.ai and the desktop app (Customize, then Connectors). Free plans can add one custom connector.">
      <li>
        Open Claude&rsquo;s connector settings.
        <SettingsLink href="https://claude.ai/customize/connectors">Open Claude connectors</SettingsLink>
      </li>
      <li>
        Click <strong>+ Add</strong>, then <strong>Add custom connector</strong>. Name it <strong>PantherWatch</strong>,
        paste the URL, and click <strong>Continue</strong>, then <strong>Add</strong>.
      </li>
      {SIGN_IN_STEP}
      <li>
        In a chat, turn PantherWatch on from the <strong>+</strong> menu under <strong>Connectors</strong>.
      </li>
    </Steps>
  );
}

function ChatGptSteps() {
  return (
    <Steps note="Custom MCP servers depend on your ChatGPT plan and workspace. If you don't see the option, turn on Developer mode in Settings first.">
      <li>
        Open ChatGPT&rsquo;s plugins page.
        <SettingsLink href="https://chatgpt.com/plugins">Open ChatGPT plugins</SettingsLink>
      </li>
      <li>
        Click <strong>+</strong>, then <strong>Add custom MCP server</strong>. Name it <strong>PantherWatch</strong>,
        paste the URL, and choose <strong>OAuth</strong>.
      </li>
      <li>
        Confirm the warning and click <strong>Create</strong>.
      </li>
      {SIGN_IN_STEP}
    </Steps>
  );
}

function CursorSteps({ mcpUrl }: { mcpUrl: string }) {
  const config = `{
  "mcpServers": {
    "pantherwatch": { "url": "${mcpUrl}" }
  }
}`;
  return (
    <Steps
      byHand={
        <>
          <li>
            In Cursor, open <strong>Settings</strong>, then <strong>MCP</strong> (or <strong>Tools &amp; MCP</strong>),
            and click <strong>Add a custom MCP server</strong>.
          </li>
          <li>
            Add PantherWatch to mcp.json like this, save it, and click <strong>Connect</strong>:
            <pre className={styles.code}>
              <code>{config}</code>
            </pre>
          </li>
        </>
      }
    >
      <li>
        On the computer with Cursor, click the button, then <strong>Install</strong> in Cursor.
        <ConnectButtons app="cursor" mcpUrl={mcpUrl} />
      </li>
      <li>
        Next to PantherWatch, click <strong>Connect</strong>.
      </li>
      {SIGN_IN_STEP}
    </Steps>
  );
}

function VsCodeSteps({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Steps
      note="PantherWatch works in Copilot Chat's agent mode."
      byHand={
        <>
          <li>
            In VS Code, run <strong>MCP: Add Server</strong> from the Command Palette and choose <strong>HTTP</strong>.
          </li>
          <li>
            Paste the URL and name it <strong>pantherwatch</strong>.
          </li>
        </>
      }
    >
      <li>
        On the computer with VS Code, click the button, then <strong>Install</strong> in VS Code.
        <ConnectButtons app="vscode" mcpUrl={mcpUrl} />
      </li>
      {SIGN_IN_STEP}
    </Steps>
  );
}

function ClaudeCodeSteps({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Steps note="Already added PantherWatch on claude.ai? Claude Code picks it up when you're signed in with the same account.">
      <li>
        In a terminal, run:
        <ClaudeCodeCommand mcpUrl={mcpUrl} />
      </li>
      <li>
        In Claude Code, type <strong>/mcp</strong>, pick <strong>pantherwatch</strong>, and sign in to PantherWatch,
        then click <strong>Allow</strong>.
      </li>
    </Steps>
  );
}

function OtherSteps() {
  return (
    <Steps note="Your assistant needs to support remote MCP servers (also called custom connectors).">
      <li>
        In your assistant&rsquo;s settings, look for <strong>MCP</strong>, <strong>custom connectors</strong> or{" "}
        <strong>integrations</strong>.
      </li>
      <li>Add a new connector or server and paste the URL.</li>
      <li>
        If it asks how to sign in, choose <strong>OAuth</strong>.
      </li>
      <li>
        Approve PantherWatch: sign in when asked, then click <strong>Allow</strong>.
      </li>
    </Steps>
  );
}

async function GuestNote() {
  const user = await safeUser();
  if (user) return null;
  return (
    <Banner
      tone="info"
      title="Sign in to connect"
      action={
        <ButtonAnchor href={SIGN_IN_HREF} size="sm">
          Sign in with Google
        </ButtonAnchor>
      }
    >
      You can read the steps now. Connecting needs a PantherWatch account, and your assistant will ask you to sign in.
    </Banner>
  );
}

async function safeUser() {
  try {
    return await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("assistant: could not load the current user", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

async function Apps() {
  const user = await safeUser();
  if (!user) {
    return <p className={ui.description}>Sign in to see the apps you&rsquo;ve connected and disconnect them.</p>;
  }
  let apps;
  try {
    apps = await listConnectedApps(user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("assistant: could not load connected apps", error instanceof Error ? error.name : typeof error);
    return <p className={ui.description}>We couldn&rsquo;t load your connected apps. Try again in a moment.</p>;
  }
  return <ConnectedAppsList apps={apps} />;
}

function AppsSkeleton() {
  return (
    <SkeletonGroup label="Loading your connected apps">
      <Skeleton width="40%" height={14} />
      <Skeleton width="60%" height={12} style={{ marginTop: "var(--space-2)" }} />
    </SkeletonGroup>
  );
}
