import { type Action, type Blueprint, blueprintSchema, TRIGGERS, type Trigger } from "./blueprint.js";

/**
 * A visual node graph is just another surface over the one blueprint model: an event node starts a
 * rule, and the linear chain of action nodes wired after it becomes that rule's action sequence.
 * These converters are a code generator over blueprints, not a second engine, and they round-trip.
 * Pure and unit-tested.
 */

export type NodeKind = "event" | "action";
export type ActionType = Action["type"];

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** A Trigger for event nodes, an action type for action nodes. */
  type: Trigger | ActionType;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface ScriptGraph {
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphResult {
  ok: boolean;
  blueprint?: Blueprint;
  errors?: string[];
}

const isTrigger = (t: string): t is Trigger => (TRIGGERS as readonly string[]).includes(t);

function toAction(node: GraphNode): Action {
  const d = node.data ?? {};
  switch (node.type) {
    case "chat":
      return { type: "chat", message: String(d.message ?? "") };
    case "command":
      return { type: "command", command: String(d.command ?? "") };
    case "look":
      return { type: "look", yaw: Number(d.yaw ?? 0), pitch: Number(d.pitch ?? 0) };
    case "goto":
      return { type: "goto", x: Number(d.x ?? 0), y: Number(d.y ?? 0), z: Number(d.z ?? 0) };
    case "wait":
      return { type: "wait", ms: Number(d.ms ?? 0) };
    default:
      return { type: "stop" };
  }
}

/** Compile a node graph to a blueprint: each event node plus its linear action chain is one rule. */
export function graphToBlueprint(graph: ScriptGraph): GraphResult {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // First outgoing edge per node defines the chain (blueprint rules are linear).
  const nextOf = new Map<string, string>();
  for (const e of graph.edges) if (!nextOf.has(e.source)) nextOf.set(e.source, e.target);

  const rules: Blueprint["rules"] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "event" || !isTrigger(node.type)) continue;
    const actions: Action[] = [];
    const seen = new Set<string>([node.id]);
    let cursor = nextOf.get(node.id);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const step = byId.get(cursor);
      if (step?.kind !== "action") break;
      actions.push(toAction(step));
      cursor = nextOf.get(cursor);
    }
    if (actions.length > 0) rules.push({ on: node.type, actions });
  }

  const parsed = blueprintSchema.safeParse({ name: graph.name ?? "untitled", rules });
  if (parsed.success) return { ok: true, blueprint: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

const X_STEP = 220;
const Y_STEP = 140;

/** Lay a blueprint out as a graph: one row per rule, event node then its action chain left to right. */
export function blueprintToGraph(blueprint: Blueprint): ScriptGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  blueprint.rules.forEach((rule, i) => {
    const eventId = `event-${i}`;
    nodes.push({ id: eventId, kind: "event", type: rule.on, position: { x: 0, y: i * Y_STEP } });
    let prev = eventId;
    rule.actions.forEach((action, j) => {
      const id = `action-${i}-${j}`;
      const { type, ...data } = action;
      nodes.push({ id, kind: "action", type, data, position: { x: (j + 1) * X_STEP, y: i * Y_STEP } });
      edges.push({ id: `${prev}->${id}`, source: prev, target: id });
      prev = id;
    });
  });
  return { name: blueprint.name, nodes, edges };
}
