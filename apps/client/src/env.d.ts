/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_AI_SERVICE_URL?: string;
  readonly VITE_DEBUGGING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
