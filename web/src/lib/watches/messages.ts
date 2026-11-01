// Pure: shared by the Track toast (client) and the MCP add_watch tool (server).

/** What to tell the user after tracking; `openNow` mirrors POST /api/watches (track-while-open rule). */
export function watchAddedBody(openNow: boolean): string {
  return openNow
    ? "This section has open seats right now; we'll alert you when it fills and reopens."
    : "We'll email you when a seat opens.";
}
