import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  // Vercel terminates TLS and proxies internally — req.url may report localhost.
  // X-Forwarded-Proto/Host carry the actual public origin.
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? url.host
  const origin = `${proto}://${host}`

  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${origin}/login`)
}
