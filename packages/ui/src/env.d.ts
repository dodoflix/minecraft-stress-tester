/// <reference types="vite/client" />
import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}
