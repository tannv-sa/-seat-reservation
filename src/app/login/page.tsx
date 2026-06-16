'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/seats`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold mb-2">Kiểm tra email của bạn</h2>
          <p className="text-gray-500 text-sm">
            Chúng tôi đã gửi link đăng nhập đến{' '}
            <span className="font-medium text-gray-700">{email}</span>.
            Click vào link để tiếp tục.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Dùng email khác
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-20">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-semibold mb-1">Đăng nhập</h1>
        <p className="text-gray-400 text-sm mb-6">
          Nhập email để nhận link đăng nhập
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="ban@example.com"
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          {error && (
            <p className="text-red-500 text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Đang gửi...' : 'Gửi link đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
