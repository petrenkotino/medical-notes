import cluster from 'node:cluster'

const workerCount = Number.parseInt(process.env.WORKERS ?? '2', 10)

if (!Number.isInteger(workerCount) || workerCount < 1) {
  throw new Error(`WORKERS must be a positive integer, got: "${process.env.WORKERS}"`)
}

if (cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_RR

  console.log(
    `cluster primary ${process.pid}: starting ${workerCount} workers ` +
      `(DB_POOL_MAX=${process.env.DB_POOL_MAX ?? '10'})`,
  )

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork()
  }

  cluster.on('online', (worker) => {
    console.log(`cluster worker online: pid=${worker.process.pid}`)
  })

  let shuttingDown = false

  function shutdown(signal, exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`cluster primary ${process.pid}: received ${signal}, stopping workers`)

    for (const worker of Object.values(cluster.workers)) {
      worker?.process.kill('SIGTERM')
    }

    cluster.disconnect(() => process.exit(exitCode))
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `cluster worker exited: pid=${worker.process.pid} code=${code} signal=${signal}`,
    )

    if (!shuttingDown) shutdown('unexpected worker exit', 1)
  })
} else {
  await import('../dist/index.js')
}
