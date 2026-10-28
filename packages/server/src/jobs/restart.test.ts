import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createSqliteAnalysisJobsRepository } from '../analysis-jobs'
import { openDatabase } from '../db/client'
import { claimJob } from './lease'

it('recovers a claim after the owning process is killed and prevents another connection from claiming it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulls-restart-'))
  const path = join(directory, 'jobs.sqlite')
  const migrations = fileURLToPath(new URL('../../migrations', import.meta.url))
  const storage = openDatabase(path, migrations)
  const jobs = createSqliteAnalysisJobsRepository(storage.db)
  const require = createRequire(import.meta.url)
  const script = join(directory, 'claim.cjs')
  const clientPath = fileURLToPath(new URL('../db/client.ts', import.meta.url))
  const leasePath = fileURLToPath(new URL('./lease.ts', import.meta.url))
  const now = Date.now()
  writeFileSync(script, `
    const { createJiti } = require(${JSON.stringify(require.resolve('jiti'))});
    const jiti = createJiti(__filename);
    (async () => {
      const { openDatabase } = await jiti.import(${JSON.stringify(clientPath)});
      const { claimJob } = await jiti.import(${JSON.stringify(leasePath)});
      const storage = openDatabase(${JSON.stringify(path)}, ${JSON.stringify(migrations)});
      process.send(claimJob(storage.db, ${now}));
      setInterval(() => {}, 1000);
    })().catch(error => { console.error(error); process.exit(1) });
  `)
  let child: ReturnType<typeof fork> | undefined
  try {
    await jobs.create({ id: 'persisted', owner: 'o', repo: 'r', number: 1, trigger: 'manual' }, now)
    child = fork(script, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    const [claim] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => { throw new Error(`Claim process exited early: ${code}`) }),
    ])
    expect(claim).toMatchObject({ id: 'persisted' })
    expect(claimJob(storage.db, now + 1)).toBeNull()
    child.kill('SIGKILL')
    await once(child, 'exit')
    expect(claimJob(storage.db, now + 61_000)).toBeNull()
    expect(claimJob(storage.db, now + 91_000)).toMatchObject({ id: 'persisted' })
    expect(await jobs.get('persisted')).toMatchObject({ status: 'running', attempts: 2 })
  }
  finally {
    child?.kill('SIGKILL')
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
}, 20_000)
