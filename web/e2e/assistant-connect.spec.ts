import type { Page } from "@playwright/test";
import { APP_URL } from "./env";
import { expect, hydrated, test } from "./support";

/**
 * /assistant one-click setup (components/assistant/ConnectButtons.tsx): the Cursor and VS Code
 * install links carry this deployment's connector URL (APP_URL, not production) with the HTTP
 * transport, Claude Code gets the `claude mcp add` command with Copy, and Claude / ChatGPT (no
 * install link exists) link to their settings screens. Guests see the same steps.
 */

const MCP_URL = `${new URL(APP_URL).origin}/api/mcp`;

async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await (await hydrated(tab)).click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return page.getByRole("tabpanel");
}

test("install links and the Claude Code command point at this deployment's connector", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/assistant");

  // Claude and ChatGPT: no pre-fill link exists, so step 1 opens the right settings screen.
  const claude = page.getByRole("tabpanel");
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
