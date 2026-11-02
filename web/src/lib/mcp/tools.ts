import "server-only";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { Scope } from "@/lib/oauth/scopes";
import { runAs, toolError, TOOLS, type ToolAuth, type ToolDefinition } from "@/lib/tools/registry";

/**
 * The PantherWatch MCP tools: the shared registry (src/lib/tools/registry.ts) registered on an
 * McpServer. Every call is authenticated (withMcpAuth put the verified token on
 * `ctx.http.authInfo`, with the user id in `extra.userId`), then `runAs` checks the token's
 * scopes, rate-limits per user and maps errors. The MCP SDK validates arguments against each
 * tool's input schema (applying defaults) before the callback runs. Tools with `scope: "site"`
 * (account settings) belong to the on-site assistant only and are not registered here.
 */

export type { ToolAuth } from "@/lib/tools/registry";

function authOf(ctx: ServerContext): ToolAuth | null {
  const info = ctx.http?.authInfo;
  const userId = info?.extra?.userId;
  if (!info || typeof userId !== "string") return null;
  return { userId, scopes: info.scopes as Scope[] };
}

/** The tools served over MCP: every registry tool except the on-site-only ones (`scope: "site"`). */
export const MCP_TOOLS: readonly ToolDefinition[] = TOOLS.filter((tool) => tool.scope !== "site");

export function registerTools(server: McpServer): void {
  for (const tool of MCP_TOOLS) {
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
  "GSU; GoSolar is the source of truth. " +
  "Levels: GSU has bachelor's sections (Atlanta campus and online), associate sections (Perimeter College) and " +
  "graduate sections. search_sections searches one level: its `level` input, else the student's saved campus, " +
  "else bachelor's; `levelSource` (input, preference or default) says which. When `levelSource` is default and " +
  "`alsoAtAssociateLevel` is more than 0, ask the student once, before recommending sections: \"Are you at the " +
  "Atlanta campus or online (bachelor's), or at Perimeter College (associate)?\" Then search again with that " +
  "`level` if it isn't bachelor's, and tell them they can set their campus under Settings → Campus on PantherWatch " +
  "so they aren't asked again. When it came from their preference, mention it only if the results look off. If " +
  "nothing is found, check `alsoAtAssociateLevel` and `alsoAtGraduateLevel` before saying a class isn't offered. " +
  "Syllabi: when comparing sections or professors, or asked about workload, grading, exams, attendance or " +
  "textbooks, call get_syllabus_summary for the candidate sections that have a syllabus (in parallel, at most 6), " +
  "say which term the syllabus names, and never guess when none is posted. " +
  "Registration advice: PantherWatch doesn't know the student's degree program, completed courses or what counts " +
  "toward their requirements. When the student names a course, help them pick its best section (seats, times, " +
  "professor grade history and ratings, syllabus). Don't suggest different or additional courses to fill a " +
  "requirement unless the student has shared their degree audit or requirement list in the conversation and the " +
  "course is explicitly on it, and even then say the audit and their academic advisor are the authority. When " +
  "asked what to take without that, ask first: program and catalog year, what the audit says is still needed, " +
  "which courses they are considering, and constraints (in-person or online credits, days, times). Never present " +
  "prerequisite or restriction eligibility as certain; GoSolar checks it at registration. Seat alerts and the " +
  "schedule are planning tools; registration happens in GoSolar.";
