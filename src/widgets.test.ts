import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractStructure,
  extractTexts,
  widgetTypeLabel,
  type Widget,
} from "./widgets.js";

const board: Widget[] = [
  { id: "a1", type: "area", title: "Journey map", x: 0, y: 0 },
  {
    id: "s1",
    type: "sticky_note",
    text: "Need SSO",
    x: 10,
    y: 120,
    style: { backgroundColor: "#FFF2CC" },
  },
  { id: "t1", type: "text", htmlText: "<b>Pain points</b>", x: 10, y: 40 },
  {
    id: "i1",
    type: "image",
    name: "current-state.png",
    url: "https://example.com/current-state.png",
    caption: "As-is process",
    x: 400,
    y: 40,
  },
  {
    id: "k1",
    type: "icon",
    name: "thumbs-up",
    properties: { iconName: "thumbs-up" },
    x: 20,
    y: 130,
  },
  { id: "arr", type: "arrow", x: 50, y: 50 },
];

describe("extractTexts", () => {
  it("returns sticky notes and text, not images or stickers", () => {
    const texts = extractTexts(board);
    const types = texts.map((t) => t.type).sort();
    assert.deepEqual(types, ["Area", "Sticky Note", "Text"]);
    assert.equal(
      texts.find((t) => t.id === "t1")?.text,
      "Pain points",
    );
  });
});

describe("extractStructure", () => {
  it("buckets sticky notes, notes, images, stickers, and areas", () => {
    const structure = extractStructure(board);
    assert.equal(structure.areas.length, 1);
    assert.equal(structure.areas[0]?.text, "Journey map");
    assert.equal(structure.stickyNotes.length, 1);
    assert.equal(structure.stickyNotes[0]?.text, "Need SSO");
    assert.equal(structure.notes.length, 1);
    assert.equal(structure.notes[0]?.text, "Pain points");
    assert.equal(structure.images.length, 1);
    assert.equal(structure.images[0]?.url, "https://example.com/current-state.png");
    assert.equal(structure.images[0]?.caption, "As-is process");
    assert.equal(structure.stickers.length, 1);
    assert.equal(structure.stickers[0]?.type, "Sticker");
    assert.equal(structure.stickers[0]?.name, "thumbs-up");
    assert.equal(structure.otherCount, 1);
  });

  it("labels icon widgets as stickers", () => {
    assert.equal(widgetTypeLabel({ type: "icon" }), "Sticker");
  });

  it("prefers an image URL in properties over a top-level link", () => {
    const structure = extractStructure([
      {
        type: "image",
        href: "https://example.com/click-through",
        properties: { imageUrl: "https://example.com/image.png" },
      },
    ]);

    assert.equal(structure.images[0]?.url, "https://example.com/image.png");
  });

  it("retains blank sticky notes", () => {
    const structure = extractStructure([
      { id: "blank", type: "sticky_note", text: "   " },
    ]);

    assert.equal(structure.stickyNotes.length, 1);
    assert.equal(structure.stickyNotes[0]?.id, "blank");
    assert.equal(structure.stickyNotes[0]?.text, "");
  });

  it("does not classify generic file attachments as images", () => {
    const structure = extractStructure([
      { id: "pdf", type: "file", name: "workshop-notes.pdf" },
    ]);

    assert.equal(structure.images.length, 0);
    assert.equal(structure.otherCount, 1);
  });
});
