// The control-plane server: a client of `minecraft-stress-tester` (core) that exposes the engine
// over REST + SSE and serves the web UI. `mcst serve`/`gui` load this dynamically.

export { ConfigStore, isSafeConfigName, validateConfig } from "./configStore.js";
export { isReportFile, listHistory, readHistory } from "./history.js";
export { type ServeHandle, type ServeOptions, startServer } from "./httpServer.js";
export { type ApiContext, type ApiRequest, handleRequest } from "./router.js";
export { type RunEngine, RunManager } from "./runManager.js";
export {
  hello,
  parseWsMessage,
  WS_PROTOCOL_VERSION,
  type WsClientMessage,
  type WsServerMessage,
} from "./wsProtocol.js";
export { handleWsMessage, type WsDeps } from "./wsRouter.js";
export { attachWsServer } from "./wsServer.js";
