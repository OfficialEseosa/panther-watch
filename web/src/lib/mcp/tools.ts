import "server-only";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { Scope } from "@/lib/oauth/scopes";
import { runAs, toolError, TOOLS, type ToolAuth } from "@/lib/tools/registry";

/**
 * The PantherWatch MCP tools: the shared registry (src/lib/tools/registry.ts) registered on an
 * McpServer. Every call is authenticated (withMcpAuth put the verified token on
 * `ctx.http.authInfo`, with the user id in `extra.userId`), then `runAs` checks the token's
 * scopes, rate-limits per user and maps errors. The MCP SDK validates arguments against each
 * tool's input schema (applying defaults) before the callback runs.
 */

export type { ToolAuth } from "@/lib/tools/registry";

function authOf(ctx: ServerContext): ToolAuth | null {
  const info = ctx.http?.authInfo;
  const userId = info?.extra?.userId;
  if (!info || typeof userId !== "string") return null;
  return { userId, scopes: info.scopes as Scope[] };
}

export function registerTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
      async (args: unknown, ctx: ServerContext): Promise<CallToolResult> => {
        const auth = authOf(ctx);
        if (!auth) return toolError("Not signed in to PantherWatch. Reconnect the PantherWatch connector.");
        return runAs(auth, tool.scope, (a) => tool.handler(a, args as Record<string, unknown>));
      },
    );
  }
}

export const SERVER_INSTRUCTIONS =
  "PantherWatch: Georgia State University (GSU) course search, seat alerts and schedule planning for the signed-in " +
  "student. Start with list_terms to get term codes. search_sections reads live GoSolar data; call it once per " +
  "subject and filter locally instead of polling. get_course_requirements gives a section's prerequisites, " +
  "corequisites and registration restrictions; PantherWatch doesn't know what the student has taken. To tell the " +
  "student when a seat opens, use add_watch (email alerts) rather than checking seats repeatedly. The schedule is " +
  "a plan inside PantherWatch: it never registers the student in GoSolar. PantherWatch is not affiliated with " +
  "GSU; GoSolar is the source of truth.";
