# Medical Notes API: Design; Load Test; Improvement

## Overview

The medical-notes API service is built with Node.js 24, TypeScript, Fastify, PostgreSQL 17, and Postgres.js. The service exposes three endpoints, as suggested in the requirements doc:

- `POST /medical-note` creates a note.
- `GET /medical-note/:id` retrieves its latest version.
- `PUT /medical-note/:id` creates a new version.

The API and PostgreSQL can run together through Docker compose. For load testing, I'd recommend running the the compiled API natively to avoid adding Docker networking overhead to the measurements.

## Application design

I've decided to go with an immutable, append-only data model for the medical notes in an attempt to simulate (what I assume is) more realistic way of storing medical notes. Each note version is a separate row in the DB, with (id, version) as the primary key.

Having this design in place means that PUT doesn't modify an existing row. It reads the latest version and inserts a new one in a single SQL statement. Each `created_at` value serves as a timestamp for that revision, making the separate `updated_at` field not needed.

This way we preserve history, which I believe is a crucial design decision in a medical system. The implication is that we have to handle concurent updates, when we try to update the same version. In this case Postgres accepts one and rejects the other through the PK constraint. The API maps this condition to a `409 Conflict`, and it allows the client to retry.

The service also exposes:

- `/health` for process liveness.
- `/ready` for database readiness.

For the scope of this exercise, `authorId` is client-supplied attribution data rather than an authenticated identity. Production authentication, authorization, and verified audit identity would require a separate security design.

## Correctness testing (tests/correctness.test.ts)

Before load testing, I created acceptance tests against a running API. The tests cover:

- The complete `POST → GET → PUT → GET` flow.
- Response fields and version increments.
- Invalid UUIDs and request bodies.
- Missing notes.
- Concurrent updates.
- Expected `409` conflicts without unexpected `500` responses.

## Load-test design

I designed the k6 workload to be read-heavy:

- 70% GET
- 20% POST
- 10% PUT

Each invocation seeds 50 notes that are used as read and update targets. This approach intentionally exercises concurrent version conflicts, and makes them easy to end up in OS page cache. 

K6's `constant-vus` executor, without think time is used for the test. Ie. the test is not attempting to simulate real users, but instead it sends a new request as soon as the previous completes.

The test was split into 5 levels - 10, 25, 50, 100 and 200 VUs. Each level ran a separate 15 second unreported warm up, before running the 60 second measured run.

Custom metrics exclude setup requests and record:

- workload throughput
- p50, p95 and p99 latecny per endpoint
- response correctness failures
- http and infrastructure failures
- 409 conflict errors that are "expected"

API CPU and memory were sampled during the measured runs. Expected conflicts are tracked separately so they don't count as infra failures.

The definition of degradation I used was: throughput plateaus or declines as concurrency increases while latency rises, or unexpected errors emerge.

## Baseline results

The baseline used one Node process and the default Postgres.js pool size of 10.

| VUs |  Throughput |  GET p50 |  GET p95 |  GET p99 | Infra errors | Peak API CPU | Peak RSS |
| --: | ----------: | -------: | -------: | -------: | -----------: | -----------: | -------: |
|  10 | 8,708 req/s |  0.85 ms |  1.33 ms |  1.73 ms |        0.00% |          97% |  208 MiB |
|  25 | 7,298 req/s |  3.05 ms |  4.82 ms |  5.53 ms |        0.00% |         107% |  213 MiB |
|  50 | 4,396 req/s | 11.16 ms | 15.31 ms | 16.99 ms |        0.00% |         102% |  224 MiB |
| 100 | 3,373 req/s | 29.39 ms | 40.20 ms | 43.32 ms |        0.00% |         106% |  258 MiB |
| 200 | 2,860 req/s | 70.45 ms | 90.36 ms | 96.23 ms |        0.00% |         105% |  293 MiB |

All correctness checks passed, but throughput peaked at the lowest tested level and declined as concurrency increased. The first observed degradation occurred at 25 VUs.

The baseline proved that the system was saturated, but it didn't answer the question of identifying whether the app CPU, connection availabiliy or another shared resource was the bottleneck.

