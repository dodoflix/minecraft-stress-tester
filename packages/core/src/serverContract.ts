/**
 * The contract the control-plane server implements and the CLI drives. It lives in core so the
 * `mcst serve`/`gui` commands can load `@mcst/server` dynamically without a build-time cycle:
 * core defines the shape, server conforms to it, the CLI casts the dynamic import to it.
 */
export interface ServeOptions {
  port?: number;
  /** Bind address. Defaults to localhost so the API never listens on a public interface. */
  host?: string;
  /** Fixed API token; a random one is generated (and returned) when omitted. */
  token?: string;
  reportsDir?: string;
  configsDir?: string;
}

export interface ServeHandle {
  url: string;
  token: string;
  close: () => Promise<void>;
}

export type StartServer = (opts?: ServeOptions) => Promise<ServeHandle>;
