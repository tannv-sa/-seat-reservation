import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { origin } = new URL(req.url)
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${origin}/login`)
}
