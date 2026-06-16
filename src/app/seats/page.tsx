import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SeatCard from '@/components/SeatCard'
import type { Seat } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SeatsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: seats, error } = await supabase
    .from('seats')
    .select('*')
    .order('label')

  if (error) throw new Error('Failed to load seats')

  const { data: myReservation } = await supabase
    .from('reservations')
    .select('seat_id')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Select a seat</h1>
        <p className="text-gray-400 text-sm">
          Signed in as{' '}
          <span className="font-medium text-gray-600">{user.email}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(seats as Seat[]).map(seat => (
          <SeatCard
            key={seat.id}
            seat={seat}
            isMyReservation={myReservation?.seat_id === seat.id}
          />
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Seats are held for 10 minutes after selection. Complete payment to confirm.
      </p>
    </div>
  )
}
