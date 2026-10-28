import { fileURLToPath } from 'node:url'
import { openDatabase } from './client'

/** Real SQLite with production migrations, isolated for each test. */
export function testDatabase() {
  return openDatabase(':memory:', fileURLToPath(new URL('../../migrations', import.meta.url)))
}
