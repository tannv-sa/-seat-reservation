'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Re-fetches server component data every 60 s so expired holds become
// visible as available without requiring a manual page refresh.
export default function SeatsRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
