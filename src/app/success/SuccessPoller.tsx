'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Poll DB sau khi Stripe redirect, đợi webhook xử lý xong (thường < 3s)
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
          // Reload trang để Server Component render trạng thái confirmed
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
          <h2 className="text-lg font-semibold mb-2">Đang xác nhận thanh toán</h2>
          <p className="text-gray-400 text-sm mb-6">
            Quá trình xác nhận mất hơn dự kiến. Kiểm tra email của bạn hoặc thử lại sau.
          </p>
          <a href="/seats" className="text-sm text-blue-600 hover:underline">
            Quay lại danh sách ghế
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="text-4xl mb-4 animate-spin">⚙️</div>
        <h2 className="text-lg font-semibold mb-2">Đang xác nhận thanh toán...</h2>
        <p className="text-gray-400 text-sm">
          Vui lòng không đóng trang này.
        </p>
      </div>
    </div>
  )
}
