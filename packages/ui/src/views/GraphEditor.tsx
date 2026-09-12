import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useRef, useState } from "react";
import { compileGraph, importBlueprintToGraph } from "../api.ts";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";

type NodeData = Record<string, unknown> & { kind: "event" | "action"; ntype: string; label: string };
type FlowNode = Node<NodeData>;

const EVENTS = ["spawn", "chat", "death"];
const ACTIONS = ["chat", "command", "look", "goto", "wait", "stop"];
const FIELDS: Record<string, string[]> = {
  chat: ["message"],
  command: ["command"],
  look: ["yaw", "pitch"],
  goto: ["x", "y", "z"],
  wait: ["ms"],
  stop: [],
};
const NUMERIC = new Set(["yaw", "pitch", "x", "y", "z", "ms"]);

function labelFor(d: NodeData): string {
  if (d.kind === "event") return `on ${d.ntype}`;
  const parts = (FIELDS[d.ntype] ?? []).map((f) => `${f}=${d[f] ?? ""}`);
  return parts.length ? `${d.ntype} ${parts.join(" ")}` : d.ntype;
}

function newNode(kind: "event" | "action", ntype: string, i: number): FlowNode {
  const data: NodeData = { kind, ntype, label: "" };
  for (const f of FIELDS[ntype] ?? []) data[f] = NUMERIC.has(f) ? 0 : "";
  data.label = labelFor(data);
  return {
    id: `${kind}-${Date.now()}-${i}`,
    position: { x: kind === "event" ? 40 : 260, y: 40 + i * 90 },
    data,
    style: {
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: 8,
      background: kind === "event" ? "var(--color-primary)" : "var(--color-card)",
      color: kind === "event" ? "var(--color-primary-foreground)" : "var(--color-card-foreground)",
      fontSize: 12,
    },
  };
}

let counter = 0;

export function GraphEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("untitled");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [importText, setImportText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);
  const add = (kind: "event" | "action", ntype: string) =>
    setNodes((ns) => [...ns, newNode(kind, ntype, counter++)]);

  const selectedNode = nodes.find((n) => n.id === selected);

  function updateField(field: string, value: string) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selected) return n;
        const data = { ...n.data, [field]: NUMERIC.has(field) ? Number(value) : value };
        data.label = labelFor(data);
        return { ...n, data };
      }),
    );
  }

  function toScriptGraph() {
    return {
      name,
      nodes: nodes.map((n) => {
        const data: Record<string, unknown> = {};
        for (const f of FIELDS[n.data.ntype] ?? []) data[f] = n.data[f];
        return { id: n.id, kind: n.data.kind, type: n.data.ntype, data, position: n.position };
      }),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
  }

  function loadGraph(graph: {
    name?: string;
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) {
    if (graph.name) setName(graph.name);
    counter += graph.nodes.length;
    setNodes(
      graph.nodes.map((n, i) => {
        const kind = n.kind as "event" | "action";
        const ntype = n.type as string;
        const src = (n.data ?? {}) as Record<string, unknown>;
        const data: NodeData = { kind, ntype, label: "" };
        for (const f of FIELDS[ntype] ?? []) data[f] = src[f] ?? (NUMERIC.has(f) ? 0 : "");
        data.label = labelFor(data);
        const pos = (n.position as { x: number; y: number }) ?? { x: 0, y: i * 90 };
        return { ...newNode(kind, ntype, i), id: n.id as string, position: pos, data };
      }),
    );
    setEdges(
      graph.edges.map((e) => ({
        id: e.id as string,
        source: e.source as string,
        target: e.target as string,
      })),
    );
  }

  async function onCompile() {
    setErrors([]);
    setCode("");
    const r = await compileGraph(toScriptGraph());
    if (r.ok && r.code) setCode(r.code);
    else setErrors(r.errors ?? ["compile failed"]);
  }

  async function onImportBlueprint() {
    setErrors([]);
    try {
      const bp = JSON.parse(importText);
      const r = await importBlueprintToGraph(bp);
      if (r.ok && r.graph) loadGraph(r.graph as never);
      else setErrors(r.errors ?? ["import failed"]);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    }
  }

  function onExportGraph() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(toScriptGraph(), null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.graph.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportGraphFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      try {
        loadGraph(JSON.parse(t));
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
      }
    });
    e.target.value = "";
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-[160px]" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="text-xs text-muted-foreground">events:</span>
          {EVENTS.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => add("event", t)}>
              {t}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">actions:</span>
          {ACTIONS.map((t) => (
            <Button key={t} size="sm" variant="secondary" onClick={() => add("action", t)}>
              {t}
            </Button>
          ))}
        </div>
        <div className="h-[520px] w-full rounded-md border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onCompile}>
            Compile + eject
          </Button>
          <Button size="sm" variant="outline" onClick={onExportGraph}>
            Export graph
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            Import graph
          </Button>
          <input ref={fileInput} type="file" accept=".json" hidden onChange={onImportGraphFile} />
        </div>
        {errors.length > 0 && (
          <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {code && (
          <pre className="max-h-[300px] overflow-auto rounded-md border bg-muted p-2 text-xs">{code}</pre>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{selectedNode ? `Edit: ${selectedNode.data.ntype}` : "Select a node"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {selectedNode ? (
              (FIELDS[selectedNode.data.ntype] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No fields.</p>
              ) : (
                (FIELDS[selectedNode.data.ntype] ?? []).map((f) => (
                  <div key={f} className="grid gap-1.5">
                    <Label htmlFor={`f-${f}`}>{f}</Label>
                    <Input
                      id={`f-${f}`}
                      type={NUMERIC.has(f) ? "number" : "text"}
                      value={String(selectedNode.data[f] ?? "")}
                      onChange={(e) => updateField(f, e.target.value)}
                    />
                  </div>
                ))
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Click a node to edit it. Drag from a node's handle to wire the next step.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import a blueprint</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <textarea
              className="h-32 w-full rounded-md border bg-background p-2 font-mono text-xs"
              placeholder='{"name":"x","rules":[...]}'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={onImportBlueprint}>
              Blueprint to graph
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
