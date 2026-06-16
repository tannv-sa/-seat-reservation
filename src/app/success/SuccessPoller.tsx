'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuccessPoller({ paymentIntentId }: { paymentIntentId: string }) {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)
  const MAX_ATTEMPTS = 10

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reservation-status?payment_intent=${paymentIntentId}`)
        const data = await res.json()

        if (data.status === 'confirmed') {
          router.refresh()
        } else {
          setAttempts(a => a + 1)
        }
      } catch {
        setAttempts(a => a + 1)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [attempts, paymentIntentId, router])

  if (attempts >= MAX_ATTEMPTS) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-yellow-100 p-8">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-lg font-semibold mb-2">Confirming your payment</h2>
          <p className="text-gray-400 text-sm mb-6">
            This is taking longer than expected. Check your email or try refreshing.
          </p>
          <a href="/seats" className="text-sm text-blue-600 hover:underline">
            Back to seats
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="text-4xl mb-4 animate-spin">⚙️</div>
        <h2 className="text-lg font-semibold mb-2">Confirming payment...</h2>
        <p className="text-gray-400 text-sm">
          Please keep this page open.
        </p>
      </div>
    </div>
  )
}
