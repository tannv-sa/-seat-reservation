import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

// Raw body bắt buộc để verify Stripe signature
export const runtime = 'nodejs'

async function releaseSeatHold(paymentIntentId: string, service: ReturnType<typeof createServiceClient>) {
  const { data: reservation } = await service
    .from('reservations')
    .select('seat_id')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (!reservation) return

  await Promise.all([
    service
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('payment_intent_id', paymentIntentId),
    service
      .from('seats')
      .update({ status: 'available', held_by: null, held_until: null })
      .eq('id', reservation.seat_id),
  ])
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  // Bước 1: Verify Stripe signature — từ chối request không đến từ Stripe
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createServiceClient()

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent

    // Bước 2: Idempotency check — Stripe có thể gửi cùng event nhiều lần
    const { data: reservation } = await service
      .from('reservations')
      .select('id, seat_id, status')
      .eq('payment_intent_id', intent.id)
      .maybeSingle()

    if (!reservation) {
      // Không tìm thấy — có thể payment_intent không phải của hệ thống
      return NextResponse.json({ received: true })
    }

    if (reservation.status === 'confirmed') {
      // Đã xử lý trước đó — trả 200 để Stripe không retry
      return NextResponse.json({ received: true })
    }

    // Bước 3: Cập nhật reservation + seat trong cùng một batch
    const [resResult, seatResult] = await Promise.all([
      service
        .from('reservations')
        .update({ status: 'confirmed' })
        .eq('payment_intent_id', intent.id)
        .eq('status', 'pending'), // double-check: tránh confirm reservation đã cancelled
      service
        .from('seats')
        .update({ status: 'reserved', held_by: null, held_until: null })
        .eq('id', reservation.seat_id),
    ])

    if (resResult.error || seatResult.error) {
      // Trả 500 để Stripe retry
      return NextResponse.json(
        { error: 'DB update failed' },
        { status: 500 }
      )
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent
    await releaseSeatHold(intent.id, service)
  }

  if (event.type === 'payment_intent.canceled') {
    const intent = event.data.object as Stripe.PaymentIntent
    await releaseSeatHold(intent.id, service)
  }

  return NextResponse.json({ received: true })
}
