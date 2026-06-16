import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/webhook/route'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockConstructEvent, mockReservationQuery } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockReservationQuery: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      function makeBuilder(maybySingleFn?: any) {
        const b: any = {
          maybeSingle: maybySingleFn ?? (() => Promise.resolve({ data: null, error: null })),
          then: (res: any, rej: any) =>
            Promise.resolve({ data: null, error: null }).then(res, rej),
        }
        ;['select', 'update', 'eq', 'in', 'lt'].forEach(m => { b[m] = () => b })
        return b
      }
      if (table === 'reservations') return makeBuilder(mockReservationQuery)
      return makeBuilder()
    },
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(body: string, sig?: string) {
  return new Request('http://localhost/api/webhook', {
    method: 'POST',
    headers: sig ? { 'stripe-signature': sig } : {},
    body,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReservationQuery.mockResolvedValue({ data: null, error: null })
  })

  it('400 khi thiếu stripe-signature header', async () => {
    const res = await POST(req('{}'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('signature')
  })

  it('400 khi signature không hợp lệ', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Stripe signature verification failed')
    })
    const res = await POST(req('{}', 'bad-sig'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid signature')
  })

  it('200 khi payment_intent.succeeded — cập nhật reservation thành confirmed', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_abc' } },
    })
    mockReservationQuery.mockResolvedValue({
      data: { id: 'res-1', seat_id: 'seat-1', status: 'pending' },
      error: null,
    })

    const res = await POST(req('body', 'sig'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
  })

  it('idempotency: 200 ngay lập tức khi reservation đã confirmed (Stripe không retry)', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_abc' } },
    })
    mockReservationQuery.mockResolvedValue({
      data: { id: 'res-1', seat_id: 'seat-1', status: 'confirmed' },
      error: null,
    })

    const res = await POST(req('body', 'sig'))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
  })

  it('200 và bỏ qua khi không tìm thấy reservation (payment intent không phải của hệ thống)', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_unknown' } },
    })
    mockReservationQuery.mockResolvedValue({ data: null, error: null })

    const res = await POST(req('body', 'sig'))
    expect(res.status).toBe(200)
  })

  it('200 và giải phóng ghế khi payment_intent.payment_failed', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail' } },
    })
    mockReservationQuery.mockResolvedValue({
      data: { id: 'res-2', seat_id: 'seat-2', status: 'pending' },
      error: null,
    })

    const res = await POST(req('body', 'sig'))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
  })

  it('200 và giải phóng ghế khi payment_intent.canceled', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_cancel' } },
    })
    mockReservationQuery.mockResolvedValue({
      data: { id: 'res-3', seat_id: 'seat-3', status: 'pending' },
      error: null,
    })

    const res = await POST(req('body', 'sig'))
    expect(res.status).toBe(200)
  })

  it('200 cho event type không xử lý', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    })

    const res = await POST(req('body', 'sig'))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
  })
})
