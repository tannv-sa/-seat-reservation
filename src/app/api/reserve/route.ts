import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { seatId } = body
  if (!seatId) {
    return NextResponse.json({ error: 'seatId is required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Reject if user already has a confirmed reservation
  const { data: existing } = await service
    .from('reservations')
    .select('id, seat_id')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a confirmed reservation' },
      { status: 409 }
    )
  }

  // Idempotency: return existing PaymentIntent if user already holds this seat
  // (handles React StrictMode double-invocation and retries)
  const { data: pendingRes } = await service
    .from('reservations')
    .select('payment_intent_id, seats(label)')
    .eq('user_id', user.id)
    .eq('seat_id', seatId)
    .eq('status', 'pending')
    .maybeSingle()

  if (pendingRes?.payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(pendingRes.payment_intent_id)
    if (intent.status !== 'canceled') {
      return NextResponse.json({
        clientSecret: intent.client_secret,
        seatLabel: (pendingRes.seats as unknown as { label: string })?.label,
      })
    }
  }

  // Atomic hold: only succeeds if seat is currently available.
  // Single UPDATE prevents race conditions — no Redis lock needed.
  const holdUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { data: seat, error: seatError } = await service
    .from('seats')
    .update({ status: 'held', held_by: user.id, held_until: holdUntil })
    .eq('id', seatId)
    .eq('status', 'available')
    .select()
    .maybeSingle()

  if (seatError || !seat) {
    return NextResponse.json(
      { error: 'This seat was just taken. Please choose another.' },
      { status: 409 }
    )
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: 10000,
    currency: 'usd',
    metadata: { seatId, userId: user.id, seatLabel: seat.label },
    automatic_payment_methods: { enabled: true },
  })

  const { error: resError } = await service.from('reservations').insert({
    seat_id: seatId,
    user_id: user.id,
    payment_intent_id: paymentIntent.id,
    status: 'pending',
  })

  if (resError) {
    // Rollback: release the seat hold if reservation insert failed
    await service
      .from('seats')
      .update({ status: 'available', held_by: null, held_until: null })
      .eq('id', seatId)

    return NextResponse.json(
      { error: 'Failed to create reservation. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    seatLabel: seat.label,
  })
}
