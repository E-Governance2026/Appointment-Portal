import { getSupabase } from '../lib/supabase.js'

async function main() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, requester, requester_id, status, date, time, subject, authority_name')
    .order('id')

  if (error) {
    console.error(error)
    process.exit(1)
  }

  console.log(JSON.stringify(data, null, 2))
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
