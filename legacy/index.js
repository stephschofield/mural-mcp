#!/usr/bin/env node

/**
 * Mural MCP Server
 * Pulls text content (sticky notes, text objects, shapes with text) from Mural boards into Claude.
 *
 * Setup:
 *   1. Create a Mural app at https://developers.mural.co/public
 *   2. Set scopes: murals:read, rooms:read, workspaces:read
 *   3. Get your OAuth token (see README)
 *   4. Set env var: MURAL_TOKEN=<your_bearer_token>
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const BASE_URL = "https://app.mural.co/api/public/v1";

// In-memory token state
let currentToken = process.env.MURAL_TOKEN || null;
let tokenExpiry = null; // we'll refresh proactively

async function refreshToken() {
  const refreshTok = process.env.MURAL_REFRESH_TOKEN;
  const clientId = process.env.MURAL_CLIENT_ID;
  const clientSecret = process.env.MURAL_CLIENT_SECRET;

  if (!refreshTok || !clientId || !clientSecret) {
    throw new Error(
      "Token expired and MURAL_REFRESH_TOKEN / MURAL_CLIENT_ID / MURAL_CLIENT_SECRET are not all set."
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTok,
  });

  const res = await axios.post(
    "https://app.mural.co/api/public/v1/authorization/oauth2/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  currentToken = res.data.access_token;
  // expires_in is in seconds; refresh 60s early
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return currentToken;
}

async function getToken() {
  if (!currentToken) {
    throw new Error(
      "MURAL_TOKEN environment variable is not set. " +
        "Get your OAuth token from https://developers.mural.co/public and set MURAL_TOKEN=<token>"
    );
  }
  // Proactively refresh if we know expiry and it's close
  if (tokenExpiry && Date.now() >= tokenExpiry) {
    await refreshToken();
  }
  return currentToken;
}

async function getClient() {
  const token = await getToken();
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  // Intercept 401s and retry once after refresh
  client.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 401) {
        const newToken = await refreshToken();
        err.config.headers["Authorization"] = `Bearer ${newToken}`;
        return axios(err.config);
      }
      return Promise.reject(err);
    }
  );

  return client;
}

// Extract text content from a widget object
function extractTextFromWidget(widget) {
  // Mural widgets store text in different fields depending on type
  const textFields = ["text", "title", "htmlText", "content", "plainText"];
  for (const field of textFields) {
    if (widget[field] && typeof widget[field] === "string") {
      // Strip basic HTML tags from htmlText fields
      return widget[field].replace(/<[^>]*>/g, "").trim();
    }
  }
  return null;
}

// Determine a human-readable widget type label
function widgetTypeLabel(widget) {
  const type = (widget.type || widget.widgetType || "unknown").toLowerCase();
  const typeMap = {
    sticky_note: "Sticky Note",
    stickynote: "Sticky Note",
    text: "Text",
    shape: "Shape",
    title: "Title",
    label: "Label",
    card: "Card",
    framework: "Framework",
  };
  return typeMap[type] || type;
}

// ── Tool handlers ────────────────────────────────────────────────────────────

// Fetch ALL widgets across all pages
async function fetchAllWidgets(muralId) {
  const client = await getClient();
  let allWidgets = [];
  let nextToken = null;

  do {
    const params = {};
    if (nextToken) params.next = nextToken;
    const res = await client.get(`/murals/${muralId}/widgets`, { params });
    const val = res.data?.value;
    // API returns value as a plain array OR as {widgets: [...]}
    let batch = [];
    if (Array.isArray(val)) {
      batch = val;
    } else if (val && typeof val === "object") {
      if (Array.isArray(val.widgets)) {
        batch = val.widgets;
      } else {
        // Numeric-keyed object (0,1,2...) - convert to array
        batch = Object.values(val).filter(v => v && typeof v === "object");
      }
    }
    allWidgets = allWidgets.concat(batch);
    nextToken = res.data?.next || val?.next || val?.nextToken || null;
  } while (nextToken);

  return allWidgets;
}

async function listWorkspaces() {
  const client = await getClient();
  let res;
  try { res = await client.get("/workspaces"); } catch(e) { res = await client.get("/users/me/workspaces"); }
  let workspaces = res.data?.value?.workspaces || res.data?.value || [];
  if (!Array.isArray(workspaces)) workspaces = [workspaces].filter(Boolean);
  return workspaces.map((w) => ({ id: w.id, name: w.name }));
}

async function listRooms(workspaceId) {
  const client = await getClient();
  const res = await client.get(`/workspaces/${workspaceId}/rooms`);
  const rooms = res.data?.value?.rooms || res.data?.value || [];
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    muralCount: r.muralsCount ?? r.muralCount ?? "?",
  }));
}

async function listMurals(workspaceId, roomId) {
  const client = await getClient();
  let url = roomId
    ? `/rooms/${roomId}/murals`
    : `/workspaces/${workspaceId}/murals`;
  const res = await client.get(url);
  const murals = res.data?.value?.murals || res.data?.value || [];
  return murals.map((m) => ({
    id: m.id,
    title: m.title || m.name || "(Untitled)",
    createdOn: m.createdOn,
    updatedOn: m.updatedOn,
  }));
}

async function getTextWidgets(muralId, typesFilter) {
  // Fetch all widgets with pagination
  const widgets = await fetchAllWidgets(muralId);

  // Text-bearing widget types
  const TEXT_TYPES = new Set([
    "sticky_note", "stickynote", "sticky note",
    "text",
    "shape",
    "title",
    "label",
    "card",
    "framework",
    "textbox",
    "text_box",
  ]);

  const results = [];
  for (const widget of widgets) {
    const rawType = (widget.type || widget.widgetType || "").toLowerCase();
    const isTextType = TEXT_TYPES.has(rawType);
    const text = extractTextFromWidget(widget);

    // Apply type filter if provided
    if (typesFilter && typesFilter.length > 0) {
      const filterLower = typesFilter.map((t) => t.toLowerCase());
      if (!filterLower.some((f) => rawType.includes(f))) continue;
    } else if (!isTextType) {
      // Skip non-text widgets if no filter specified
      continue;
    }

    if (text) {
      results.push({
        id: widget.id,
        type: widgetTypeLabel(widget),
        text,
        x: widget.x,
        y: widget.y,
        style: widget.style?.backgroundColor || null,
        parentId: widget.parentId || null,
        tags: widget.tags || [],
      });
    }
  }

  // Sort roughly top-to-bottom, left-to-right (reading order)
  results.sort((a, b) => {
    if (a.y === undefined || b.y === undefined) return 0;
    const rowDiff = Math.round(a.y / 50) - Math.round(b.y / 50);
    if (rowDiff !== 0) return rowDiff;
    return (a.x || 0) - (b.x || 0);
  });

  return results;
}

async function getMuralSummary(muralId) {
  const client = await getClient();
  const [muralRes, widgets] = await Promise.all([
    client.get(`/murals/${muralId}`),
    fetchAllWidgets(muralId),
  ]);

  const mural = muralRes.data?.value || {};

  const typeCounts = {};
  let textItemsWithContent = 0;
  for (const w of widgets) {
    const t = (w.type || w.widgetType || "unknown").toLowerCase();
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (extractTextFromWidget(w)) textItemsWithContent++;
  }

  return {
    id: mural.id,
    title: mural.title || mural.name || "(Untitled)",
    totalWidgets: widgets.length,
    widgetsWithText: textItemsWithContent,
    widgetBreakdown: typeCounts,
    createdOn: mural.createdOn,
    updatedOn: mural.updatedOn,
  };
}

// ── MCP Server setup ─────────────────────────────────────────────────────────

const server = new Server(
  { name: "mural-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Debug helper to inspect raw API response
async function getRawWidgets(muralId) {
  const client = await getClient();
  const res = await client.get(`/murals/${muralId}/widgets`);
  const val = res.data?.value || {};
  return {
    topLevelKeys: Object.keys(res.data || {}),
    valueKeys: Object.keys(val),
    hasNext: !!(val.next || val.nextToken || val.nextpage),
    nextToken: val.next || val.nextToken || val.nextpage || null,
    widgetCount: (val.widgets || (Array.isArray(val) ? val : [])).length,
    firstWidget: (val.widgets || [])[0] || null,
    allValueFields: JSON.stringify(Object.keys(val)),
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_workspaces",
      description: "List all Mural workspaces you have access to.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_rooms",
      description: "List rooms inside a Mural workspace.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: {
            type: "string",
            description: "The workspace ID (from list_workspaces)",
          },
        },
        required: ["workspace_id"],
      },
    },
    {
      name: "list_murals",
      description:
        "List murals in a workspace or room. Provide workspace_id and optionally room_id to narrow results.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Workspace ID" },
          room_id: {
            type: "string",
            description: "Optional room ID to filter by room",
          },
        },
        required: ["workspace_id"],
      },
    },
    {
      name: "get_text_content",
      description:
        "Extract all text content (sticky notes, text boxes, shapes with text, cards) from a Mural board. Returns text items sorted roughly in reading order.",
      inputSchema: {
        type: "object",
        properties: {
          mural_id: {
            type: "string",
            description: "The mural ID (from list_murals)",
          },
          widget_types: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional: filter to specific widget types, e.g. ['sticky_note', 'text', 'shape']. Leave empty for all text-bearing widgets.",
          },
        },
        required: ["mural_id"],
      },
    },
    {
      name: "get_mural_summary",
      description:
        "Get a summary of a mural: total widget count, how many contain text, breakdown by type.",
      inputSchema: {
        type: "object",
        properties: {
          mural_id: { type: "string", description: "The mural ID" },
        },
        required: ["mural_id"],
      },
    },
    {
      name: "debug_raw_widgets",
      description: "Debug tool: inspect raw API response structure for widgets endpoint.",
      inputSchema: {
        type: "object",
        properties: {
          mural_id: { type: "string", description: "The mural ID" },
        },
        required: ["mural_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_workspaces": {
        const workspaces = await listWorkspaces();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(workspaces, null, 2),
            },
          ],
        };
      }

      case "list_rooms": {
        const rooms = await listRooms(args.workspace_id);
        return {
          content: [{ type: "text", text: JSON.stringify(rooms, null, 2) }],
        };
      }

      case "list_murals": {
        const murals = await listMurals(args.workspace_id, args.room_id);
        return {
          content: [{ type: "text", text: JSON.stringify(murals, null, 2) }],
        };
      }

      case "get_text_content": {
        const items = await getTextWidgets(args.mural_id, args.widget_types);
        if (items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No text-bearing widgets found in this mural (or none matched your filter).",
              },
            ],
          };
        }
        const formatted = items
          .map(
            (item, i) =>
              `[${i + 1}] [${item.type}] ${item.text}${
                item.tags?.length ? `  (tags: ${item.tags.join(", ")})` : ""
              }`
          )
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${items.length} text items:\n\n${formatted}`,
            },
          ],
        };
      }

      case "get_mural_summary": {
        const summary = await getMuralSummary(args.mural_id);
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "debug_raw_widgets": {
        const raw = await getRawWidgets(args.mural_id);
        return { content: [{ type: "text", text: JSON.stringify(raw, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const msg =
      err?.response?.data?.message || err?.response?.data || err.message;
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
