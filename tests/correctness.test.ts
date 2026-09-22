import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

before(async () => {
  const res = await fetch(`${BASE}/ready`).catch(() => null)
  if (!res || res.status !== 200) throw new Error(`Server not ready at ${BASE}`)
})

// ─── Happy path ───────────────────────────────────────────────────────────────
// POST → GET → PUT → GET are inherently sequential, so the full flow is one
// test to avoid hidden ordering dependencies between test cases.
describe('happy path', () => {
  test('POST → GET → PUT → GET: correct fields at each step, version increments', async () => {
    const post = await req('POST', '/medical-note', {
      patientId: 'patient-abc',
      authorId: 'dr-xyz',
      text: 'Initial note',
    })
    assert.equal(post.status, 201)
    assert.match(post.body.id, UUID_RE)
    assert.equal(post.body.patientId, 'patient-abc')
    assert.equal(post.body.authorId, 'dr-xyz')
    assert.equal(post.body.text, 'Initial note')
    assert.equal(post.body.version, 1)
    assert.ok(typeof post.body.createdAt === 'string' && post.body.createdAt.length > 0)
    const id: string = post.body.id

    const get1 = await req('GET', `/medical-note/${id}`)
    assert.equal(get1.status, 200)
    assert.equal(get1.body.id, id)
    assert.equal(get1.body.text, 'Initial note')
    assert.equal(get1.body.version, 1)

    const put = await req('PUT', `/medical-note/${id}`, {
      authorId: 'dr-xyz',
      text: 'Updated note',
    })
    assert.equal(put.status, 200)
    assert.equal(put.body.id, id)
    assert.equal(put.body.text, 'Updated note')
    assert.equal(put.body.version, 2)

    const get2 = await req('GET', `/medical-note/${id}`)
    assert.equal(get2.status, 200)
    assert.equal(get2.body.version, 2)
    assert.equal(get2.body.text, 'Updated note')
  })
})

// ─── Error cases ──────────────────────────────────────────────────────────────
// A before hook creates the fixture note so these tests are independent of the
// happy-path suite.
describe('error cases', () => {
  let id: string

  before(async () => {
    const { status, body } = await req('POST', '/medical-note', {
      patientId: 'patient-err',
      authorId: 'dr-err',
      text: 'Error case fixture',
    })
    assert.equal(status, 201, 'fixture POST failed')
    assert.match(body.id, UUID_RE, 'fixture returned invalid id')
    id = body.id
  })

  test('GET invalid UUID format → 400', async () => {
    const { status } = await req('GET', '/medical-note/not-a-uuid')
    assert.equal(status, 400)
  })

  test('GET valid UUID with no note → 404', async () => {
    const { status } = await req('GET', '/medical-note/00000000-0000-0000-0000-000000000000')
    assert.equal(status, 404)
  })

  test('PUT non-existent id → 404', async () => {
    const { status } = await req('PUT', '/medical-note/00000000-0000-0000-0000-000000000000', {
      authorId: 'dr',
      text: 'text',
    })
    assert.equal(status, 404)
  })

  test('PUT with empty text → 400', async () => {
    const { status } = await req('PUT', `/medical-note/${id}`, {
      authorId: 'dr',
      text: '',
    })
    assert.equal(status, 400)
  })

  test('PUT with empty authorId → 400', async () => {
    const { status } = await req('PUT', `/medical-note/${id}`, {
      authorId: '',
      text: 'some text',
    })
    assert.equal(status, 400)
  })
})

// ─── Concurrency ──────────────────────────────────────────────────────────────
describe('concurrency: 5 simultaneous PUTs on the same note', () => {
  test('all 5 are 200 or 409, no 500s, winning versions are unique and consecutive', async () => {
    const { status: postStatus, body: created } = await req('POST', '/medical-note', {
      patientId: 'patient-conc',
      authorId: 'dr-a',
      text: 'Concurrency test note',
    })
    assert.equal(postStatus, 201, 'fixture POST failed')
    assert.match(created.id, UUID_RE, 'fixture returned invalid id')

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        req('PUT', `/medical-note/${created.id}`, {
          authorId: `dr-${i + 1}`,
          text: `Update ${i + 1}`,
        }),
      ),
    )

    const statuses = results.map((r) => r.status)
    const wins = results.filter((r) => r.status === 200)
    const conflicts = results.filter((r) => r.status === 409)

    assert.ok(!statuses.includes(500), `Got a 500 — statuses: ${statuses.join(' ')}`)
    assert.equal(wins.length + conflicts.length, 5, `Unexpected statuses: ${statuses.join(' ')}`)

    const versions = wins.map((r) => r.body.version as number).sort((a, b) => a - b)
    const uniqueVersions = new Set(versions)
    assert.equal(uniqueVersions.size, wins.length, `Duplicate versions: ${versions.join(' ')}`)

    // Versions must be consecutive starting at 2: [2, 3, …, wins.length + 1]
    const expected = Array.from({ length: wins.length }, (_, i) => i + 2)
    assert.deepEqual(versions, expected, `Non-consecutive versions: ${versions.join(' ')}`)

    console.log(`    statuses: ${statuses.join(' ')} | winning versions: ${versions.join(' ')}`)
  })
})
