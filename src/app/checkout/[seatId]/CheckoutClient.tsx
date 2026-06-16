'use client'

import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface CheckoutClientProps {
  seatId: string
}

export default function CheckoutClient({ seatId }: CheckoutClientProps) {
  const [clientSecret, setClientSecret] = useState<string>()
  const [seatLabel, setSeatLabel] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    fetch('/api/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else {
          setClientSecret(data.clientSecret)
          setSeatLabel(data.seatLabel)
        }
      })
      .catch(() => setError('Lỗi kết nối. Vui lòng thử lại.'))
  }, [seatId])

  if (error) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <a
            href="/seats"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Quay lại chọn ghế
          </a>
        </div>
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="animate-spin text-3xl mb-4">⏳</div>
          <p className="text-gray-400 text-sm">Đang chuẩn bị thanh toán...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-10">
      <div className="mb-6">
        <a href="/seats" className="text-sm text-gray-400 hover:text-gray-600">
          ← Quay lại
        </a>
        <h1 className="text-2xl font-semibold mt-3 mb-1">Thanh toán</h1>
        <p className="text-gray-400 text-sm">
          Ghế <span className="font-semibold text-gray-700">{seatLabel}</span> — được giữ 10 phút
        </p>
      </div>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: { theme: 'stripe', variables: { borderRadius: '12px' } },
        }}
      >
        <PaymentForm />
      </Elements>
    </div>
  )
}

function PaymentForm() {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setErrorMsg(undefined)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${location.origin}/success`,
      },
    })

    // Chỉ đến đây nếu có lỗi — thành công thì Stripe redirect luôn
    if (error) {
      setErrorMsg(error.message ?? 'Thanh toán thất bại. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
      <PaymentElement />

      {errorMsg && (
        <p className="text-red-500 text-sm">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {loading ? 'Đang xử lý...' : 'Xác nhận thanh toán — $100.00'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Thẻ test: 4242 4242 4242 4242 · Bất kỳ ngày hết hạn & CVC
      </p>
    </form>
  )
}
