'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Seat } from '@/types/database'

interface SeatCardProps {
  seat: Seat
  isMyReservation: boolean
}

const statusConfig = {
  available: {
    label: 'Available',
    dot: 'bg-green-400',
    card: 'border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer',
    badge: 'bg-green-50 text-green-700',
  },
  held: {
    label: 'On hold',
    dot: 'bg-yellow-400',
    card: 'border-gray-200 opacity-60 cursor-not-allowed',
    badge: 'bg-yellow-50 text-yellow-700',
  },
  reserved: {
    label: 'Reserved',
    dot: 'bg-red-400',
    card: 'border-gray-200 opacity-60 cursor-not-allowed',
    badge: 'bg-red-50 text-red-700',
  },
} as const

export default function SeatCard({ seat, isMyReservation }: SeatCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const config = statusConfig[seat.status]

  function handleClick() {
    if (seat.status !== 'available') return
    setLoading(true)
    router.push(`/checkout/${seat.id}`)
  }

  if (isMyReservation) {
    return (
      <div className="relative bg-white rounded-2xl border-2 border-blue-500 shadow-md p-6 text-center">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
          Your seat
        </div>
        <div className="text-4xl font-bold text-blue-600 mb-2">{seat.label}</div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Reserved
        </span>
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={seat.status !== 'available' || loading}
      className={`bg-white rounded-2xl border-2 p-6 text-center transition-all duration-150 w-full ${config.card}`}
    >
      <div className="text-4xl font-bold text-gray-800 mb-2">{seat.label}</div>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${config.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${config.dot}`} />
        {loading ? 'Loading...' : config.label}
      </span>
    </button>
  )
}
