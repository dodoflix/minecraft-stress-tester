import { useCallback, useEffect, useState } from "react";
import { getHistoryHtml, type HistoryEntry, listHistory } from "../api.ts";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listHistory()
      .then(setEntries)
      .catch((e) => setError(String(e.message)));
  }, []);

  useEffect(refresh, [refresh]);

  async function open(file: string) {
    setError(null);
    setSelected(file);
    try {
      setHtml(await getHistoryHtml(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Past runs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" size="sm" className="self-start" onClick={refresh}>
            Refresh
          </Button>
          {entries.length === 0 && <p className="text-sm text-muted-foreground">No reports yet.</p>}
          {entries.map((e) => (
            <button
              type="button"
              key={e.file}
              onClick={() => open(e.file)}
              className={`rounded-md border p-2 text-left text-sm ${selected === e.file ? "ring-2 ring-ring" : ""}`}
            >
              <div className="font-mono">
                {e.target.host}:{e.target.port}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.finishedAt).toLocaleString()}
                {e.spawned != null && ` - ${e.spawned} bots`}
                {e.tps != null && ` - ${e.tps.toFixed?.(1) ?? e.tps} TPS`}
              </div>
            </button>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
        </CardHeader>
        <CardContent>
          {html ? (
            // The report HTML is produced by the shared server-side renderer; sandbox it.
            <iframe
              title="report"
              sandbox=""
              srcDoc={html}
              className="h-[640px] w-full rounded-md border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a run to view its report.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
