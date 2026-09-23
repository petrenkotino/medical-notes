---
title: Medical Notes API
subtitle: Design, load testing, and one improvement
author: Tino Petrenko
date: September 2026
aspectratio: 169
---

# What I built

- Node.js 24, TypeScript, Fastify, PostgreSQL 17, and Postgres.js
- `POST /medical-note` creates a note
- `GET /medical-note/:id` returns its latest version
- `PUT /medical-note/:id` creates a new version
- Docker Compose starts the API and database locally
- PostgreSQL data persists across restarts

::: notes
I’ll start with the design, then spend most of the time on the load test and the change I made from its results. The service itself is deliberately small. For the load tests the compiled API ran directly on the host, which made its PID, CPU, and resident memory straightforward to sample. PostgreSQL remained in Docker, so the API-to-database path still included Docker networking and, on macOS, Docker Desktop’s virtualization boundary.
:::

# Note versions and concurrent updates

- Every version is a separate database row
- `(id, version)` is the primary key
- `PUT` reads the current version and inserts the next one in a single SQL statement
- Two concurrent updates may calculate the same next version
- PostgreSQL accepts one; the API returns `409 Conflict` for the other

This preserves history and avoids silently overwriting an update.

::: notes
I chose an append-only model because preserving history seemed like the more realistic assumption for medical notes. It does create a concurrency question. The current behavior keeps the stored data consistent, but it does not prove which version the client originally edited. In a real product I would probably require an expected version before deciding whether a retry is appropriate.
:::

# Correctness tests

The acceptance tests cover:

- the full `POST → GET → PUT → GET` flow;
- version increments and response fields;
- invalid UUIDs and request bodies;
- missing notes;
- concurrent updates;
- expected `409` responses without unexpected `500`s.

I also checked that a note survives a service restart.

::: notes
I did this before the performance work. The concurrency test sends five updates to one note and checks that successful writes have unique versions while the others return conflicts. I won’t walk through the test code unless there are questions.
:::

# Load-test setup

- 70% GET, 20% POST, 10% PUT
- 50 notes seeded before each invocation
- 15-second warm-up, then a 60-second measured run
- 10, 25, 50, 100, and 200 constant VUs
- No think time

I measured throughput, endpoint latency, unexpected failures, expected conflicts, CPU, and memory.

This is a local saturation test. It is not a simulation of 10–200 people using the product.

::: notes
The 50-note working set is both useful and artificial: it makes reads cache-friendly and makes update conflicts easier to trigger. Constant VUs run in a closed loop, so every VU sends another request as soon as the previous one finishes. That explains how 50 VUs can produce about 10,000 requests per second.
:::

# Baseline results

One Node process, default Postgres.js pool size of 10:

| VUs | req/s | GET p95 | Infra errors |
|---:|---:|---:|---:|
| 10 | 8,708 | 1.33 ms | 0% |
| 25 | 7,298 | 4.82 ms | 0% |
| 50 | 4,396 | 15.31 ms | 0% |
| 100 | 3,373 | 40.20 ms | 0% |
| 200 | 2,860 | 90.36 ms | 0% |

The first observed degradation was at 25 VUs.

::: notes
Throughput peaked at the lowest tested level and then fell while latency rose. Nothing failed, but the service was clearly saturated. I can only say degradation was visible at 25 VUs; I did not test enough points to say that 25 is the exact boundary.
:::

# Testing the pool-size hypothesis

I sampled `pg_stat_activity`, but the result was inconclusive: one-second snapshots can miss connection usage that lasts only a few milliseconds.

I then repeated the 25-VU test with pool sizes 10 and 20:

| | Pool 10 | Pool 20 | Change |
|---|---:|---:|---:|
| Throughput | 6,619 req/s | 10,086 req/s | +52.4% |
| Overall p95 | 5.68 ms | 4.45 ms | −21.7% |
| Max observed active DB connections | 8 | 19 | — |

The pool size was a meaningful constraint.

