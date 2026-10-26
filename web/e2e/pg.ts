/**
 * Throwaway Postgres for the e2e rig: `initdb` a fresh cluster into PG_DIR, start it on
 * 127.0.0.1:PG_PORT (trust auth, no TLS, fsync off), create PG_DB and apply the migrations
 * with `npm run db:migrate`. `stopPostgres()` stops it and deletes the directory.
 *
 * Needs the Postgres server binaries (initdb, pg_ctl). They are looked up on PATH, then in
 * $PG_BIN, then in scoop's postgresql app dir. Docker is not used.
 *
 * Standalone use (from web/):  npx tsx e2e/pg.ts start   |   npx tsx e2e/pg.ts stop
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { APP_ENV, DATABASE_URL, PG_DB, PG_DIR, PG_PORT, PG_USER } from "./env";

// Playwright and tsx both load these files as CommonJS here (package.json has no "type").
const WEB_DIR = path.resolve(__dirname, "..");
const EXE = process.platform === "win32" ? ".exe" : "";
const DATA_DIR = path.join(PG_DIR, "data");
const LOG_FILE = path.join(PG_DIR, "postgres.log");

function findBin(name: string): string {
  const candidates: string[] = [];
  if (process.env.PG_BIN) candidates.push(path.join(process.env.PG_BIN, name + EXE));
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, name + EXE));
  }
  candidates.push(path.join(os.homedir(), "scoop", "apps", "postgresql", "current", "bin", name + EXE));
  if (process.env.SCOOP) candidates.push(path.join(process.env.SCOOP, "apps", "postgresql", "current", "bin", name + EXE));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`e2e: cannot find ${name}${EXE}. Install Postgres (e.g. \`scoop install postgresql\`) or set PG_BIN.`);
  }
  return found;
}

function run(file: string, args: string[], options: SpawnSyncOptions = {}): void {
  // pg_ctl's postmaster inherits stdio handles; with pipes, spawnSync would wait for the server
  // to exit (notably on Windows), so callers that start it pass stdio: "ignore".
  const result = spawnSync(file, args, { stdio: "inherit", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`e2e: ${path.basename(file)} ${args.join(" ")} exited with ${result.status}`);
}

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
    throw new Error(`e2e: refusing to touch a non-local database (${host})`);
  }
}

/** Stops a cluster left behind by a crashed run (best effort) and deletes PG_DIR. */
function cleanLeftovers(): void {
  if (!existsSync(PG_DIR)) return;
  if (existsSync(path.join(DATA_DIR, "postmaster.pid"))) {
    spawnSync(findBin("pg_ctl"), ["-D", DATA_DIR, "-m", "immediate", "-w", "stop"], { stdio: "ignore", windowsHide: true });
  }
  rmSync(PG_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export async function startPostgres(): Promise<void> {
  assertLoopback(DATABASE_URL);
  cleanLeftovers();
  mkdirSync(PG_DIR, { recursive: true });

  run(findBin("initdb"), ["-D", DATA_DIR, "-U", PG_USER, "--auth=trust", "-E", "UTF8", "--no-locale", "--no-sync"], {
    stdio: "ignore",
  });
  const serverOptions = [
    `-p ${PG_PORT}`,
    "-c listen_addresses=127.0.0.1",
    "-c fsync=off",
    "-c synchronous_commit=off",
    "-c full_page_writes=off",
    "-c max_connections=50",
  ].join(" ");
  run(findBin("pg_ctl"), ["-D", DATA_DIR, "-l", LOG_FILE, "-o", serverOptions, "-w", "-t", "60", "start"], {
    stdio: "ignore",
  });

  const admin = new Client({ host: "127.0.0.1", port: PG_PORT, user: PG_USER, database: "postgres" });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${PG_DB}`);
  } finally {
    await admin.end();
  }

  // The same migration script production uses, with only the throwaway URL in its env.
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "--silent", "db:migrate"], {
    cwd: WEB_DIR,
    env: { ...process.env, DATABASE_URL, DATABASE_CA_CERT: APP_ENV.DATABASE_CA_CERT },
    shell: process.platform === "win32",
  });
}

export function stopPostgres(): void {
  if (existsSync(path.join(DATA_DIR, "postmaster.pid"))) {
    spawnSync(findBin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "-w", "-t", "30", "stop"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  rmSync(PG_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

const isMain = /[\\/]e2e[\\/]pg\.ts$/.test(process.argv[1] ?? "");
if (isMain) {
  const command = process.argv[2];
  if (command === "start") {
    startPostgres().then(
      () => console.log(`e2e Postgres ready: ${DATABASE_URL} (data in ${PG_DIR})`),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  } else if (command === "stop") {
    stopPostgres();
    console.log("e2e Postgres stopped and removed.");
  } else {
    console.error("usage: npx tsx e2e/pg.ts start|stop");
    process.exit(2);
  }
}
