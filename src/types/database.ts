export type SeatStatus = 'available' | 'held' | 'reserved'
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'

export interface Seat {
  id: string
  label: string
  status: SeatStatus
  held_by: string | null
  held_until: string | null
}

export interface Reservation {
  id: string
  seat_id: string
  user_id: string
  payment_intent_id: string | null
  status: ReservationStatus
  created_at: string
}

export interface ReservationWithSeat extends Reservation {
  seats: Pick<Seat, 'label'> | null
}