::: notes
I would be careful with the wording here. The PostgreSQL sampling did not prove that requests were waiting inside Postgres.js. The A/B result is the stronger evidence: changing the pool materially changed both throughput and latency at the same VU level. It still does not prove the pool was the only bottleneck.
:::

# Choosing a pool size

I tested pools 20, 30, 40, and 50 at 50 VUs:

| Pool | req/s | Overall p95 | PUT p95 | Conflicts/s |
|---:|---:|---:|---:|---:|
| 20 | 8,509 | 9.20 ms | 10.65 ms | 24 |
| 30 | 8,588 | 8.65 ms | 10.11 ms | 25 |
| **40** | **10,028** | **10.72 ms** | **14.44 ms** | **77** |
| 50 | 10,131 | 11.85 ms | 14.61 ms | 108 |

Pool 50 added about 1% throughput over pool 40, with ten more possible connections and more conflicts. I chose 40.

::: notes
The PostgreSQL samples saw a maximum of 32 active connections with pool 40 and 34 with pool 50. Those are sampled maxima, not exact peaks. Pool 40 is the smallest setting close to the throughput ceiling for this test. It is not a production recommendation; the total connection budget has to include every API replica and every other database client.
:::

# Pool 40 results

| VUs | req/s | GET p50 | GET p95 | GET p99 | Infra errors | Peak CPU | Peak RSS |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 7,393 | 0.88 ms | 2.15 ms | 6.49 ms | 0% | 93% | 211 MiB |
| 25 | 10,305 | 1.67 ms | 3.02 ms | 4.04 ms | 0% | 97% | 215 MiB |
| 50 | 10,159 | 3.74 ms | 6.07 ms | 8.48 ms | 0% | 105% | 207 MiB |
| 100 | 6,342 | 15.01 ms | 20.92 ms | 23.00 ms | 0% | 109% | 287 MiB |
| 200 | 4,199 | 46.49 ms | 63.59 ms | 79.29 ms | 0% | 105% | 331 MiB |

25 VUs was the highest tested point before degradation. At 50 VUs, throughput was almost unchanged while GET p95 roughly doubled.

::: notes
This is the complete pool-40 series rather than selected headline numbers. CPU and resident memory came from two-second ps samples of the API process during the measured 60 seconds; they were not collected by k6. At 25 VUs the service reached the highest throughput before degradation. At 50 VUs throughput stayed almost flat, but GET p95 roughly doubled, so that is where I consider degradation visible.
:::

# Before and after

| VUs | Pool 10 req/s | Pool 40 req/s | Change | Pool 10 GET p95 | Pool 40 GET p95 |
|---:|---:|---:|---:|---:|---:|
| 10 | 8,708 | 7,393 | −15.1% | 1.33 ms | 2.15 ms |
| 25 | 7,298 | 10,305 | +41.2% | 4.82 ms | 3.02 ms |
| 50 | 4,396 | 10,159 | +131.1% | 15.31 ms | 6.07 ms |
| 100 | 3,373 | 6,342 | +88.1% | 40.20 ms | 20.92 ms |
| 200 | 2,860 | 4,199 | +46.8% | 90.36 ms | 63.59 ms |

- Peak measured throughput increased by 18%
- The first observed degradation moved from 25 to 50 VUs
- Unexpected infrastructure failures remained at 0%

::: notes
At 25 VUs the larger pool improved both throughput and latency. The exact percentages should not be treated as universal because these are single local runs. The formal series also showed a worse result for pool 40 at 10 VUs. I repeated that comparison later and the ordering reversed: 7,549 req/s for pool 40 versus 6,514 for pool 10, with better tail latency. The low-load difference was not repeatable, so I treat it as run-to-run variation rather than an effect of the pool.
:::

# Trade-offs, assumptions, and limits

Trade-offs:

