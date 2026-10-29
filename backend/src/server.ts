import { createApp } from './app.js'
import { env, validateEnv } from './config/env.js'
import { assertAllRoutesDeclared } from './middleware/permission.js'

// ─── Server entry ─────────────────────────────────────────────────────────────
// Validate configuration first: in production a missing Supabase config is
// fatal; in development it only warns so /health still works.
validateEnv()

const app = createApp()
// Enforce Deny by Default: ensure all registered routes declare permissions or allowlist
assertAllRoutesDeclared(app)

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Appointment Portal API listening on http://localhost:${env.port}`)
})
