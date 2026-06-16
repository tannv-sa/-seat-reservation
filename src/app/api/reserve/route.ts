import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  // Xác thực user
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

  // Kiểm tra user đã có ghế confirmed chưa
  const { data: existing } = await service
    .from('reservations')
    .select('id, seat_id')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Bạn đã có ghế đặt thành công' },
      { status: 409 }
    )
  }

  // Atomic hold: chỉ thành công nếu ghế đang available
  const holdUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { data: seat, error: seatError } = await service
    .from('seats')
    .update({ status: 'held', held_by: user.id, held_until: holdUntil })
    .eq('id', seatId)
    .eq('status', 'available') // ← điều kiện atomic, ngăn race condition
    .select()
    .maybeSingle()

  if (seatError || !seat) {
    return NextResponse.json(
      { error: 'Ghế này vừa được người khác chọn. Vui lòng chọn ghế khác.' },
      { status: 409 }
    )
  }

  // Tạo Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 10000, // 10,000 đơn vị nhỏ nhất của currency
    currency: 'usd', // Stripe test mode dùng usd cho đơn giản
    metadata: { seatId, userId: user.id, seatLabel: seat.label },
    automatic_payment_methods: { enabled: true },
  })

  // Lưu reservation ở trạng thái pending
  const { error: resError } = await service.from('reservations').insert({
    seat_id: seatId,
    user_id: user.id,
    payment_intent_id: paymentIntent.id,
    status: 'pending',
  })

  if (resError) {
    // Rollback: giải phóng ghế nếu không lưu được reservation
    await service
      .from('seats')
      .update({ status: 'available', held_by: null, held_until: null })
      .eq('id', seatId)

    return NextResponse.json(
      { error: 'Lỗi tạo đơn đặt chỗ. Vui lòng thử lại.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    seatLabel: seat.label,
  })
}
