import { readFile, readdir } from 'node:fs/promises'

import { expect, it } from 'vitest'

const SOURCE_FOLDERS = ['src', 'scripts', 'mocks']
const SOURCE_FILE = /\.(ts|tsx|mts)$/
// A test builds its database from the tables and seeds rows.
const TEST_FILE = /\.test\.tsx?$/
const SCHEMA_IMPORT = /from\s+'[^']*\/db\/schema\.ts'/

async function listSchemaImporters() {
  const importers: string[] = []
  for (const folder of SOURCE_FOLDERS) {
    const entries = await readdir(folder, {
      recursive: true,
      withFileTypes: true,
    })
    for (const entry of entries) {
      const path = `${entry.parentPath}/${entry.name}`
      if (
        !entry.isFile() ||
        !SOURCE_FILE.test(path) ||
        TEST_FILE.test(path) ||
        path.startsWith('src/db/') ||
        path.includes('node_modules')
      ) {
        continue
      }
      if (SCHEMA_IMPORT.test(await readFile(path, 'utf8'))) importers.push(path)
    }
  }
  return importers.sort()
}

it('keeps the tables behind the storage functions of src/db', async () => {
  expect(await listSchemaImporters()).toEqual([])
})
