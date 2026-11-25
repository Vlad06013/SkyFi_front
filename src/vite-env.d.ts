/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_API_URL_LOCAL?: string;
  readonly VITE_REVERB_APP_KEY: string;
  readonly VITE_REVERB_HOST?: string;
  readonly VITE_REVERB_HOST_LOCAL?: string;
  readonly VITE_REVERB_PORT?: string;
  readonly VITE_REVERB_PORT_LOCAL?: string;
  readonly VITE_REVERB_SCHEME?: string;
  readonly VITE_REVERB_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
