'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Seat } from '@/types/database'

interface SeatCardProps {
  seat: Seat
  isMyReservation: boolean
}

export default function SeatCard({ seat, isMyReservation }: SeatCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Number part of the label (e.g. "A3" → "3")
  const num = seat.label.replace(/^[A-Z]+/, '')

  function handleClick() {
    if (seat.status !== 'available') return
    setLoading(true)
    router.push(`/checkout/${seat.id}`)
  }

  if (isMyReservation) {
    return (
      <div
        title={`${seat.label} — Your seat`}
        className="w-10 h-10 rounded-t-lg border-2 border-blue-500 bg-blue-500 flex items-center justify-center"
      >
        <span className="text-xs font-bold text-white">{num}</span>
      </div>
    )
  }

  const styles = {
    available: 'border-green-400 bg-green-50 hover:bg-green-400 hover:border-green-500 hover:text-white cursor-pointer text-green-700',
    held:      'border-yellow-300 bg-yellow-50 cursor-not-allowed text-yellow-400 opacity-70',
    reserved:  'border-red-300 bg-red-50 cursor-not-allowed text-red-400 opacity-70',
  } as const

  return (
    <button
      onClick={handleClick}
      disabled={seat.status !== 'available' || loading}
      title={`${seat.label} — ${seat.status}`}
      className={`w-10 h-10 rounded-t-lg border-2 flex items-center justify-center transition-all duration-100 ${styles[seat.status]}`}
    >
      <span className="text-xs font-bold">{loading ? '…' : num}</span>
    </button>
  )
}
