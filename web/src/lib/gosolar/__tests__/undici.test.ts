/**
 * Regression test for the F5 affinity fix (session.ts) against a real `node:http` server and the
 * real undici fetch/Agent: each session must use ONE fresh socket for declare + search, and
 * sessions must never share sockets.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Agent } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchCourses } from "../client";
import { GoSolarError } from "../errors";
import type { AgentFactory } from "../http";
import { createGoSolarSession } from "../session";

interface Seen {
  path: string;
  remotePort: number;
  cookie: string | undefined;
}

let server: Server;
let baseUrl: string;
let seen: Seen[];
let sessionCounter: number;
let delay: { path: string; ms: number } | null;

function pathOf(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://x").pathname;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = pathOf(req);
    seen.push({ path, remotePort: req.socket.remotePort ?? -1, cookie: req.headers.cookie });
    req.resume();
    req.on("end", () => {
      const reply = () => {
        if (path === "/term/search") {
          const n = ++sessionCounter;
          res.setHeader("Set-Cookie", [
            `JSESSIONID=session-${n}; Path=/StudentRegistrationSsb; HttpOnly`,
            `BIGipServerpool=node-${n}; path=/; Httponly`,
          ]);
          res.end("{}");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: true, totalCount: 0, data: [], pageOffset: 0, pageMaxSize: 200 }));
      };
      if (delay?.path === path) setTimeout(reply, delay.ms).unref();
      else reply();
    });
  });
  // Keep idle sockets open long enough that accidental reuse across sessions would happen.
  server.keepAliveTimeout = 5_000;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
  sessionCounter = 0;
  delay = null;
});

/** Real Agents, recorded so the test can check they were torn down. */
function recordingFactory(): { agentFactory: AgentFactory; agents: Agent[] } {
  const agents: Agent[] = [];
  return {
    agents,
    agentFactory: () => {
      const agent = new Agent({ connections: 1 });
      agents.push(agent);
      return agent;
    },
  };
}

const search = { term: "202608", subject: "CSC", courseNumber: "1301" };

describe("GoSolar sessions over real sockets", () => {
  it("sends declare and search over the same socket with exactly the declared cookies", async () => {
    const { agentFactory, agents } = recordingFactory();
    await searchCourses(search, { baseUrl, agentFactory });

    expect(seen.map((s) => s.path)).toEqual(["/term/search", "/searchResults/searchResults"]);
    expect(seen[1].remotePort).toBe(seen[0].remotePort);
    expect(seen[0].cookie).toBeUndefined();
    expect(seen[1].cookie).toBe("JSESSIONID=session-1; BIGipServerpool=node-1");
    expect(agents).toHaveLength(1);
    expect(agents[0].destroyed).toBe(true);
  });

  it("gives every session its own socket, sequentially and concurrently", async () => {
    await searchCourses(search, { baseUrl });
    await searchCourses(search, { baseUrl });
    await Promise.all([1, 2, 3].map(() => searchCourses(search, { baseUrl })));

    const searches = seen.filter((s) => s.path === "/searchResults/searchResults");
    expect(searches).toHaveLength(5);
    const ports = new Set<number>();
    for (const s of searches) {
      const n = /JSESSIONID=session-(\d+)/.exec(s.cookie ?? "")?.[1];
      expect(n).toBeDefined();
      expect(s.cookie).toBe(`JSESSIONID=session-${n}; BIGipServerpool=node-${n}`);
      ports.add(s.remotePort);
    }
    // Five sessions, five distinct client sockets: nothing was reused across sessions.
    expect(ports.size).toBe(5);
    expect(new Set(seen.filter((s) => s.path === "/term/search").map((s) => s.remotePort)).size).toBe(5);
    // And within each session the search reused the declaration's socket.
    for (const s of searches) {
      expect(seen.some((d) => d.path === "/term/search" && d.remotePort === s.remotePort)).toBe(true);
    }
  });

  it("destroys the Agent when the declaration times out", async () => {
    delay = { path: "/term/search", ms: 2_000 };
    const { agentFactory, agents } = recordingFactory();
    await expect(createGoSolarSession("202608", { baseUrl, agentFactory, timeoutMs: 100 })).rejects.toThrow();
    expect(agents).toHaveLength(1);
    expect(agents[0].destroyed).toBe(true);
  });

  it("destroys the Agent when the search times out", async () => {
    delay = { path: "/searchResults/searchResults", ms: 2_000 };
    const { agentFactory, agents } = recordingFactory();
    const started = Date.now();
    await expect(searchCourses(search, { baseUrl, agentFactory, timeoutMs: 100 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(agents[0].destroyed).toBe(true);
  });

  it("wraps a non-JSON 200 body in GoSolarError", async () => {
    const html = createServer((req, res) => {
      if (pathOf(req) === "/term/search") res.setHeader("Set-Cookie", "JSESSIONID=x; Path=/");
      res.end("<html>maintenance</html>");
    });
    await new Promise<void>((resolve) => html.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(html.address() as AddressInfo).port}`;
      await expect(searchCourses(search, { baseUrl: url })).rejects.toBeInstanceOf(GoSolarError);
    } finally {
      html.closeAllConnections();
      await new Promise<void>((resolve) => html.close(() => resolve()));
    }
  });
});
