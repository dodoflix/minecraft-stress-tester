import { describe, expect, it } from "vitest";
import { renderWebPage } from "../src/report/webPage.js";

describe("renderWebPage", () => {
  it("is a self-contained page that subscribes to SSE", () => {
    const html = renderWebPage({ target: "h:25565", version: "1.21", count: 100 });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('new EventSource("/events")');
    expect(html).toContain("h:25565");
    expect(html).toContain("COUNT=100");
    expect(html).not.toContain("http://"); // no external assets
  });

  it("escapes the target and version", () => {
    const html = renderWebPage({ target: "<x>", version: '"v', count: 0 });
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain("&quot;v");
  });
});
