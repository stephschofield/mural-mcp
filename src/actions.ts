/**
 * Catalog of read-only Mural API actions for the search_actions / execute_action
 * pair.
 *
 * Rationale: Mural exposes ~100 endpoints. Declaring each as its own MCP tool
 * would flood the context window on every request and degrade tool selection.
 * The ~10 highest-traffic operations get dedicated tools; everything else lives
 * here and is reached by search.
 *
 * Only GET endpoints appear in this catalog. Mutating endpoints are deliberately
 * absent so that no tool call can alter or delete a board.
 */

export interface ActionParam {
  name: string;
  in: "path" | "query";
  required: boolean;
  description: string;
}

export interface Action {
  id: string;
  description: string;
  path: string;
  params: ActionParam[];
  scope: string;
  keywords: string[];
  paginated?: boolean;
}

const pathParam = (name: string, description: string): ActionParam => ({
  name,
  in: "path",
  required: true,
  description,
});

export const ACTIONS: Action[] = [
  // ── Workspaces ────────────────────────────────────────────────────────────
  {
    id: "get_workspace",
    description: "Get details of a single workspace by id.",
    path: "/workspaces/{workspaceId}",
    params: [pathParam("workspaceId", "The workspace id.")],
    scope: "workspaces:read",
    keywords: ["workspace", "details", "settings", "organization"],
  },

  // ── Rooms ─────────────────────────────────────────────────────────────────
  {
    id: "get_room",
    description: "Get details of a single room by id.",
    path: "/rooms/{roomId}",
    params: [pathParam("roomId", "The room id.")],
    scope: "rooms:read",
    keywords: ["room", "details", "folder", "project"],
  },
  {
    id: "list_open_rooms",
    description: "List rooms in a workspace that are open to all members.",
    path: "/workspaces/{workspaceId}/rooms/open",
    params: [pathParam("workspaceId", "The workspace id.")],
    scope: "rooms:read",
    keywords: ["open", "public", "rooms", "browse"],
    paginated: true,
  },
  {
    id: "list_room_folders",
    description: "List the folders inside a room.",
    path: "/rooms/{roomId}/folders",
    params: [pathParam("roomId", "The room id.")],
    scope: "rooms:read",
    keywords: ["folder", "organize", "structure", "room"],
    paginated: true,
  },

  // ── Murals ────────────────────────────────────────────────────────────────
  {
    id: "get_mural",
    description:
      "Get full metadata for one mural: title, dimensions, timestamps, sharing settings.",
    path: "/murals/{muralId}",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["mural", "board", "metadata", "details", "canvas"],
  },
  {
    id: "list_recently_opened_murals",
    description: "List murals the authenticated user opened recently in a workspace.",
    path: "/workspaces/{workspaceId}/murals/recently-opened",
    params: [pathParam("workspaceId", "The workspace id.")],
    scope: "murals:read",
    keywords: ["recent", "recently", "opened", "history", "last"],
    paginated: true,
  },
  {
    id: "get_mural_export_url",
    description:
      "Get the download URL for a previously started mural export. Read-only: this does not start an export.",
    path: "/murals/{muralId}/export-url",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["export", "download", "pdf", "image", "url"],
  },

  // ── Mural contents ────────────────────────────────────────────────────────
  {
    id: "get_widget",
    description: "Get a single widget by its id.",
    path: "/widgets/{widgetId}",
    params: [pathParam("widgetId", "The widget id.")],
    scope: "murals:read",
    keywords: ["widget", "single", "element", "object"],
  },
  {
    id: "list_mural_tags",
    description: "List the tags defined on a mural.",
    path: "/murals/{muralId}/tags",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["tag", "label", "category", "classification"],
    paginated: true,
  },
  {
    id: "get_tag",
    description: "Get details of a single tag by id.",
    path: "/tags/{tagId}",
    params: [pathParam("tagId", "The tag id.")],
    scope: "murals:read",
    keywords: ["tag", "details"],
  },
  {
    id: "list_mural_files",
    description: "List file widgets attached to a mural.",
    path: "/murals/{muralId}/files",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["file", "attachment", "upload", "document"],
    paginated: true,
  },
  {
    id: "list_voting_sessions",
    description: "List voting sessions held on a mural.",
    path: "/murals/{muralId}/voting-sessions",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["vote", "voting", "poll", "session", "dot"],
    paginated: true,
  },
  {
    id: "get_voting_session",
    description: "Get details of one voting session.",
    path: "/murals/{muralId}/voting-sessions/{votingSessionId}",
    params: [
      pathParam("muralId", "The mural id."),
      pathParam("votingSessionId", "The voting session id."),
    ],
    scope: "murals:read",
    keywords: ["vote", "voting", "session", "details"],
  },
  {
    id: "get_voting_results",
    description: "Get the results of a voting session — useful for summarizing team decisions.",
    path: "/murals/{muralId}/voting-sessions/{votingSessionId}/results",
    params: [
      pathParam("muralId", "The mural id."),
      pathParam("votingSessionId", "The voting session id."),
    ],
    scope: "murals:read",
    keywords: ["vote", "voting", "results", "winner", "tally", "decision"],
  },
  {
    id: "get_mural_timer",
    description: "Get the current timer state for a mural.",
    path: "/murals/{muralId}/timer",
    params: [pathParam("muralId", "The mural id.")],
    scope: "murals:read",
    keywords: ["timer", "countdown", "time", "facilitation"],
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  {
    id: "list_default_templates",
    description: "List Mural's built-in default templates.",
    path: "/templates/default",
    params: [],
    scope: "templates:read",
    keywords: ["template", "default", "builtin", "gallery", "starter"],
    paginated: true,
  },
  {
    id: "list_workspace_templates",
    description: "List custom templates saved in a workspace.",
    path: "/workspaces/{workspaceId}/templates",
    params: [pathParam("workspaceId", "The workspace id.")],
    scope: "templates:read",
    keywords: ["template", "custom", "workspace", "saved"],
    paginated: true,
  },
  {
    id: "list_recent_templates",
    description: "List templates used recently.",
    path: "/templates/recent",
    params: [],
    scope: "templates:read",
    keywords: ["template", "recent", "history"],
    paginated: true,
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  {
    id: "get_current_user",
    description: "Get the authenticated user's profile — useful for verifying the connection.",
    path: "/current-user",
    params: [],
    scope: "identity:read",
    keywords: ["me", "user", "profile", "whoami", "identity", "account"],
  },
  {
    id: "list_mural_users",
    description: "List users with access to a mural and their permission levels.",
    path: "/murals/{muralId}/users",
    params: [pathParam("muralId", "The mural id.")],
    scope: "users:read",
    keywords: ["user", "member", "collaborator", "permission", "access", "who"],
    paginated: true,
  },
  {
    id: "list_room_users",
    description: "List users with access to a room and their permission levels.",
    path: "/rooms/{roomId}/users",
    params: [pathParam("roomId", "The room id.")],
    scope: "users:read",
    keywords: ["user", "member", "room", "permission", "access", "team"],
    paginated: true,
  },

  // ── Search ────────────────────────────────────────────────────────────────
  {
    id: "search_murals",
    description: "Search murals across the workspace by text query.",
    path: "/search/murals",
    params: [
      { name: "q", in: "query", required: true, description: "Search text." },
      {
        name: "workspaceId",
        in: "query",
        required: false,
        description: "Restrict the search to one workspace.",
      },
    ],
    scope: "murals:read",
    keywords: ["search", "find", "query", "mural", "lookup"],
    paginated: true,
  },
  {
    id: "search_rooms",
    description: "Search rooms by text query.",
    path: "/search/rooms",
    params: [
      { name: "q", in: "query", required: true, description: "Search text." },
      {
        name: "workspaceId",
        in: "query",
        required: false,
        description: "Restrict the search to one workspace.",
      },
    ],
    scope: "rooms:read",
    keywords: ["search", "find", "query", "room", "lookup"],
    paginated: true,
  },
  {
    id: "search_templates",
    description: "Search templates by text query.",
    path: "/search/templates",
    params: [
      { name: "q", in: "query", required: true, description: "Search text." },
      {
        name: "workspaceId",
        in: "query",
        required: false,
        description: "Restrict the search to one workspace.",
      },
    ],
    scope: "templates:read",
    keywords: ["search", "find", "query", "template", "lookup"],
    paginated: true,
  },
];

/** Rank actions against a natural-language intent. */
export function searchActions(query: string, limit = 8): Action[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

  if (terms.length === 0) return ACTIONS.slice(0, limit);

  const scored = ACTIONS.map((action) => {
    const haystack = `${action.id} ${action.description} ${action.keywords.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (action.id.toLowerCase().includes(term)) score += 5;
      if (action.keywords.some((k) => k === term)) score += 4;
      if (action.keywords.some((k) => k.includes(term))) score += 2;
      if (haystack.includes(term)) score += 1;
    }
    return { action, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.action);
}

export function findAction(id: string): Action | undefined {
  return ACTIONS.find((a) => a.id === id);
}

/**
 * Substitute path params and split out query params.
 * Throws when a required param is missing so the model gets a clear correction
 * rather than a 404 from a malformed URL.
 */
export function buildRequest(
  action: Action,
  args: Record<string, unknown>,
): { path: string; query: Record<string, string> } {
  let path = action.path;
  const query: Record<string, string> = {};

  for (const param of action.params) {
    const raw = args[param.name];
    const value = raw === undefined || raw === null ? "" : String(raw);

    if (!value) {
      if (param.required) {
        throw new Error(
          `Missing required parameter "${param.name}" for action "${action.id}": ${param.description}`,
        );
      }
      continue;
    }

    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, encodeURIComponent(value));
    } else {
      query[param.name] = value;
    }
  }

  const unresolved = path.match(/\{([^}]+)\}/);
  if (unresolved) {
    throw new Error(
      `Parameter "${unresolved[1]}" was not supplied for action "${action.id}".`,
    );
  }

  return { path, query };
}
