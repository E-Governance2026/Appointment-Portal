import { getSupabase } from '../lib/supabase.js'

// Quick read-back of the appointments so we can confirm the 3-step-flow seed.
async function main() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, authority_name, date, time, status, subject')
    .order('id')
  if (error) throw new Error(error.message)

  const lines = (data ?? []).map(r =>
    `${r.id}  ${String(r.authority_name).padEnd(16)} ${String(r.status).padEnd(16)} ${r.date ?? '(no date)'} ${r.time ?? ''}  ${r.subject}`)
  console.log(lines.join('\n'))
  console.log(`\n${data?.length ?? 0} appointments.`)

  // Also confirm the authority rename landed.
  const { data: auths } = await supabase.from('authorities').select('id, name').in('id', ['auth-ss', 'auth-ap'])
  console.log('\nRenamed authorities:', auths?.map(a => `${a.id}=${a.name}`).join(', '))
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
