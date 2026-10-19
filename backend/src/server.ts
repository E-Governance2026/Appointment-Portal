import { createApp } from './app.js'
import { env } from './config/env.js'

// ─── Server entry ─────────────────────────────────────────────────────────────
const app = createApp()

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Appointment Portal API listening on http://localhost:${env.port}`)
})
