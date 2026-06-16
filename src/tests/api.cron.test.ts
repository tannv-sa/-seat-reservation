import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/cron/release-holds/route'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockSeatsRelease } = vi.hoisted(() => ({
  mockSeatsRelease: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      // seats: .update().eq().lt().select() → thenable (await directly)
      // reservations: .update().in().eq() → thenable (await directly)
      const b: any = {
        then:
          table === 'seats'
            ? (res: any, rej: any) => mockSeatsRelease().then(res, rej)
            : (res: any, rej: any) =>
                Promise.resolve({ data: null, error: null }).then(res, rej),
      }
      ;['update', 'eq', 'lt', 'select', 'in', 'order'].forEach(m => {
        b[m] = () => b
      })
      return b
    },
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(authHeader?: string) {
  return new Request('http://localhost/api/cron/release-holds', {
    method: 'GET',
    headers: authHeader ? { Authorization: authHeader } : {},
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/cron/release-holds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSeatsRelease.mockResolvedValue({ data: [], error: null })
  })

  it('401 khi thiếu Authorization header', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('401 khi sai CRON_SECRET', async () => {
    const res = await GET(req('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('200 + released=0 khi không có ghế nào hết hạn hold', async () => {
    mockSeatsRelease.mockResolvedValue({ data: [], error: null })

    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.released).toBe(0)
    expect(body.seats).toEqual([])
  })

  it('200 + released=N khi có ghế hết hạn', async () => {
    mockSeatsRelease.mockResolvedValue({
      data: [
        { id: 'seat-1', label: 'A1' },
        { id: 'seat-2', label: 'B3' },
      ],
      error: null,
    })

    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.released).toBe(2)
    expect(body.seats).toEqual(['A1', 'B3'])
  })

  it('500 khi Supabase trả về lỗi', async () => {
    mockSeatsRelease.mockResolvedValue({
      data: null,
      error: { message: 'connection timeout' },
    })

    const res = await GET(req('Bearer test-cron-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('connection timeout')
  })

  it('response có trường timestamp', async () => {
    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json()
    expect(body.timestamp).toBeDefined()
    expect(new Date(body.timestamp).getTime()).not.toBeNaN()
  })
})