- Append-only versions preserve history, but use more storage and leave stale-edit handling unresolved.
- `409` prevents a silent overwrite, but still represents unsuccessful work for the user.
- Pool 40 favored throughput. Pool 30 had lower latency, fewer conflicts, and used fewer connections.
- The closed-loop workload finds saturation quickly, but is not representative user behavior.

Limitations:

- Small payloads, 50 hot notes, fixed 70/20/10 traffic, and no think time.
- API, k6, and Dockerized PostgreSQL ran on one machine; there was no TLS, ingress, or authentication.
- Most configurations have one 60-second measured run, so small differences may be noise.
- One-second PostgreSQL samples can miss millisecond contention; pool wait and event-loop lag were not measured.
- Throughput includes expected `409`s, so it is not identical to successful business work.

::: notes
I made these choices deliberately, but they affect how far I can take the results. Pool 40 was the throughput-oriented choice for the experiment, not an objectively best production setting. Pool 30 is a reasonable choice if latency, conflict rate, or database connection budget matters more. The test also deliberately generates requests as fast as possible against a tiny working set. That is useful for finding a local saturation point, but it does not tell me how many real clinicians the service supports. My claim is therefore relative: changing the pool improved this workload and moved the first observed degradation point. It is not a production capacity forecast.
:::

# A small follow-up with two Node processes

At 200 VUs, keeping the total pool limit at 40:

| | 1 process × pool 40 | 2 processes × pool 20 |
|---|---:|---:|
| Throughput | 4,199 req/s | 11,734 req/s |
| Overall p95 | 63.78 ms | 42.02 ms |
| Aggregate CPU | 97.0% | 177.5% |
| Peak RSS | 331 MiB | 434 MiB |

This suggests that using another CPU core is worth testing properly. It does not prove 2.8× scaling.

::: notes
This was one unpaired run against different database state. Memory increased by 31%, and conflicts rose to about 188 per second. I included it because it gives a useful next direction, not because it is formal evidence for a production topology.
:::

# What the test says about capacity

With one Node process and pool 40:

- 25 VUs at about 10,300 req/s was the highest tested point before degradation;
- at 50 VUs, throughput was still about 10,200 req/s but GET p95 doubled;
- unexpected infrastructure failures remained at 0% through 200 VUs.

The result applies to this local workload: small payloads, loopback networking, 50 hot notes, and no TLS, authentication, or reverse proxy.

::: notes
This is the direct answer to “what can it handle before degrading?” It is not an exact boundary and it does not map to a number of real users. Expected 409s are included in completed-request throughput, so this is also not the same thing as successful business-update throughput.
:::

# What I would do next

1. Repeat the one-, two-, and four-process tests with a fixed total database connection limit.
2. Measure pool wait time, event-loop lag, query duration, PostgreSQL waits, and each process separately.
3. Decide what should happen when two users update the same note; I would not add automatic retries before that is clear.
4. Add request and query timeouts, bound pool waits, drain connections on shutdown, and test a slow or unavailable database.
5. Repeat the test with representative note sizes and traffic, separate hosts, and an arrival-rate target based on a real latency objective.

::: notes
These are not in a strict order. The first two follow from what I observed. The third is a product and correctness question revealed by the conflict rate. The last two are what I would need before using the numbers for production planning.
:::

# Questions

::: notes
Stop here. Use the appendix only when a question needs the raw numbers or the scope decisions.
:::

# Appendix: update conflicts

- 10% of requests update one of 50 seeded notes
- Larger pools allow more updates to race concurrently
- `409` keeps stored versions consistent but is not successful business work
- In the two-process 200-VU test, roughly 16% of PUT attempts conflicted

The product semantics should be clear before adding retries or serialization.

# Appendix: decisions made for this exercise

- `authorId` is client-supplied attribution, not authenticated identity
- Migrations run during application startup
- The tests omit TLS, ingress, autoscaling, separate hosts, and a managed database
- Retention, deletion, and stale-edit reconciliation are not designed

These are scope decisions for the take-home, not suggested production defaults.
