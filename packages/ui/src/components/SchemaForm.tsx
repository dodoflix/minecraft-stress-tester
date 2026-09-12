import type { FormField } from "../api.ts";
import { getPath } from "../lib/utils.ts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";
import { Switch } from "./ui/switch.tsx";

interface Props {
  fields: FormField[];
  value: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const current = value ?? field.default;
  if (field.kind === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <Label htmlFor={field.path}>{field.label}</Label>
        <Switch id={field.path} checked={Boolean(current)} onCheckedChange={onChange} />
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.kind === "enum" ? (
        <Select value={String(current ?? "")} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.kind === "string[]" ? (
        <Input
          value={Array.isArray(current) ? current.join(", ") : ""}
          placeholder="comma-separated"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      ) : field.kind === "string" ? (
        <Input value={current == null ? "" : String(current)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          type="number"
          min={field.min}
          max={field.max}
          value={current == null ? "" : Number(current)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )}
    </div>
  );
}

export function SchemaForm({ fields, value, onChange }: Props) {
  const groups = [...new Set(fields.map((f) => f.group))];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="capitalize">{group}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fields
              .filter((f) => f.group === group)
              .map((f) => (
                <Field
                  key={f.path}
                  field={f}
                  value={getPath(value, f.path)}
                  onChange={(v) => onChange(f.path, v)}
                />
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
