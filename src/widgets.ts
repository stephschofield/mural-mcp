/**
 * Widget parsing.
 *
 * Ported from the March server, whose field-probing approach was derived from
 * real API responses: Mural stores widget text in any of several fields
 * depending on widget type, and sometimes as HTML.
 */

export interface Widget {
  id?: string;
  type?: string;
  widgetType?: string;
  text?: string;
  title?: string;
  htmlText?: string;
  content?: string;
  plainText?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  style?: { backgroundColor?: string } | null;
  createdBy?: unknown;
  updatedBy?: unknown;
  contentEditedBy?: unknown;
  [key: string]: unknown;
}

export interface ExtractedText {
  id?: string;
  type: string;
  text: string;
  x?: number;
  y?: number;
  color?: string | null;
  parentId?: string | null;
  createdBy?: string | null;
  editedBy?: string | null;
}

/** A Mural user stamp, as attached to createdBy / updatedBy / contentEditedBy. */
export interface UserRef {
  id?: string;
  firstName?: string;
  lastName?: string;
  alias?: string;
}

/**
 * Render a user stamp as a display name.
 *
 * Anonymous participants carry only `alias` ("Visiting Penguin"); signed-in
 * members carry first/last. Falls back to the opaque id so a widget is never
 * silently unattributed.
 */
export function userName(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const u = user as UserRef;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return u.alias || full || u.id || null;
}

/**
 * Who authored a widget's *content*.
 *
 * `createdBy` records who placed the widget, which on facilitated boards is the
 * facilitator pre-seeding blank stickies — not the person whose idea it holds.
 * `contentEditedBy` is the last person to change the text, which is the closest
 * the API gets to authorship. Prefer it, fall back to creator.
 */
export function contentAuthor(widget: Widget): string | null {
  return userName(widget.contentEditedBy) ?? userName(widget.createdBy);
}

const TEXT_FIELDS = ["text", "title", "htmlText", "content", "plainText"] as const;

const TEXT_BEARING_TYPES = new Set([
  "sticky_note",
  "stickynote",
  "sticky note",
  "text",
  "textbox",
  "text_box",
  "shape",
  "title",
  "label",
  "card",
  "framework",
  "comment",
  "area",
]);

const TYPE_LABELS: Record<string, string> = {
  sticky_note: "Sticky Note",
  stickynote: "Sticky Note",
  "sticky note": "Sticky Note",
  text: "Text",
  textbox: "Text Box",
  text_box: "Text Box",
  shape: "Shape",
  title: "Title",
  label: "Label",
  card: "Card",
  framework: "Framework",
  comment: "Comment",
  area: "Area",
  arrow: "Arrow",
  image: "Image",
  file: "File",
  table: "Table",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Pull display text out of a widget, stripping HTML when present. */
export function extractTextFromWidget(widget: Widget): string | null {
  for (const field of TEXT_FIELDS) {
    const raw = widget[field];
    if (typeof raw === "string" && raw.trim()) {
      const stripped = decodeEntities(raw.replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (stripped) return stripped;
    }
  }
  return null;
}

export function rawType(widget: Widget): string {
  return (widget.type ?? widget.widgetType ?? "unknown").toLowerCase();
}

export function widgetTypeLabel(widget: Widget): string {
  const t = rawType(widget);
  return TYPE_LABELS[t] ?? t;
}

export function isTextBearing(widget: Widget): boolean {
  return TEXT_BEARING_TYPES.has(rawType(widget));
}

/** Extract text from a widget list, optionally filtered by type substring. */
export function extractTexts(
  widgets: Widget[],
  typeFilter?: string[],
  includeAuthors = false,
): ExtractedText[] {
  const filters = typeFilter?.map((t) => t.toLowerCase()).filter(Boolean);
  const out: ExtractedText[] = [];

  for (const widget of widgets) {
    const type = rawType(widget);

    if (filters?.length) {
      if (!filters.some((f) => type.includes(f))) continue;
    } else if (!isTextBearing(widget)) {
      continue;
    }

    const text = extractTextFromWidget(widget);
    if (!text) continue;

    out.push({
      id: widget.id,
      type: widgetTypeLabel(widget),
      text,
      x: widget.x,
      y: widget.y,
      color: widget.style?.backgroundColor ?? null,
      parentId: widget.parentId ?? null,
      ...(includeAuthors
        ? {
            createdBy: userName(widget.createdBy),
            editedBy: userName(widget.contentEditedBy),
          }
        : {}),
    });
  }

  return out;
}

/**
 * Reduce a widget to the fields that carry meaning for analysis.
 *
 * Raw Mural widgets are ~1.5 KB each (avatar URLs with signed query strings,
 * presentation indices, style sub-objects), so a 900-widget board is well over
 * a megabyte. Projecting to geometry + authorship keeps a whole board readable.
 */
export function projectWidget(widget: Widget): Record<string, unknown> {
  return {
    id: widget.id,
    type: widgetTypeLabel(widget),
    text: extractTextFromWidget(widget),
    x: widget.x,
    y: widget.y,
    width: widget.width,
    height: widget.height,
    parentId: widget.parentId ?? null,
    color: widget.style?.backgroundColor ?? null,
    createdBy: userName(widget.createdBy),
    editedBy: userName(widget.contentEditedBy),
  };
}

/** Tally who authored the content on a board, by widget type. */
export function summarizeAuthors(
  widgets: Widget[],
  typeFilter?: string[],
): Record<string, number> {
  const filters = typeFilter?.map((t) => t.toLowerCase()).filter(Boolean);
  const counts: Record<string, number> = {};

  for (const w of widgets) {
    if (filters?.length && !filters.some((f) => rawType(w).includes(f))) continue;
    // Only count widgets that actually hold content — blank pre-seeded
    // stickies would otherwise inflate the facilitator's share.
    if (!extractTextFromWidget(w)) continue;
    const who = contentAuthor(w) ?? "(unattributed)";
    counts[who] = (counts[who] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

/** Count widgets by human-readable type. */
export function summarizeWidgets(widgets: Widget[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of widgets) {
    const label = widgetTypeLabel(w);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]),
  );
}

/**
 * Sort widgets into reading order (top-to-bottom, left-to-right) so exported
 * text follows the board's visual layout rather than API return order.
 */
export function inReadingOrder(items: ExtractedText[], rowTolerance = 100): ExtractedText[] {
  return [...items].sort((a, b) => {
    const ay = a.y ?? 0;
    const by = b.y ?? 0;
    if (Math.abs(ay - by) > rowTolerance) return ay - by;
    return (a.x ?? 0) - (b.x ?? 0);
  });
}
