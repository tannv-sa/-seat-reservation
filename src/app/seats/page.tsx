import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SeatCard from '@/components/SeatCard'
import SeatsRefresh from '@/components/SeatsRefresh'
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

  // Normalize expired holds → available so the UI is consistent with what
  // the backend will allow. The DB is updated lazily (cron or inline reclaim)
  // but visually we should never show a hold whose held_until has passed.
  const now = new Date()
  const normalizedSeats = (seats as Seat[]).map(seat =>
    seat.status === 'held' && seat.held_until && new Date(seat.held_until) < now
      ? { ...seat, status: 'available' as const }
      : seat
  )

  // Group by row letter (A, B, C …)
  const rowMap = new Map<string, Seat[]>()
  for (const seat of normalizedSeats) {
    const row = seat.label[0]
    if (!rowMap.has(row)) rowMap.set(row, [])
    rowMap.get(row)!.push(seat)
  }
  const rows = Array.from(rowMap.entries()).map(([row, rowSeats]) => ({ row, seats: rowSeats }))

  const available = normalizedSeats.filter(s => s.status === 'available').length
  const held      = normalizedSeats.filter(s => s.status === 'held').length
  const reserved  = normalizedSeats.filter(s => s.status === 'reserved').length

  return (
    <div className="max-w-2xl mx-auto">
      {/* Auto-refresh every 60 s to catch newly-expired holds */}
      <SeatsRefresh />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Select a seat</h1>
        <p className="text-gray-400 text-sm">
          Signed in as <span className="font-medium text-gray-600">{user.email}</span>
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mb-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> Available ({available})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> On hold ({held})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Reserved ({reserved})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Yours</span>
      </div>

      {/* Stage */}
      <div className="mb-8 text-center">
        <div className="inline-block bg-gray-200 text-gray-500 text-xs font-medium tracking-widest uppercase px-12 py-2 rounded-t-full">
          Stage
        </div>
      </div>

      {/* Seating rows */}
      <div className="space-y-3">
        {rows.map(({ row, seats: rowSeats }) => (
          <div key={row} className="flex items-center gap-3">
            <span className="w-5 text-sm font-bold text-gray-400 shrink-0 text-center">{row}</span>

            <div className="flex gap-2 flex-1">
              {rowSeats.map((seat, idx) => (
                <div key={seat.id} className={idx === Math.floor(rowSeats.length / 2) ? 'ml-4' : ''}>
                  <SeatCard
                    seat={seat}
                    isMyReservation={myReservation?.seat_id === seat.id}
                  />
                </div>
              ))}
            </div>

            <span className="w-5 text-sm font-bold text-gray-400 shrink-0 text-center">{row}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Seats are held for 10 minutes after selection. Complete payment to confirm.
      </p>
    </div>
  )
}
