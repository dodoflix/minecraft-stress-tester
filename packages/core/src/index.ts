// Public library surface. The `mcst` CLI ships in the same package (bin), but importing
// `minecraft-stress-tester` gives the headless engine, config, Bot API, script model,
// scanner, and report renderers. The control-plane server (@mcst/server) is a client of this.

export {
  BotApi,
  type BotApiEventMap,
  type DebugBot,
  type EntityInfo,
  type ItemInfo,
  type Pos,
  type Vitals,
} from "./bot/botApi.js";
export { dispatch, HELP, type ReplResult } from "./bot/repl.js";
export {
  configFormFields,
  configJsonSchema,
  type FieldKind,
  type FormField,
} from "./config/formSchema.js";
export { type BuildResult, buildRunConfig, type CliOverrides, loadConfig } from "./config/load.js";
export {
  accountsSchema,
  behaviorsSchema,
  type Config,
  configSchema,
  proxiesSchema,
  rampSchema,
  reconnectSchema,
  SCENARIOS,
  type Target,
  targetSchema,
} from "./config/schema.js";
export {
  type Behavior,
  type BotDriver,
  type BotEvent,
  type BotEventMap,
  type BotSpec,
  type ControlState,
  TypedEmitter,
} from "./drivers/driver.js";
export { Engine, type EngineOptions } from "./engine/engine.js";
export { runSharded } from "./engine/sharded.js";
export { MetricsCollector, type MetricsSnapshot } from "./metrics/collector.js";
export {
  DEFAULT_PROVIDERS,
  dedupeProxies,
  fetchFreeProxies,
  type ProxyCheck,
  type ProxyProvider,
  parseProxyList,
  pickValidated,
  type ResolveOptions,
  resolveAutoProxies,
  shuffle,
} from "./net/autoProxies.js";
export {
  isLocalHost,
  type ParsedProxy,
  ProxyPool,
  type ProxyScheme,
  parseProxy,
} from "./net/proxy.js";
export { type PreflightResult, parsePing, preflight } from "./net/slp.js";
export {
  type RunReport,
  toCsv,
  toHtml,
  writeCsvReport,
  writeHtmlReport,
  writeJsonReport,
} from "./report/export.js";
export { formatSummary, writeReports } from "./report/summary.js";
export { AuthorizationError, assertAuthorized } from "./safety/authorization.js";
export { type ScanDeps, type ScanOptions, scan } from "./scan/scanner.js";
export { assembleFindings, buildScanReport, formatScanReport, type ScanReport } from "./scan/scanReport.js";
export type { ScanFinding } from "./scan/types.js";
export {
  type Action,
  actionSchema,
  type Blueprint,
  blueprintSchema,
  type ParseResult,
  parseBlueprint,
  type Rule,
  ruleSchema,
  serializeBlueprint,
  TRIGGERS,
  type Trigger,
} from "./script/blueprint.js";
export { compileToCode } from "./script/compile.js";
export { runActions, runBlueprint, type ScriptableBot, type Sleep } from "./script/run.js";
export {
  checkUserScript,
  runUserScript,
  type SandboxOptions,
  type ScriptHostBot,
} from "./script/sandbox/host.js";
export {
  dispatchScriptCall,
  isScriptBotMethod,
  SCRIPT_BOT_EVENTS,
  SCRIPT_BOT_METHODS,
  type ScriptBotEvent,
  type ScriptBotMethod,
} from "./script/sandbox/protocol.js";
export type { ServeHandle, ServeOptions, StartServer } from "./serverContract.js";
