#!/usr/bin/env node
/**
 * Mural MCP server (read-only).
 *
 * Tool design: hybrid. Ten dedicated tools cover the high-traffic paths;
 * search_actions/execute_action reach the long tail of the ~100-endpoint API
 * without putting 100 schemas in the context window.
 *
 * Safety: the HTTP client issues GET only and the action catalog contains no
 * mutating endpoints, so no tool call can modify or delete a Mural board.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig, DEFAULT_SCOPES } from "./config.js";
import { MuralClient, MuralApiError, normalizeItems } from "./client.js";
import { loadTokens } from "./auth.js";
import {
  extractTexts,
  summarizeWidgets,
  summarizeAuthors,
  projectWidget,
  inReadingOrder,
  rawType,
  type Widget,
} from "./widgets.js";
import {
  ACTIONS,
  searchActions,
  findAction,
  buildRequest,
} from "./actions.js";

// Boot on cached tokens alone; credentials are only needed to refresh.
const config = loadConfig(false);
const client = new MuralClient(config);

const server = new McpServer(
  { name: "mural-mcp", version: "2.0.0" },
  {
    instructions:
      "Read-only access to Mural boards. Start with list_workspaces to get a " +
      "workspace id, then list_rooms / list_murals to find a mural id, then " +
      "get_mural_text to read its contents. For anything not covered by a " +
      "dedicated tool, call search_actions with a plain-English intent and then " +
      "execute_action. This server cannot create, modify, or delete anything.",
  },
);

/** Render a tool result as pretty JSON text. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message =
    err instanceof MuralApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Wrap a handler so thrown errors become tool errors rather than crashes. */
function handler<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}

// ── Connection / diagnostics ────────────────────────────────────────────────

server.registerTool(
  "check_connection",
  {
    title: "Check Mural connection",
    description:
      "Verify authentication with Mural and report the signed-in user, granted " +
      "scopes, and current rate-limit status. Run this first when something fails.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(async () => {
    const tokens = await loadTokens(config.tokenPath);
    if (!tokens) {
      throw new Error(
        "No cached tokens. Run `npm run auth` in the mural-mcp directory.",
      );
    }
    const user = await client.get<Record<string, unknown>>("/users/me");
    return {
      connected: true,
      user: normalizeItems(user)[0] ?? user.value ?? user,
      grantedScopes: tokens.scopes ?? DEFAULT_SCOPES,
      accessTokenExpiresAt: new Date(tokens.expiresAt).toISOString(),
      rateLimit: client.getRateLimitStatus(),
      mode: "read-only",
    };
  }),
);

// ── Navigation: workspaces -> rooms -> murals ───────────────────────────────

server.registerTool(
  "list_workspaces",
  {
    title: "List workspaces",
    description:
      "List all Mural workspaces the authenticated user belongs to. " +
      "Returns workspace ids needed by most other tools.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(async () => {
    const { items, truncated } = await client.getAllPages<Record<string, unknown>>(
      "/workspaces",
    );
    return {
      count: items.length,
      truncated,
      workspaces: items.map((w) => ({ id: w.id, name: w.name })),
    };
  }),
);

