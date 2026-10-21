import { createApp } from './app.js'
import { env, validateEnv } from './config/env.js'

// ─── Server entry ─────────────────────────────────────────────────────────────
// Validate configuration first: in production a missing Supabase config is
// fatal; in development it only warns so /health still works.
validateEnv()

const app = createApp()

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Appointment Portal API listening on http://localhost:${env.port}`)
})
