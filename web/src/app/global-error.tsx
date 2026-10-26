"use client";

/**
 * Last-resort boundary (pages.md §10): replaces the root layout, so it can't rely on
 * globals.css. Inline literal colors are allowed here only (they mirror --bg / --text).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f5f7fb",
          color: "#172036",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong.</h1>
          <p style={{ margin: "0 0 16px" }}>
            <a href="" style={{ color: "#0039a6" }}>
              Reload the page
            </a>
          </p>
          {error.digest ? <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>Error ID: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