server.registerTool(
  "list_rooms",
  {
    title: "List rooms",
    description:
      "List the rooms in a workspace. Rooms group related murals. " +
      "Get workspaceId from list_workspaces.",
    inputSchema: {
      workspaceId: z.string().describe("Workspace id from list_workspaces."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(async ({ workspaceId }: { workspaceId: string }) => {
    const { items, truncated } = await client.getAllPages<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rooms`,
    );
    return {
      count: items.length,
      truncated,
      rooms: items.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        muralCount: r.muralsCount ?? r.muralCount ?? null,
      })),
    };
  }),
);

server.registerTool(
  "list_murals",
  {
    title: "List murals",
    description:
      "List murals in a room (preferred) or across a whole workspace. " +
      "Supply exactly one of roomId or workspaceId.",
    inputSchema: {
      roomId: z.string().optional().describe("Room id — lists murals in that room."),
      workspaceId: z
        .string()
        .optional()
        .describe("Workspace id — lists all murals in the workspace."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({ roomId, workspaceId }: { roomId?: string; workspaceId?: string }) => {
      if (!roomId && !workspaceId) {
        throw new Error("Provide either roomId or workspaceId.");
      }
      const path = roomId
        ? `/rooms/${encodeURIComponent(roomId)}/murals`
        : `/workspaces/${encodeURIComponent(workspaceId!)}/murals`;

      const { items, truncated } = await client.getAllPages<Record<string, unknown>>(path);
      return {
        count: items.length,
        truncated,
        murals: items.map((m) => ({
          id: m.id,
          title: m.title ?? m.name ?? "(Untitled)",
          createdOn: m.createdOn,
          updatedOn: m.updatedOn,
          roomId: m.roomId,
        })),
      };
    },
  ),
);

server.registerTool(
  "get_mural",
  {
    title: "Get mural details",
    description:
      "Get metadata for one mural: title, dimensions, timestamps, and sharing settings. " +
      "Use get_mural_text to read the actual board contents.",
    inputSchema: {
      muralId: z.string().describe("Mural id from list_murals or search_murals."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(async ({ muralId }: { muralId: string }) => {
    const body = await client.get<Record<string, unknown>>(
      `/murals/${encodeURIComponent(muralId)}`,
    );
    return body.value ?? body;
  }),
);

// ── Board contents ──────────────────────────────────────────────────────────

/**
 * Fetch every widget on a mural, following pagination.
 *
 * maxPages is generous because widget pages are small (~100 items) and a
 * workshop board can hold thousands; the response is projected or filtered
 * downstream, so a complete fetch does not imply a huge tool result.
 */
async function fetchWidgets(muralId: string) {
  return client.getAllPages<Widget>(
    `/murals/${encodeURIComponent(muralId)}/widgets`,
    {},
    100,
  );
}

server.registerTool(
  "get_mural_text",
  {
    title: "Get mural text content",
    description:
      "Extract all readable text from a mural — sticky notes, text boxes, shapes, " +
      "titles, cards, and comments. This is the main tool for understanding what a " +
      "board says. Returns items in visual reading order (top-to-bottom, left-to-right).",
    inputSchema: {
      muralId: z.string().describe("Mural id from list_murals."),
      types: z
        .array(z.string())
        .optional()
        .describe(
          'Optional widget-type filter, e.g. ["sticky"] for sticky notes only. ' +
            "Omit to get all text-bearing widgets.",
        ),
      groupByColor: z
        .boolean()
        .optional()
        .describe(
          "Group results by sticky-note color, which often encodes categories " +
            "in workshop boards.",
        ),
      authors: z
        .boolean()
        .optional()
        .describe(
          "Attach who created and who last edited each item. Use get_mural_authors " +
            "for a per-person rollup instead.",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({
      muralId,
      types,
      groupByColor,
      authors,
    }: {
      muralId: string;
      types?: string[];
      groupByColor?: boolean;
      authors?: boolean;
    }) => {
      const { items, truncated } = await fetchWidgets(muralId);
      const texts = inReadingOrder(extractTexts(items, types, authors));

      if (!groupByColor) {
        return {
          muralId,
          widgetsScanned: items.length,
          textItems: texts.length,
          truncated,
          items: texts,
        };
      }

      const groups: Record<string, string[]> = {};
      for (const t of texts) {
        const key = t.color ?? "no color";
        (groups[key] ??= []).push(t.text);
      }
      return {
        muralId,
        widgetsScanned: items.length,
        textItems: texts.length,
        truncated,
        groupedByColor: groups,
      };
    },
  ),
);

server.registerTool(
  "get_mural_summary",
  {
    title: "Summarize mural contents",
    description:
      "Overview of a mural: widget counts by type and a sample of its text. " +
      "Cheaper than get_mural_text for deciding whether a board is worth reading in full.",
    inputSchema: {
      muralId: z.string().describe("Mural id from list_murals."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(async ({ muralId }: { muralId: string }) => {
    const { items, truncated } = await fetchWidgets(muralId);
    const texts = inReadingOrder(extractTexts(items));
    return {
      muralId,
      totalWidgets: items.length,
      truncated,
      widgetTypes: summarizeWidgets(items),
      textItemCount: texts.length,
      sampleText: texts.slice(0, 15).map((t) => t.text),
    };
  }),
);

server.registerTool(
  "get_mural_widgets",
  {
    title: "Get raw mural widgets",
    description:
      "Return widget objects including geometry, style, and authorship. Use when " +
      "you need positions, colors, or who wrote what — fields get_mural_text omits. " +
      "Returns a compact projection by default; pass full=true for raw API objects " +
      "(very verbose — roughly 1.5 KB per widget). Page through large boards with " +
      "offset, and use the returned `nextOffset` to continue.",
    inputSchema: {
      muralId: z.string().describe("Mural id from list_murals."),
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe(
          "Max widgets to return (default 250 projected, 50 when full=true).",
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Index to start from. Use nextOffset from a prior call to page."),
      types: z
        .array(z.string())
        .optional()
        .describe('Filter by widget type substring, e.g. ["sticky"].'),
      full: z
        .boolean()
        .optional()
        .describe(
          "Return raw unprojected widget objects. Verbose; prefer the default.",
        ),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({
      muralId,
      limit,
      offset,
      types,
      full,
    }: {
      muralId: string;
      limit?: number;
      offset?: number;
      types?: string[];
      full?: boolean;
    }) => {
      const { items, truncated } = await fetchWidgets(muralId);

      const filters = types?.map((t) => t.toLowerCase()).filter(Boolean);
      const matching = filters?.length
        ? items.filter((w) => filters.some((f) => rawType(w).includes(f)))
        : items;

      const start = offset ?? 0;
      const cap = limit ?? (full ? 50 : 250);
      const page = matching.slice(start, start + cap);
      const end = start + page.length;
      const more = end < matching.length;

      return {
        muralId,
        totalWidgets: items.length,
        matchingWidgets: matching.length,
        offset: start,
        returned: page.length,
        nextOffset: more ? end : null,
        // `truncated` means the API paginated past our page budget; `more`
        // means this response is one page of a complete local result set.
        truncated: truncated || more,
        fetchTruncated: truncated,
        widgets: full ? page : page.map(projectWidget),
      };
    },
  ),
);

server.registerTool(
  "get_mural_authors",
  {
    title: "Get mural authorship",
    description:
      "Report who wrote the content on a board, and optionally list each person's " +
      "widgets. Attribution uses contentEditedBy (who last changed the text) rather " +
      "than createdBy, because on facilitated boards the facilitator creates blank " +
      "widgets that participants then fill in. Note: duplicating a mural reassigns " +
      "createdBy to the copier, so authorship survives only on the original board.",
    inputSchema: {
      muralId: z.string().describe("Mural id from list_murals."),
      types: z
        .array(z.string())
        .optional()
        .describe('Filter by widget type, e.g. ["sticky"]. Omit for all.'),
      detail: z
        .boolean()
        .optional()
        .describe("Include each author's widget texts, not just counts."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({
      muralId,
      types,
      detail,
    }: {
      muralId: string;
      types?: string[];
      detail?: boolean;
    }) => {
      const { items, truncated } = await fetchWidgets(muralId);
      const counts = summarizeAuthors(items, types);

      if (!detail) {
        return { muralId, totalWidgets: items.length, truncated, authors: counts };
      }

      const texts = inReadingOrder(extractTexts(items, types, true));
      const byAuthor: Record<string, { text: string; parentId: string | null }[]> = {};
      for (const t of texts) {
        const who = t.editedBy ?? t.createdBy ?? "(unattributed)";
        (byAuthor[who] ??= []).push({ text: t.text, parentId: t.parentId ?? null });
      }

      return {
        muralId,
        totalWidgets: items.length,
        truncated,
        authors: counts,
        byAuthor,
      };
    },
  ),
);

// ── Search ──────────────────────────────────────────────────────────────────

server.registerTool(
  "search_murals",
  {
    title: "Search murals",
    description:
      "Find murals by title or content across the user's workspaces. " +
      "Use when the user names a board but you do not have its id.",
    inputSchema: {
      query: z.string().describe("Search text, e.g. 'retrospective' or 'Q3 planning'."),
      workspaceId: z.string().optional().describe("Restrict to one workspace."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({ query, workspaceId }: { query: string; workspaceId?: string }) => {
      const { items, truncated } = await client.getAllPages<Record<string, unknown>>(
        "/search/murals",
        { q: query, ...(workspaceId ? { workspaceId } : {}) },
        5,
      );
      return {
        query,
        count: items.length,
        truncated,
        murals: items.map((m) => ({
          id: m.id,
          title: m.title ?? m.name,
          roomId: m.roomId,
          updatedOn: m.updatedOn,
        })),
      };
    },
  ),
);

// ── Long-tail access ────────────────────────────────────────────────────────

server.registerTool(
  "search_actions",
  {
    title: "Search Mural API actions",
    description:
      "Discover additional read-only Mural API operations not covered by a dedicated " +
      "tool — tags, voting results, timers, templates, room members, folders, and more. " +
      "Describe the intent in plain English, then pass the returned actionId to " +
      "execute_action.",
    inputSchema: {
      query: z
        .string()
        .describe("Plain-English intent, e.g. 'voting results' or 'who is in this room'."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler(async ({ query }: { query: string }) => {
    const matches = searchActions(query);
    return {
      query,
      totalAvailable: ACTIONS.length,
      matches: matches.map((a) => ({
        actionId: a.id,
        description: a.description,
        requiredScope: a.scope,
        parameters: a.params.map((p) => ({
          name: p.name,
          required: p.required,
          description: p.description,
        })),
      })),
      hint:
        matches.length === 0
          ? "No match. This server is read-only — creating or modifying content is not supported."
          : "Call execute_action with actionId and a params object.",
    };
  }),
);

server.registerTool(
  "execute_action",
  {
    title: "Execute a Mural API action",
    description:
      "Run a read-only action discovered via search_actions. Always call search_actions " +
      "first to get the actionId and its required parameters.",
    inputSchema: {
      actionId: z.string().describe("Action id returned by search_actions."),
      params: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe("Parameter object, e.g. { muralId: 'abc123' }."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler(
    async ({
      actionId,
      params,
    }: {
      actionId: string;
      params?: Record<string, string | number>;
    }) => {
      const action = findAction(actionId);
      if (!action) {
        throw new Error(
          `Unknown actionId "${actionId}". Call search_actions to list valid ids.`,
        );
      }

      const { path, query } = buildRequest(action, params ?? {});

      if (action.paginated) {
        const { items, truncated } = await client.getAllPages<unknown>(path, query, 5);
        return { actionId, count: items.length, truncated, items };
      }

      const body = await client.get<Record<string, unknown>>(path, query);
      return { actionId, result: body.value ?? body };
    },
  ),
);

// ── Boot ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — diagnostics must go to stderr.
  console.error("mural-mcp v2.0.0 ready (read-only)");
}

main().catch((err: unknown) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
