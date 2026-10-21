/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default) or 'supabase' — which data source the service layer uses. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase'
  /** Base URL of the backend API, e.g. http://localhost:4000. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
