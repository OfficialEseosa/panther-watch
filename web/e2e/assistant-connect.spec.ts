import type { Page } from "@playwright/test";
import { APP_URL } from "./env";
import { expect, freshUser, hydrated, login, resetAll, test } from "./support";

/**
 * /assistant's Chat / Connect tabs (components/assistant/AssistantTabs.tsx): which one opens
 * (?tab=, else Chat for members and Connect for guests), arrow keys, the URL following the tab,
 * and both panels in the server HTML. Then the one-click setup in Connect
 * (components/assistant/ConnectButtons.tsx): the Cursor and VS Code install links carry this
 * deployment's connector URL (APP_URL, not production) with the HTTP transport, Claude Code gets
 * the `claude mcp add` command with Copy, and Claude / ChatGPT (no install link exists) link to
 * their settings screens. Guests see the same steps.
 */

const MCP_URL = `${new URL(APP_URL).origin}/api/mcp`;

async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await (await hydrated(tab)).click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return page.getByRole("tabpanel", { name, exact: true });
}

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("guests land on Connect; arrow keys switch tabs and the URL follows", async ({ page }) => {
  await page.goto("/assistant");
  const chatTab = page.getByRole("tab", { name: "Chat", exact: true });
  const connectTab = page.getByRole("tab", { name: "Connect", exact: true });
  await expect(connectTab).toHaveAttribute("aria-selected", "true");
  await expect(chatTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel", { name: "Connect" })).toBeVisible();
  await expect(page.getByLabel("Connector URL", { exact: true })).toHaveText(MCP_URL);
  await expect(page.getByText("Sign in to connect")).toBeVisible();
  // The chat's sign-in prompt is in the page, but hidden behind the Chat tab.
  await expect(page.getByText(/Sign in to chat with the PantherWatch Assistant/)).toBeHidden();

  await (await hydrated(connectTab)).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(chatTab).toHaveAttribute("aria-selected", "true");
  await expect(chatTab).toBeFocused();
  await expect(page).toHaveURL(`${APP_URL}/assistant?tab=chat`);
  await expect(page.getByText(/Sign in to chat with the PantherWatch Assistant/)).toBeVisible();
  await expect(page.getByLabel("Connector URL", { exact: true })).toBeHidden();
  // ArrowRight wraps back; Connect is the guest default, so the URL drops ?tab.
  await page.keyboard.press("ArrowRight");
  await expect(connectTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${APP_URL}/assistant`);
});

test("?tab=connect opens Connect for a member, and Settings links there", async ({ page }) => {
  await login(page.request, freshUser("tabs"));
  await page.goto("/settings");
  const setUp = page.getByRole("link", { name: "Set it up" });
  await expect(setUp).toHaveAttribute("href", "/assistant?tab=connect");
  await (await hydrated(setUp)).click();
  await expect(page).toHaveURL(`${APP_URL}/assistant?tab=connect`);
  const connectTab = page.getByRole("tab", { name: "Connect", exact: true });
  await expect(connectTab).toHaveAttribute("aria-selected", "true");
  // Scoped: Next keeps the Settings page (same copy) mounted but hidden after the navigation.
  const connectPanel = page.getByRole("tabpanel", { name: "Connect", includeHidden: true });
  await expect(connectPanel.getByText("No apps are connected.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message the PantherWatch Assistant" })).toBeHidden();

  // Chat is the member default: choosing it clears ?tab, and a reload stays there.
  await (await hydrated(page.getByRole("tab", { name: "Chat", exact: true }))).click();
  await expect(page).toHaveURL(`${APP_URL}/assistant`);
  const input = page.getByRole("textbox", { name: "Message the PantherWatch Assistant" });
  await expect(input).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeVisible();
  await expect(connectPanel.getByText("No apps are connected.")).toBeHidden();
});

test("both panels are in the server HTML, the inactive one hidden", async ({ page }) => {
  const panels = (html: string) =>
    Object.fromEntries(
      [...html.matchAll(/<div role="tabpanel" id="[^"]*-panel-(chat|connect)"[^>]*>/g)].map((m) => [
        m[1],
        /\shidden(=""|\s|>)/.test(m[0]) ? "hidden" : "shown",
      ]),
    );
  for (const [as, path, expected] of [
    ["guest", "/assistant", { chat: "hidden", connect: "shown" }],
    ["guest", "/assistant?tab=chat", { chat: "shown", connect: "hidden" }],
    ["member", "/assistant", { chat: "shown", connect: "hidden" }],
    ["member", "/assistant?tab=connect", { chat: "hidden", connect: "shown" }],
  ] as const) {
    if (as === "member") await login(page.request, freshUser("html"));
    const html = await (await page.request.get(path)).text();
    expect(panels(html), `${as} ${path}`).toEqual(expected);
    // The Connect content (the indexable part) is server-rendered even behind the Chat tab.
    expect(html).toContain("How to connect");
    expect(html).toContain("Things you can say");
    expect(html).toContain(MCP_URL);
    expect(html).toContain("PantherWatch Assistant");
  }
});

test("install links and the Claude Code command point at this deployment's connector", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/assistant");

  // Claude and ChatGPT: no pre-fill link exists, so step 1 opens the right settings screen.
  const claude = page.getByRole("tabpanel", { name: "Claude", exact: true });
  const claudeLink = claude.getByRole("link", { name: "Open Claude connectors" });
  await expect(claudeLink).toHaveAttribute("href", "https://claude.ai/customize/connectors");
  await expect(claudeLink).toHaveAttribute("target", "_blank");
  const chatgpt = await openTab(page, "ChatGPT");
  await expect(chatgpt.getByRole("link", { name: "Open ChatGPT plugins" })).toHaveAttribute(
    "href",
    "https://chatgpt.com/plugins",
  );

  // Cursor: cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 mcp.json entry>.
  const cursor = await openTab(page, "Cursor");
  const cursorHref = await cursor.getByRole("link", { name: "Add to Cursor" }).getAttribute("href");
  const cursorLink = new URL(cursorHref!);
  expect(cursorLink.protocol).toBe("cursor:");
  expect(cursorLink.host + cursorLink.pathname).toBe("anysphere.cursor-deeplink/mcp/install");
  expect(cursorLink.searchParams.get("name")).toBe("pantherwatch");
  const cursorConfig = JSON.parse(Buffer.from(cursorLink.searchParams.get("config")!, "base64").toString("utf8"));
  // A `url` entry is a remote (Streamable HTTP) server in Cursor's mcp.json.
  expect(cursorConfig).toEqual({ url: MCP_URL });
  await expect(cursor).toContainText("Or do it by hand");

  // VS Code (and Insiders): vscode:mcp/install?<URL-encoded {name, type, url}>.
  const vscode = await openTab(page, "VS Code");
  for (const [name, scheme] of [
    ["Add to VS Code", "vscode"],
    ["VS Code Insiders", "vscode-insiders"],
  ]) {
    const href = (await vscode.getByRole("link", { name, exact: true }).getAttribute("href"))!;
    const prefix = `${scheme}:mcp/install?`;
    expect(href.startsWith(prefix)).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.slice(prefix.length)))).toEqual({
      name: "pantherwatch",
      type: "http",
      url: MCP_URL,
    });
  }

  // Claude Code: the one-line command, with Copy.
  const claudeCode = await openTab(page, "Claude Code");
  const command = `claude mcp add --transport http pantherwatch ${MCP_URL}`;
  await expect(claudeCode.getByLabel("Command", { exact: true })).toHaveText(command);
  await (await hydrated(claudeCode.getByRole("button", { name: "Copy command" }))).click();
  await expect(claudeCode.getByRole("button", { name: "Copied command" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
});
