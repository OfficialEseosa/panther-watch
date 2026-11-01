import "server-only";

/**
 * In-memory token buckets, keyed by user id or client IP. BEST-EFFORT ONLY: each serverless
 * instance has its own memory, so the effective limit is per instance, and buckets vanish on
 * cold starts. It stops one runaway agent loop from hammering GoSolar through one instance;
 * it is not a security boundary. GoSolar load is further bounded by each search's own
 * concurrency (one connection per search, at most 4 in flight per lookup).
 */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    /** Burst size. */
    private readonly capacity: number,
    /** Tokens added per second. */
    private readonly refillPerSecond: number,
    /** Keys kept before the oldest are dropped (memory bound). */
    private readonly maxKeys = 10_000,
  ) {}

  /** Takes `cost` tokens for `key`. Returns 0 when allowed, else the seconds to wait. */
  take(key: string, cost = 1, now = Date.now()): number {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    const elapsed = Math.max(0, now - bucket.updated) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updated = now;
    this.buckets.delete(key);
    this.buckets.set(key, bucket); // most recently used last
    if (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return 0;
    }
    return Math.ceil((cost - bucket.tokens) / this.refillPerSecond);
  }

  reset(): void {
    this.buckets.clear();
  }
}

/** Dynamic client registration: 20 per IP, refilling one every 3 minutes. */
export const registrationLimiter = new TokenBucket(20, 1 / 180);
/** Token endpoint: 60 requests per IP per minute. */
export const tokenLimiter = new TokenBucket(60, 1);
/** MCP tool calls: bursts of 30 per user, then one every 2 seconds (30 a minute). */
export const toolLimiter = new TokenBucket(30, 0.5);

/** Clears every limiter (tests). */
export function resetRateLimits(): void {
  registrationLimiter.reset();
  tokenLimiter.reset();
  toolLimiter.reset();
}

/** Client IP for per-IP limits (Vercel sets x-forwarded-for). "unknown" when absent. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
