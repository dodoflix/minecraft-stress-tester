import { describe, expect, it } from "vitest";
import { renderUiPage } from "../src/ui/page.js";

describe("renderUiPage", () => {
  const html = renderUiPage("tok123");

  it("is a self-contained HTML document with no external resources", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>mcst control panel</title>");
    expect(html).not.toMatch(/https?:\/\/(?!\$\{)/); // no external URLs baked in
  });

  it("embeds the API token safely as a JS string literal", () => {
    expect(html).toContain('const TOKEN="tok123"');
    // A token with a quote must not break out of the string.
    expect(renderUiPage('a"b')).toContain('const TOKEN="a\\"b"');
  });

  it("wires the runs, configs, and history tabs to the API", () => {
    for (const anchor of ['data-tab="runs"', 'data-tab="configs"', 'data-tab="history"']) {
      expect(html).toContain(anchor);
    }
    expect(html).toContain('/api"'); // health probe
    expect(html).toContain("/runs");
    expect(html).toContain("/configs");
    expect(html).toContain("/history");
    expect(html).toContain("EventSource");
  });
});
