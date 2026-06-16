import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const paymentIntentId = searchParams.get('payment_intent')

  if (!paymentIntentId) {
    return NextResponse.json({ error: 'payment_intent required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('reservations')
    .select('status')
    .eq('payment_intent_id', paymentIntentId)
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ status: data?.status ?? 'not_found' })
}