### Finding the bottleneck

I added an `application_name` to the Postgres.js connections and sampled `pg_stat_activity`.

The snapshots often showed idle connections, initially suggesting that the pool was not exhausted. However, queries complete in milliseconds while the sampler ran approximately once per second, so it could miss short bursts of pool contention. That result was rather inconclusive, so I turned to other method - controlled pool-size comparison.

At 25 VUs:

| Metric                     |     Pool 10 |      Pool 20 |                        Change |
| -------------------------- | ----------: | -----------: | ----------------------------: |
| Throughput                 | 6,619 req/s | 10,086 req/s |                        +52.4% |
| Overall p95                |     5.68 ms |      4.45 ms |                        -21.7% |
| GET p95                    |     5.34 ms |      3.16 ms |                        -40.8% |
| Infrastructure errors      |       0.00% |        0.00% |                 No regression |
| Maximum active connections |           8 |           19 | Pool 20 used more concurrency |

Increasing the pool obviously improved throughput and latency, demonstrating that pool size was a meaningful constraint.

### Finding the optimal pool size

I then tested pool sizes of 20, 30, 40, and 50 at 50 VUs.

| Pool |   Throughput | Overall p95 | GET p95 | POST p95 |  PUT p95 | Conflicts/s |
| ---: | -----------: | ----------: | ------: | -------: | -------: | ----------: |
|   20 |  8,509 req/s |     9.20 ms | 8.35 ms | 10.47 ms | 10.65 ms |          24 |
|   30 |  8,588 req/s |     8.65 ms | 7.77 ms | 10.00 ms | 10.11 ms |          25 |
|   40 | 10,028 req/s |    10.72 ms | 6.37 ms | 14.24 ms | 14.44 ms |          77 |
|   50 | 10,131 req/s |    11.85 ms | 5.60 ms | 14.27 ms | 14.61 ms |         108 |

Pool 50 produced only 1% more throughput than pool 40 while consuming 25% more connections, increasing overall latency, and creating more conflicts. PostgreSQL sampling observed a maximum of 32 active connections with pool 40 and 34 with pool 50.

I selected `DB_POOL_MAX=40` as the smallest near-optimal configuration.

This is something that is very specific for this test, and definitely not an overall production level value I would recommend blidnly. Connection pools must be sized against PostgreSQL capacity and the scale at which we run our service.

### Increased pool results

The full load series was repeated with one Node process and a pool of 40.

| VUs |   Throughput |  GET p50 |  GET p95 |  GET p99 | Infra errors | Peak API CPU | Peak RSS |
| --: | -----------: | -------: | -------: | -------: | -----------: | -----------: | -------: |
|  10 |  7,393 req/s |  0.88 ms |  2.15 ms |  6.49 ms |        0.00% |          93% |  211 MiB |
|  25 | 10,305 req/s |  1.67 ms |  3.02 ms |  4.04 ms |        0.00% |          97% |  215 MiB |
|  50 | 10,159 req/s |  3.74 ms |  6.07 ms |  8.48 ms |        0.00% |         105% |  207 MiB |
| 100 |  6,342 req/s | 15.01 ms | 20.92 ms | 23.00 ms |        0.00% |         109% |  287 MiB |
| 200 |  4,199 req/s | 46.49 ms | 63.59 ms | 79.29 ms |        0.00% |         105% |  331 MiB |

### Before and after

| VUs | Pool 10 req/s | Pool 40 req/s | Throughput change | Pool 10 GET p95 | Pool 40 GET p95 |
| --: | ------------: | ------------: | ----------------: | --------------: | --------------: |
|  10 |         8,708 |         7,393 |            -15.1% |         1.33 ms |         2.15 ms |
|  25 |         7,298 |        10,305 |            +41.2% |         4.82 ms |         3.02 ms |
|  50 |         4,396 |        10,159 |           +131.1% |        15.31 ms |         6.07 ms |
| 100 |         3,373 |         6,342 |            +88.1% |        40.20 ms |        20.92 ms |
| 200 |         2,860 |         4,199 |            +46.8% |        90.36 ms |        63.59 ms |

