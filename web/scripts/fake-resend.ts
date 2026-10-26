/**
 * Fake Resend for local dev (`npm run dev:local`): the app's Resend SDK posts to
 * `RESEND_BASE_URL=http://127.0.0.1:<port>/resend`, so no email ever leaves the machine.
 * Mirrors the Resend half of e2e/fake-gosolar-server.ts, plus a tiny inbox to read them:
 *
 *   POST /resend/emails   record the email, answer { id }; calls `onEmail` (dev-local logs it)
 *   GET  /                HTML list of the emails received since start
 *   GET  /emails          the same as JSON
 *   GET  /emails/<id>     one email's HTML body, as sent
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface FakeEmail {
  id: string;
  to: string[];
  subject: string;
  html: string;
  receivedAt: string;
}

export interface FakeResend {
  url: string;
  emails: FakeEmail[];
  close(): Promise<void>;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

export async function startFakeResend(port: number, onEmail: (email: FakeEmail) => void): Promise<FakeResend> {
  const emails: FakeEmail[] = [];
  let seq = 0;

  const server: Server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? "/", "http://fake");
      const body = await readBody(req);
      if (req.method === "POST" && pathname === "/resend/emails") {
        const input = (JSON.parse(body || "{}") ?? {}) as { to?: string | string[]; subject?: string; html?: string };
        const email: FakeEmail = {
          id: `local-email-${++seq}`,
          to: Array.isArray(input.to) ? input.to : input.to ? [input.to] : [],
          subject: input.subject ?? "",
          html: input.html ?? "",
          receivedAt: new Date().toISOString(),
        };
        emails.push(email);
        onEmail(email);
        return send(res, 200, "application/json", JSON.stringify({ id: email.id }));
      }
      if (req.method === "GET" && pathname === "/emails") {
        return send(res, 200, "application/json", JSON.stringify({ emails }));
      }
      if (req.method === "GET" && pathname.startsWith("/emails/")) {
        const email = emails.find((e) => e.id === decodeURIComponent(pathname.slice("/emails/".length)));
        return email ? send(res, 200, "text/html; charset=utf-8", email.html) : send(res, 404, "text/plain", "no such email");
      }
      if (req.method === "GET" && pathname === "/") {
        const rows = emails
          .map(
            (e) =>
              `<li><a href="/emails/${encodeURIComponent(e.id)}">${escape(e.subject || "(no subject)")}</a> ` +
              `to ${escape(e.to.join(", "))} at ${escape(e.receivedAt)}</li>`,
          )
          .reverse()
          .join("");
        return send(
          res,
          200,
          "text/html; charset=utf-8",
          `<!doctype html><meta charset="utf-8"><title>Local inbox</title><h1>Emails the app sent (${emails.length})</h1>` +
            (rows ? `<ul>${rows}</ul>` : "<p>None yet.</p>"),
        );
      }
      return send(res, 404, "application/json", JSON.stringify({ error: `fake Resend has no route ${req.method} ${pathname}` }));
    } catch (error) {
      send(res, 500, "application/json", JSON.stringify({ error: String(error) }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    emails,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
