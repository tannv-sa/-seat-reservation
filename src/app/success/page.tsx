import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SuccessPoller from './SuccessPoller'
import type { ReservationWithSeat } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string }>
}) {
  const { payment_intent } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!payment_intent) redirect('/seats')

  const { data: reservation } = await supabase
    .from('reservations')
    .select('id, status, seat_id, seats(label)')
    .eq('payment_intent_id', payment_intent)
    .eq('user_id', user.id)
    .maybeSingle() as { data: ReservationWithSeat | null }

  if (reservation?.status === 'confirmed') {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-semibold mb-2">Booking confirmed!</h1>
          <p className="text-gray-500 mb-1">
            Seat{' '}
            <span className="font-semibold text-gray-800">
              {reservation.seats?.label}
            </span>{' '}
            has been reserved for you.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            A confirmation has been sent to your email.
          </p>
          <a
            href="/seats"
            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            View all seats
          </a>
        </div>
      </div>
    )
  }

  return <SuccessPoller paymentIntentId={payment_intent} />
}
