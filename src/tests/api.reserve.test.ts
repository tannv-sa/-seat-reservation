import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/reserve/route'

// ── Hoisted mocks (available inside vi.mock factories) ───────────────────────

const {
  mockGetUser,
  mockExistingReservation,
  mockSeatsHold,
  mockReservationsInsert,
  mockPaymentIntentCreate,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockExistingReservation: vi.fn(),
  mockSeatsHold: vi.fn(),
  mockReservationsInsert: vi.fn(),
  mockPaymentIntentCreate: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      // Generic builder — chains every method, exposes maybySingle and thenable
      function makeBuilder(maybySingleFn: any, insertFn?: any) {
        const b: any = {
          maybeSingle: maybySingleFn,
          insert: insertFn ?? (() => Promise.resolve({ data: {}, error: null })),
          // Thenable for `await builder` (rollback path)
          then: (res: any, rej: any) =>
            Promise.resolve({ data: null, error: null }).then(res, rej),
        }
        ;['select', 'update', 'eq', 'lt', 'in', 'or', 'order'].forEach(m => {
          b[m] = () => b
        })
        return b
      }
      if (table === 'seats') return makeBuilder(mockSeatsHold)
      // reservations
      return makeBuilder(mockExistingReservation, mockReservationsInsert)
    },
  }),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: { paymentIntents: { create: mockPaymentIntentCreate } },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(body: object) {
  return new Request('http://localhost/api/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/reserve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Defaults: unauthenticated, no existing reservation, seat is taken, insert ok
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockExistingReservation.mockResolvedValue({ data: null, error: null })
    mockSeatsHold.mockResolvedValue({ data: null, error: null })
    mockReservationsInsert.mockResolvedValue({ data: {}, error: null })
    mockPaymentIntentCreate.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_secret',
    })
  })

  it('401 khi chưa đăng nhập', async () => {
    const res = await POST(req({ seatId: 'seat-1' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('400 khi thiếu seatId', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('seatId')
  })

  it('409 khi user đã có reservation confirmed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockExistingReservation.mockResolvedValue({
      data: { id: 'res-1', seat_id: 'seat-2' },
      error: null,
    })
    const res = await POST(req({ seatId: 'seat-1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already have a confirmed/i)
  })

  it('409 khi atomic UPDATE trả về null — ghế đã bị hold (race condition bị ngăn)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // mockSeatsHold trả về { data: null } → WHERE status='available' không khớp
    mockSeatsHold.mockResolvedValue({ data: null, error: null })

    const res = await POST(req({ seatId: 'seat-1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/just taken/i)
  })

  it('200 + clientSecret + seatLabel khi hold ghế thành công', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
    })
    mockSeatsHold.mockResolvedValue({
      data: { id: 'seat-1', label: 'A1', status: 'held' },
      error: null,
    })
    mockPaymentIntentCreate.mockResolvedValue({
      id: 'pi_abc',
      client_secret: 'pi_abc_secret_xyz',
    })

    const res = await POST(req({ seatId: 'seat-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.clientSecret).toBe('pi_abc_secret_xyz')
    expect(body.seatLabel).toBe('A1')
  })

  it('Stripe PaymentIntent.create nhận đúng metadata', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
    })
    mockSeatsHold.mockResolvedValue({
      data: { id: 'seat-1', label: 'A1' },
      error: null,
    })

    await POST(req({ seatId: 'seat-1' }))

    expect(mockPaymentIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ seatId: 'seat-1', userId: 'u1' }),
      })
    )
  })

  it('500 khi insert reservation thất bại (và rollback seat được gọi)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
    })
    mockSeatsHold.mockResolvedValue({
      data: { id: 'seat-1', label: 'A1' },
      error: null,
    })
    mockReservationsInsert.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    })

    const res = await POST(req({ seatId: 'seat-1' }))
    expect(res.status).toBe(500)
  })
})
