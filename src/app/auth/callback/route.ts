import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host  = request.headers.get('x-forwarded-host')  ?? url.host
  const origin = `${proto}://${host}`

  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/seats'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  // Build the redirect response first so we can attach session cookies to it
  // directly. Using cookieStore.set() writes to Next.js's internal store but
  // NextResponse.redirect() is a brand-new response object that doesn't inherit
  // those cookies — leading to the middleware seeing no session on the next request.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read the PKCE code_verifier from the incoming request cookies
        getAll: () => request.cookies.getAll(),
        // Write session cookies directly onto the redirect response
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  return response
}
