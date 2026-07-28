/**
 * Configuration and constants for the Mural API.
 *
 * Credentials come from the environment only — never hardcoded, never logged.
 */

export const MURAL_API_BASE = "https://app.mural.co/api/public/v1";
export const MURAL_AUTH_URL =
  "https://app.mural.co/api/public/v1/authorization/oauth2/";
export const MURAL_TOKEN_URL =
  "https://app.mural.co/api/public/v1/authorization/oauth2/token";

/**
 * Read-only scope set. Widening this requires re-running `npm run auth`
 * AND ticking the matching scopes on the Mural app itself.
 */
export const DEFAULT_SCOPES = [
  "workspaces:read",
  "rooms:read",
  "murals:read",
  "templates:read",
  "users:read",
  "identity:read",
] as const;

/** Access tokens live 15 minutes; refresh with this much margin to spare. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Mural enforces 25 req/user/sec. Stay under it deliberately. */
export const MAX_REQUESTS_PER_SECOND = 20;

export interface MuralConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
}

function defaultTokenPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return `${home}/.mural-mcp/tokens.json`;
}

/**
 * Load config from the environment.
 * @param requireSecret false when only reading cached tokens is needed.
 */
export function loadConfig(requireSecret = true): MuralConfig {
  const clientId = process.env.MURAL_CLIENT_ID;
  const clientSecret = process.env.MURAL_CLIENT_SECRET;

  if (!clientId) {
    throw new Error(
      "MURAL_CLIENT_ID is not set. Create an app at https://app.mural.co " +
        "(avatar menu -> 'Create and manage apps'), then export MURAL_CLIENT_ID.",
    );
  }
  if (requireSecret && !clientSecret) {
    throw new Error(
      "MURAL_CLIENT_SECRET is not set. Mural requires the client secret on every " +
        "token exchange — there is no public-client mode. The secret is shown only " +
        "once at app creation; use 'Reset' on the app page if you lost it.",
    );
  }

  return {
    clientId,
    clientSecret: clientSecret ?? "",
    redirectUri:
      process.env.MURAL_REDIRECT_URI ?? "http://localhost:3000/callback",
    tokenPath: process.env.MURAL_TOKEN_PATH ?? defaultTokenPath(),
  };
}
