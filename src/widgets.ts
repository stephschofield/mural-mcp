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

export interface VisualAsset {
  id?: string;
  type: string;
  name?: string | null;
  caption?: string | null;
  url?: string | null;
  x?: number;
  y?: number;
  parentId?: string | null;
}

export interface BoardStructure {
  areas: ExtractedText[];
  stickyNotes: ExtractedText[];
  notes: ExtractedText[];
  images: VisualAsset[];
  stickers: VisualAsset[];
  otherCount: number;
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
  icon: "Sticker",
  sticker: "Sticker",
  emoji: "Sticker",
  stamp: "Sticker",
  pictogram: "Sticker",
};

const STICKY_TYPES = new Set(["sticky_note", "stickynote", "sticky note"]);
const AREA_TYPES = new Set(["area", "framework"]);
const IMAGE_TYPES = new Set(["image", "file"]);
const STICKER_TYPES = new Set([
  "icon",
  "sticker",
  "emoji",
  "stamp",
  "pictogram",
]);

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
export function inReadingOrder<T extends { x?: number; y?: number }>(
  items: T[],
  rowTolerance = 100,
): T[] {
  return [...items].sort((a, b) => {
    const ay = a.y ?? 0;
    const by = b.y ?? 0;
    if (Math.abs(ay - by) > rowTolerance) return ay - by;
    return (a.x ?? 0) - (b.x ?? 0);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(widget: Widget, keys: string[]): string | null {
  const bags: Record<string, unknown>[] = [widget];
  const props = asRecord(widget.properties);
  if (props) bags.push(props);

  for (const bag of bags) {
    for (const key of keys) {
      const raw = bag[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

function toTextItem(widget: Widget, fallback = ""): ExtractedText {
  return {
    id: widget.id,
    type: widgetTypeLabel(widget),
    text: extractTextFromWidget(widget) ?? fallback,
    x: widget.x,
    y: widget.y,
    color: widget.style?.backgroundColor ?? null,
    parentId: widget.parentId ?? null,
  };
}

function toVisualAsset(widget: Widget): VisualAsset {
  return {
    id: widget.id,
    type: widgetTypeLabel(widget),
    name: firstString(widget, ["name", "title", "iconName", "icon"]),
    caption: firstString(widget, ["caption", "description", "alt"]),
    url: firstString(widget, [
      "url",
      "src",
      "thumbnailUrl",
      "imageUrl",
      "hyperlink",
      "href",
    ]),
    x: widget.x,
    y: widget.y,
    parentId: widget.parentId ?? null,
  };
}

/**
 * Split a board into workshop-relevant buckets: areas, sticky notes, other
 * text, images, and stickers/icons. Used by get_mural_structure.
 */
export function extractStructure(widgets: Widget[]): BoardStructure {
  const areas: ExtractedText[] = [];
  const stickyNotes: ExtractedText[] = [];
  const notes: ExtractedText[] = [];
  const images: VisualAsset[] = [];
  const stickers: VisualAsset[] = [];
  let otherCount = 0;

  for (const widget of widgets) {
    const type = rawType(widget);
    if (AREA_TYPES.has(type)) {
      areas.push(toTextItem(widget, widgetTypeLabel(widget)));
    } else if (STICKY_TYPES.has(type)) {
      const text = extractTextFromWidget(widget);
      if (text) stickyNotes.push(toTextItem(widget));
    } else if (IMAGE_TYPES.has(type)) {
      images.push(toVisualAsset(widget));
    } else if (STICKER_TYPES.has(type)) {
      stickers.push(toVisualAsset(widget));
    } else if (isTextBearing(widget) && extractTextFromWidget(widget)) {
      notes.push(toTextItem(widget));
    } else {
      otherCount += 1;
    }
  }

  return {
    areas: inReadingOrder(areas),
    stickyNotes: inReadingOrder(stickyNotes),
    notes: inReadingOrder(notes),
    images: inReadingOrder(images),
    stickers: inReadingOrder(stickers),
    otherCount,
  };
}
