import { describe, expect, it } from "vitest";
import type { Blueprint } from "../src/script/blueprint.js";
import { blueprintToGraph, graphToBlueprint, type ScriptGraph } from "../src/script/graph.js";

const blueprint: Blueprint = {
  name: "demo",
  rules: [
    { on: "spawn", actions: [{ type: "chat", message: "hi" }, { type: "wait", ms: 500 }, { type: "stop" }] },
    {
      on: "chat",
      actions: [
        { type: "goto", x: 1, y: 2, z: 3 },
        { type: "command", command: "list" },
      ],
    },
    { on: "death", actions: [{ type: "look", yaw: 1.5, pitch: 0 }] },
  ],
};

describe("blueprint <-> graph round-trip", () => {
  it("blueprintToGraph produces chained nodes and edges", () => {
    const g = blueprintToGraph(blueprint);
    expect(g.nodes.filter((n) => n.kind === "event")).toHaveLength(3);
    expect(g.nodes.filter((n) => n.kind === "action")).toHaveLength(6);
    expect(g.edges).toHaveLength(6 - 3 + 3); // 3 event->action + 3 action->action links
    // every node has a position
    expect(g.nodes.every((n) => n.position && typeof n.position.x === "number")).toBe(true);
  });

  it("round-trips back to the same blueprint", () => {
    const back = graphToBlueprint(blueprintToGraph(blueprint));
    expect(back.ok).toBe(true);
    expect(back.blueprint).toEqual(blueprint);
  });
});

describe("graphToBlueprint", () => {
  it("drops event nodes with no action chain", () => {
    const g: ScriptGraph = { name: "x", nodes: [{ id: "e", kind: "event", type: "spawn" }], edges: [] };
    expect(graphToBlueprint(g).blueprint?.rules).toEqual([]);
  });

  it("follows only the first outgoing edge and ignores cycles", () => {
    const g: ScriptGraph = {
      nodes: [
        { id: "e", kind: "event", type: "spawn" },
        { id: "a", kind: "action", type: "chat", data: { message: "one" } },
        { id: "b", kind: "action", type: "chat", data: { message: "two" } },
      ],
      edges: [
        { id: "1", source: "e", target: "a" },
        { id: "2", source: "a", target: "b" },
        { id: "3", source: "b", target: "a" }, // cycle back; must terminate
      ],
    };
    const r = graphToBlueprint(g);
    expect(r.ok).toBe(true);
    expect(r.blueprint?.rules[0]?.actions).toEqual([
      { type: "chat", message: "one" },
      { type: "chat", message: "two" },
    ]);
  });

  it("fills action defaults when node data is missing", () => {
    const types = ["chat", "command", "look", "goto", "wait", "stop"];
    const nodes: ScriptGraph["nodes"] = [
      { id: "e", kind: "event", type: "spawn" },
      ...types.map((t) => ({ id: `a-${t}`, kind: "action" as const, type: t as never })),
    ];
    const edges: ScriptGraph["edges"] = [];
    let prev = "e";
    for (const n of nodes.slice(1)) {
      edges.push({ id: `${prev}-${n.id}`, source: prev, target: n.id });
      prev = n.id;
    }
    const r = graphToBlueprint({ nodes, edges });
    expect(r.ok).toBe(true);
    expect(r.blueprint?.rules[0]?.actions).toEqual([
      { type: "chat", message: "" },
      { type: "command", command: "" },
      { type: "look", yaw: 0, pitch: 0 },
      { type: "goto", x: 0, y: 0, z: 0 },
      { type: "wait", ms: 0 },
      { type: "stop" },
    ]);
  });

  it("stops a chain at a non-action node", () => {
    const g: ScriptGraph = {
      nodes: [
        { id: "e", kind: "event", type: "spawn" },
        { id: "a", kind: "action", type: "chat", data: { message: "x" } },
        { id: "e2", kind: "event", type: "death" },
      ],
      edges: [
        { id: "1", source: "e", target: "a" },
        { id: "2", source: "a", target: "e2" },
      ],
    };
    const r = graphToBlueprint(g);
    expect(r.blueprint?.rules.find((x) => x.on === "spawn")?.actions).toEqual([
      { type: "chat", message: "x" },
    ]);
  });

  it("reports validation errors for a malformed action", () => {
    const g: ScriptGraph = {
      nodes: [
        { id: "e", kind: "event", type: "spawn" },
        { id: "a", kind: "action", type: "wait", data: { ms: 10_000_000 } }, // exceeds max
      ],
      edges: [{ id: "1", source: "e", target: "a" }],
    };
    const r = graphToBlueprint(g);
    expect(r.ok).toBe(false);
    expect(r.errors?.length).toBeGreaterThan(0);
  });
});
