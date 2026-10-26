import { after } from "next/server";
import { json, requireCronSecret } from "@/lib/http";
import { errorMessage } from "./runs";

/** `?sync=1`: run the job inside the request and return its summary (tests, manual runs). */
export function isSyncRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get("sync") === "1";
}

/**
 * Shared body of the background cron routes. Checks `Authorization: Bearer <CRON_SECRET>`,
 * then answers 202 at once and runs `job` in `after()`: pg_net gives up after 10 s, and the
 * function keeps running (up to the route's maxDuration) after the response. With
 * `?sync=1` it awaits the job and returns its result (500 with the message if it throws).
 */
export async function handleCronJob(request: Request, name: string, job: () => Promise<unknown>): Promise<Response> {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  if (isSyncRequest(request)) {
    try {
      return json(await job());
    } catch (error) {
      console.error(`cron ${name} failed`, error);
      return json({ error: errorMessage(error) }, { status: 500 });
    }
  }

  after(async () => {
    try {
      await job();
    } catch (error) {
      // Already recorded in job_runs by the job itself; this is for the runtime log.
      console.error(`cron ${name} failed`, error);
    }
  });
  return json({ accepted: true }, { status: 202 });
}
