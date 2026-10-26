import { connection } from "next/server";
import { handleErrors } from "@/lib/admin/route";
import { listActive } from "@/lib/announcements";

/**
 * GET /api/announcements: public banner feed, announcements visible right now.
 * -> 200 { announcements: PublicAnnouncement[] }
 * Shared caches may keep it for 60 s, so a change can take a minute to show.
 */
export async function GET() {
  // Opt out of build-time prerendering: the list depends on the clock and the database.
  await connection();
  return handleErrors(async () =>
    Response.json(
      { announcements: await listActive() },
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    ),
  );
}
