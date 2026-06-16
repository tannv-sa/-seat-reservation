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

  it('401 when Authorization header is missing', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('401 when CRON_SECRET is wrong', async () => {
    const res = await GET(req('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('200 + released=0 when no holds have expired', async () => {
    mockSeatsRelease.mockResolvedValue({ data: [], error: null })

    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.released).toBe(0)
    expect(body.seats).toEqual([])
  })

  it('200 + released=N when expired holds exist', async () => {
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

  it('500 when Supabase returns an error', async () => {
    mockSeatsRelease.mockResolvedValue({
      data: null,
      error: { message: 'connection timeout' },
    })

    const res = await GET(req('Bearer test-cron-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('connection timeout')
  })

  it('response includes a valid timestamp field', async () => {
    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json()
    expect(body.timestamp).toBeDefined()
    expect(new Date(body.timestamp).getTime()).not.toBeNaN()
  })
})
