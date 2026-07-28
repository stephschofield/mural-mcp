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
  parentId?: string | null;
  style?: { backgroundColor?: string } | null;
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
    });
  }

  return out;
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
