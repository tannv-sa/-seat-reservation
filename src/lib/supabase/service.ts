import { createClient } from '@supabase/supabase-js'

// Service role client — bypass RLS, chỉ dùng phía server (API routes, webhook)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
