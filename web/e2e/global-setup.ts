import { startPostgres, stopPostgres } from "./pg";

/**
 * Starts the throwaway Postgres and applies the migrations. The returned function is
 * Playwright's teardown: it stops the cluster and deletes its data directory.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  try {
    await startPostgres();
  } catch (error) {
    stopPostgres();
    throw error;
  }
  return async () => stopPostgres();
}
