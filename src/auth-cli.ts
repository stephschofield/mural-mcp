#!/usr/bin/env node
/**
 * One-shot OAuth login: `npm run auth`.
 *
 * Spins up a localhost callback server, opens the Mural consent page, captures
 * the authorization code, and writes the token set to disk. This is what the
 * March version lacked — tokens had to be obtained by hand in Postman and
 * pasted into config, where they died 15 minutes later.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  MURAL_AUTH_URL,
  DEFAULT_SCOPES,
  loadConfig,
  type MuralConfig,
} from "./config.js";
import { exchangeCode, saveTokens } from "./auth.js";

function openBrowser(url: string): void {
  // cmd /c re-parses the line, so an unquoted URL is split on '&'.
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "start", "", `"${url}"`], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
          detached: true,
          stdio: "ignore",
        });
  child.on("error", () => {
    /* Headless or WSL — the printed URL is the fallback. */
  });
  child.unref();
}

/** Wait for Mural to redirect back with ?code=..., validating state. */
function awaitCallback(
  config: MuralConfig,
  expectedState: string,
): Promise<string> {
  const { port, pathname } = new URL(config.redirectUri);
  const listenPort = Number(port) || 3000;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${listenPort}`);
      if (url.pathname !== pathname) {
        res.writeHead(404).end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      const finish = (msg: string) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;padding:3rem;max-width:32rem">
<h2>${msg}</h2><p>You can close this tab and return to the terminal.</p></body>`);
        server.close();
      };

      if (error) {
        finish("Authorization denied");
        reject(new Error(`Mural returned error: ${error}`));
      } else if (!code) {
        finish("No authorization code received");
        reject(new Error("Callback had no ?code parameter."));
      } else if (state !== expectedState) {
        finish("State mismatch — request rejected");
        reject(
          new Error("OAuth state mismatch: possible CSRF. Re-run `npm run auth`."),
        );
      } else {
        finish("Mural connected");
        resolve(code);
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "EADDRINUSE"
          ? new Error(
              `Port ${listenPort} is already in use. Free it, or set ` +
                `MURAL_REDIRECT_URI to a different port (and update the Mural app).`,
            )
          : err,
      );
    });

    server.listen(listenPort);
    setTimeout(
      () => {
        server.close();
        reject(new Error("Timed out after 5 minutes waiting for authorization."));
      },
      5 * 60_000,
    ).unref();
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL(MURAL_AUTH_URL);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", DEFAULT_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  console.log("\nOpening Mural authorization page...");
  console.log("If it does not open, paste this URL into your browser:\n");
  console.log(`  ${authUrl.toString()}\n`);
  console.log(`Requested scopes: ${DEFAULT_SCOPES.join(", ")}`);
  console.log(`Waiting on ${config.redirectUri} ...\n`);

  openBrowser(authUrl.toString());

  const code = await awaitCallback(config, state);
  const tokens = await exchangeCode(config, code);
  await saveTokens(config.tokenPath, tokens);

  console.log(`Authenticated. Tokens cached at ${config.tokenPath} (mode 0600).`);
  console.log(`Granted scopes: ${tokens.scopes?.join(", ") ?? "(not reported)"}`);
  console.log("\nThe MCP server can now refresh access automatically.\n");
}

main().catch((err: unknown) => {
  console.error(`\nAuth failed: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
