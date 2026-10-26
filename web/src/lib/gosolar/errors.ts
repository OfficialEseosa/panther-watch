export class GoSolarError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GoSolarError";
  }
}

/**
 * GoSolar answered `success:true, data:null`: the search reached a backend node that never
 * saw the term declaration, i.e. the F5 affinity broke (see session.ts). Should not happen
 * with a per-session Agent; thrown loudly so a regression is visible instead of silently
 * reporting "no sections".
 */
export class GoSolarAffinityError extends GoSolarError {
  constructor(url: string, cookieNames: string[]) {
    super(
      `GoSolar returned success:true with data:null (F5 session affinity lost). ` +
        `Cookies sent: ${cookieNames.join(", ") || "<none>"}`,
      200,
      url,
    );
    this.name = "GoSolarAffinityError";
  }
}
