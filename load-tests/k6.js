import http from 'k6/http'
import { check } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// ─── VUS validation ───────────────────────────────────────────────────────────
const VUS = parseInt(__ENV.VUS || '10', 10)
if (isNaN(VUS) || VUS < 1) {
  throw new Error(`VUS must be a positive integer, got: "${__ENV.VUS}"`)
}

// ─── Custom workload metrics ──────────────────────────────────────────────────
//
// Use these for authoritative analysis. The built-in http_reqs and
// http_req_duration aggregates include the 50 setup() requests and are
// therefore unsuitable as workload-only measurements.
//
//   Throughput:          rate of workload_requests_total (tagged by endpoint)
//   GET latency:         get_duration
//   POST latency:        post_duration
//   PUT latency:         put_duration  (includes 409 responses)
//   Error rate:          infra_error_rate (status failures + shape failures)
//   Expected conflicts:  put_conflicts_total
//
// http_req_failed should remain clean because PUT 409 is declared an expected
// status via responseCallback: http.expectedStatuses(200, 409).

// Defined once to avoid recreating the callback object on every PUT call
const expectedPutStatuses = http.expectedStatuses(200, 409)

const workloadRequests = new Counter('workload_requests_total')
const put409s          = new Counter('put_conflicts_total')
const infraErrorRate   = new Rate('infra_error_rate')

// true = time-valued trend; values in ms, displayed as duration in summary
const getDuration  = new Trend('get_duration',  true)
const postDuration = new Trend('post_duration', true)
const putDuration  = new Trend('put_duration',  true)

export const options = {
  scenarios: {
    load: {
      executor: 'constant-vus',
      vus: VUS,
      duration: __ENV.DURATION || '60s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // No latency or error-rate SLA was provided in the assignment. 
  // Degradation is assessed comparatively: throughput plateaus or declines as concurrency increases 
  // while latency rises, or unexpected errors emerge.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBody(res) {
  try {
    return res.json()
  } catch (_) {
    return null
  }
}

// ─── Setup: seed exactly 50 fixture notes ─────────────────────────────────────

export function setup() {
  const ids = []
  for (let i = 0; i < 50; i++) {
    const res = http.post(
      `${BASE_URL}/medical-note`,
      JSON.stringify({
        patientId: `seed-patient-${i}`,
        authorId: `seed-dr-${i}`,
        text: `Seeded note ${i} — pre-load-test fixture`,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'setup' },
      },
    )
    const body = parseBody(res)
    if (res.status === 201 && typeof body?.id === 'string' && body.id.length > 0) {
      ids.push(body.id)
    }
  }
  if (ids.length !== 50) {
    throw new Error(`setup: seeded ${ids.length}/50 notes — is the server running and healthy?`)
  }
  console.log(`setup: seeded ${ids.length} notes`)
  return { ids }
}

// ─── Default workload: 70% GET / 20% POST / 10% PUT ──────────────────────────

export default function (data) {
  const roll = Math.random()
  if (roll < 0.70) {
    doGet(data.ids)
  } else if (roll < 0.90) {
    doPost()
  } else {
    doPut(data.ids)
  }
}

// ─── 70% GET ──────────────────────────────────────────────────────────────────

function doGet(ids) {
  const id = ids[Math.floor(Math.random() * ids.length)]
  const res = http.get(`${BASE_URL}/medical-note/${id}`, {
    tags: { endpoint: 'get' },
  })
  const body = parseBody(res)
  const ok = check(
    { res, body },
    {
      'GET status 200':              ({ res })  => res.status === 200,
      'GET body has id':             ({ body }) => typeof body?.id === 'string',
      'GET body has version':        ({ body }) => Number.isInteger(body?.version),
      'GET body id matches request': ({ body }) => body?.id === id,
    },
    { endpoint: 'get' },
  )
  getDuration.add(res.timings.duration)
  workloadRequests.add(1, { endpoint: 'get' })
  infraErrorRate.add(ok ? 0 : 1, { endpoint: 'get' })
}

// ─── 20% POST ─────────────────────────────────────────────────────────────────

function doPost() {
  const res = http.post(
    `${BASE_URL}/medical-note`,
    JSON.stringify({ patientId: 'load-patient', authorId: 'load-dr', text: 'Load test note' }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'post' },
    },
  )
  const body = parseBody(res)
  const ok = check(
    { res, body },
    {
      'POST status 201':        ({ res })  => res.status === 201,
      'POST body has id':       ({ body }) => typeof body?.id === 'string',
      'POST body version is 1': ({ body }) => body?.version === 1,
    },
    { endpoint: 'post' },
  )
  postDuration.add(res.timings.duration)
  workloadRequests.add(1, { endpoint: 'post' })
  infraErrorRate.add(ok ? 0 : 1, { endpoint: 'post' })
}

// ─── 10% PUT ──────────────────────────────────────────────────────────────────

function doPut(ids) {
  const id = ids[Math.floor(Math.random() * ids.length)]
  const res = http.put(
    `${BASE_URL}/medical-note/${id}`,
    JSON.stringify({ authorId: 'load-dr', text: 'Updated by load test' }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'put' },
      responseCallback: expectedPutStatuses,
    },
  )
  putDuration.add(res.timings.duration)
  workloadRequests.add(1, { endpoint: 'put' })

  if (res.status === 409) {
    put409s.add(1)
    infraErrorRate.add(0, { endpoint: 'put' })
    return
  }

  const body = parseBody(res)
  const ok = check(
    { res, body },
    {
      'PUT status 200':              ({ res })  => res.status === 200,
      'PUT body has id':             ({ body }) => typeof body?.id === 'string',
      'PUT body has version':        ({ body }) => Number.isInteger(body?.version),
      'PUT body id matches request': ({ body }) => body?.id === id,
    },
    { endpoint: 'put' },
  )
  infraErrorRate.add(ok ? 0 : 1, { endpoint: 'put' })
}
