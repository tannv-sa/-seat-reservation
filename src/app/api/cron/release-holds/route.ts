import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  // Bảo vệ bằng secret header — Vercel Cron tự gửi header này
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data, error } = await service
    .from('seats')
    .update({ status: 'available', held_by: null, held_until: null })
    .eq('status', 'held')
    .lt('held_until', new Date().toISOString())
    .select('id, label')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Huỷ các reservation pending tương ứng
  if (data && data.length > 0) {
    const seatIds = data.map((s: { id: string }) => s.id)
    await service
      .from('reservations')
      .update({ status: 'cancelled' })
      .in('seat_id', seatIds)
      .eq('status', 'pending')
  }

  return NextResponse.json({
    released: data?.length ?? 0,
    seats: data?.map((s: { label: string }) => s.label) ?? [],
    timestamp: new Date().toISOString(),
  })
}
