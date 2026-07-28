/**
 * HTTP client for the Mural API.
 *
 * Handles the three things that bite in practice:
 *   1. 15-minute access tokens  -> proactive refresh + one retry on 401
 *   2. 25 req/user/sec limit    -> client-side throttle + 429 backoff
 *   3. Inconsistent envelopes   -> normalization (ported from the March server,
 *      which discovered `value` can be an array, {widgets:[]}, or a
 *      numeric-keyed object depending on endpoint)
 */

import { MURAL_API_BASE, MAX_REQUESTS_PER_SECOND, type MuralConfig } from "./config.js";
import { getValidAccessToken, forceRefresh } from "./auth.js";

const MIN_REQUEST_INTERVAL_MS = 1000 / MAX_REQUESTS_PER_SECOND;

export interface RateLimitStatus {
  limit?: number;
  remaining?: number;
  resetAt?: string;
  appLimit?: number;
  appRemaining?: number;
  appResetAt?: string;
}

export class MuralApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "MuralApiError";
  }
}

export class MuralClient {
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private rateLimit: RateLimitStatus = {};

  constructor(private readonly config: MuralConfig) {}

  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimit };
  }

  /** Serialize requests and space them to stay under the per-second cap. */
  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private captureRateLimit(headers: Headers): void {
    const num = (h: string): number | undefined => {
      const v = headers.get(h);
      return v === null ? undefined : Number(v);
    };
    // Mural documents two parallel limits: 25 req/user/sec and 10,000 req/app/min.
    // Each reports its own reset as epoch seconds.
    const toIso = (epochSeconds?: number): string | undefined =>
      epochSeconds ? new Date(epochSeconds * 1000).toISOString() : undefined;

    this.rateLimit = {
      limit: num("X-RateLimit-Limit"),
      remaining: num("X-RateLimit-Remaining"),
      resetAt: toIso(num("X-RateLimit-Reset")),
      appLimit: num("X-RateLimit-App-Limit"),
      appRemaining: num("X-RateLimit-App-Remaining"),
      appResetAt: toIso(num("X-RateLimit-App-Reset")),
    };
  }

  /**
   * Issue a GET against the Mural API.
   * Read-only by design: this client exposes no mutating verbs, so a
   * misbehaving tool cannot alter or delete a board.
   */
  async get<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    // Chain onto the queue so concurrent tool calls don't burst past the limit.
    const run = this.queue.then(() => this.execute<T>(path, params));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async execute<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    isRetry = false,
  ): Promise<T> {
    await this.throttle();

    const url = new URL(MURAL_API_BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    const token = await getValidAccessToken(this.config);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    this.captureRateLimit(res.headers);

    // Token rejected despite our expiry math — refresh once and retry.
    if (res.status === 401 && !isRetry) {
      await forceRefresh(this.config);
      return this.execute<T>(path, params, true);
    }

    if (res.status === 429 && !isRetry) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "2");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
      return this.execute<T>(path, params, true);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new MuralApiError(
        this.explain(res.status, body, path),
        res.status,
        path,
      );
    }

    return (await res.json()) as T;
  }

  /** Turn HTTP status codes into guidance rather than raw noise. */
  private explain(status: number, body: string, path: string): string {
    const detail = body.slice(0, 300);
    switch (status) {
      case 401:
        return `Unauthorized on ${path}. Refresh failed — re-run \`npm run auth\`. ${detail}`;
      case 403:
        return (
          `Forbidden on ${path}. The token lacks the required scope, or your ` +
          `account cannot access this resource. This server is read-only; ` +
          `write operations will always fail here. ${detail}`
        );
      case 404:
        return `Not found: ${path}. Check the id is correct and still exists. ${detail}`;
      case 429:
        return `Rate limited on ${path} (25 req/user/sec). ${detail}`;
      default:
        return `Mural API error ${status} on ${path}: ${detail}`;
    }
  }

  /**
   * Follow the `next` cursor to completion.
   * Guarded by maxPages because a large mural can hold thousands of widgets
   * and an unbounded walk would blow the context window and the rate limit.
   */
  async getAllPages<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    maxPages = 20,
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let next: string | undefined;
    let pages = 0;

    do {
      const body = await this.get<Record<string, unknown>>(path, {
        ...params,
        ...(next ? { next } : {}),
      });
      items.push(...normalizeItems<T>(body));
      next = extractNext(body);
      pages += 1;
    } while (next && pages < maxPages);

    return { items, truncated: Boolean(next) };
  }
}

/**
 * Mural's `value` field is not consistently shaped. Observed forms:
 *   { value: [...] }                 - most list endpoints
 *   { value: { widgets: [...] } }    - some widget responses
 *   { value: { "0": {...}, ... } }   - numeric-keyed object
 * This mirrors the defensive handling proven in the March server.
 */
export function normalizeItems<T>(body: Record<string, unknown>): T[] {
  const value = body?.value ?? body;
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["widgets", "murals", "rooms", "workspaces", "templates", "users"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
    const objectValues = Object.values(obj).filter(
      (v): v is T => v !== null && typeof v === "object",
    );
    if (objectValues.length > 0) return objectValues;
  }

  return [];
}

function extractNext(body: Record<string, unknown>): string | undefined {
  const direct = body?.next;
  if (typeof direct === "string" && direct) return direct;

  const value = body?.value as Record<string, unknown> | undefined;
  const nested = value?.next ?? value?.nextToken;
  return typeof nested === "string" && nested ? nested : undefined;
}