The highest measured throughput increased from 8.7K to 10+K req/s, which is an improvement of ~18%.

The baseline degregated at 25 VUs, at aproximately 8K req/s. With the increased pool of 40, throughput peaked at 25 VUs and remained more or less flat until 50VUs, while the latency doubled. The first degragation moved to 50 VUs for that reason.

The 10-VU result regressed by 15.1%. Because the benchmark used one local run per configuration, this I assume is a run-to-run or environmental variability rather than attributed to the pool, and I honestly didn't reapeat it to proove what I claim above.

### Improvement tradeoffs

The larger pool allows more work to reach PostgreSQL concurrently. This improved throughput and high-load latency, but introduced costs:

- higher number of expected update conflicts - more updates raced to create a new version of the same note
- peak API mem at 200 VUs increased from 293 to 331 MiB
- this size pool consumes a much higher porion of Posgres' connection budget

Expected `409` responses count toward request throughput. Aggregate request throughput is therefore not identical to successful business-update throughput, although conflicts account for only part of the measured improvement.

### Assumptions and limitations

These results are a local capacity baseline, not a production capacity guarantee:

- k6, the API, and PostgreSQL shared one machine.
- the test omitted TLS, authentication, a reverse proxy, and real network latency.
- it used small, fixed payloads.
- reads targeted a hot set of 50 notes, making them very cache-friendly.
- updates targeted the same set, creating more conflicts than uniformly distributed updates.
- the database grew between levels within each series.
- each configuration was measured once rather than through repeated trials.
- fastify request logging remained enabled and may contribute CPU and output overhead.


## A little experiment

After the formal pool improvement, I ran an exploratory experiment with two Node workers at 200 VUs. Each worker used a pool of 20, keeping the total connection budget equal to the single-worker pool-40 configuration.

| Metric                | 1 worker × pool 40 | 2 workers × pool 20 |            Change |
| --------------------- | -----------------: | ------------------: | ----------------: |
| Throughput            |        4,199 req/s |        11,734 req/s |           +179.4% |
| Overall p95           |           63.78 ms |            42.02 ms |            -34.1% |
| Overall p99           |           79.76 ms |            61.76 ms |            -22.6% |
| GET p95               |           63.59 ms |            38.54 ms |            -39.4% |
| Infrastructure errors |              0.00% |               0.00% |     No regression |
| Aggregate CPU         |              97.0% |              177.5% | Used another core |
| Peak aggregate RSS    |            331 MiB |             434 MiB |            +31.1% |

The workers averaged 89.4% and 88.1% CPU, showing an even load distribution and successful use of a second core.

This is not formal evidence of anything. It was a single unpaired run against different database state, and that impressive gain may include garbage collection, cache, and local environment effects. It however a  strong suggestion that multi process (or horizontally scaled service) are the next useful optimization.

## Next improvements

*This list is not in order of importance.*

1. **Validate multi-process scaling.**  The 200-VU experiment suggests that the single process becomes the next bottleneck. I would repeat the full test with one, two, and four workers while keeping the total PostgreSQL connection limit fixed. That would show how far the API scales before PostgreSQL becomes the limiting factor.

2. **Add production level observability.**  In particular, I want to see how long requests wait for a database connection, event-loop lag, query duration, and PostgreSQL wait events. The pg_stat_activity sampling was useful, but it was too coarse to explain short-lived contention.

3. **Revisit how concurrent updates should work.**  The current 409 behavior keeps the data correct, but the right recovery depends on the product. I would probably require clients to send the version they edited and return the latest version when there is a conflict. I would not add automatic retries until it is clear that reordering two users’ edits is acceptable.

4. **Test against representative data and traffic.** I would use realistic note sizes, a larger set of notes, authentication and TLS, and run the load generator separately from the API and database. I would also repeat each run from the same database state. Once there is a real latency target, I would add an arrival-rate test to determine how much traffic the API can sustain while meeting it.

5. **Make overload and shutdown behavior explicit.**  I would add request and query timeouts, limit how long a request can wait for a pooled connection, and drain connections during shutdown. I would also test what happens when PostgreSQL is slow or unavailable. The API should reject work cleanly instead of building an ever-growing queue.
