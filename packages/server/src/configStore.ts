import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { type Config, configSchema } from "minecraft-stress-tester";

export interface ValidationResult {
  valid: boolean;
  /** Present when valid: the parsed, defaulted config. */
  config?: Config;
  /** Present when invalid: one message per failing field. */
  errors?: string[];
}

/** Parse + validate raw config text without touching disk. Pure; unit-tested. */
export function validateConfig(text: string, ext = ".yaml"): ValidationResult {
  let raw: unknown;
  try {
    raw = ext === ".json" ? JSON.parse(text) : text.trim() === "" ? {} : loadYaml(text);
  } catch (err) {
    return { valid: false, errors: [`parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const result = configSchema.safeParse(raw ?? {});
  if (result.success) return { valid: true, config: result.data };
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

// Config file names are user-supplied via the API; keep them to a single safe segment
// so a name can never escape the configs directory.
const SAFE_NAME = /^[\w.-]+\.(ya?ml|json)$/;

export function isSafeConfigName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes("..");
}

export class ConfigStore {
  constructor(private readonly dir: string) {}

  list(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter(isSafeConfigName).sort();
  }

  read(name: string): string | undefined {
    if (!isSafeConfigName(name)) return undefined;
    const path = join(this.dir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  }

  /** Validate then persist. Returns the validation result; only writes when valid. */
  write(name: string, text: string): ValidationResult {
    if (!isSafeConfigName(name)) return { valid: false, errors: ["invalid config name"] };
    const result = validateConfig(text, extname(name).toLowerCase());
    if (!result.valid) return result;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, name), text, "utf8");
    return result;
  }

  delete(name: string): boolean {
    if (!isSafeConfigName(name)) return false;
    const path = join(this.dir, name);
    if (!existsSync(path)) return false;
    rmSync(path);
    return true;
  }
}
