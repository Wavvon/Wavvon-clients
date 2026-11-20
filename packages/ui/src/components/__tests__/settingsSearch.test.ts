import { describe, it, expect } from "vitest";
import { searchSettings } from "../settings/settingsSearch";

const areas = [
  { id: "general", label: "Generale" },
  { id: "content", label: "Contenuti" },
];
const sections = [
  { id: "behaviour", label: "Comportamento", area: "general", keywords: ["Fuso orario dell'hub", "Colori dei nomi"] },
  { id: "message-limits", label: "Limiti dei messaggi", area: "content", keywords: ["Dimensione allegati per messaggio"] },
  { id: "attachments", label: "Allegati", area: "content" },
];

describe("searchSettings", () => {
  it("finds a section by a row inside it, across areas", () => {
    expect(searchSettings(sections, areas, "fuso")).toEqual([
      { id: "behaviour", label: "Comportamento", areaLabel: "Generale" },
    ]);
  });

  it("ranks a name match above a keyword match", () => {
    expect(searchSettings(sections, areas, "allegati").map((h) => h.id)).toEqual(["attachments", "message-limits"]);
  });

  it("ignores accents and case, and needs every word", () => {
    expect(searchSettings(sections, areas, "LIMITI messaggi").map((h) => h.id)).toEqual(["message-limits"]);
    expect(searchSettings(sections, areas, "limiti voce")).toEqual([]);
    expect(searchSettings([{ id: "a", label: "Identità", area: "general" }], areas, "identita")).toHaveLength(1);
  });

  it("returns nothing for an empty query", () => {
    expect(searchSettings(sections, areas, "   ")).toEqual([]);
  });
});
