import { getSupabase } from '../lib/supabase.js'

async function main() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department')
    .order('id')
  
  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Users in Supabase table:', data)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
