import { beforeEach, describe, expect, it } from 'vitest'

import { addProject } from './part-records.ts'
import { findProduct, setProductRepository } from './projects.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

beforeEach(async () => {
  await addProject(db, 'glue')
})

describe('setProductRepository', () => {
  it('sets the repository of the Product', async () => {
    await setProductRepository(db, 'glue', 'timschoch/glue')

    expect(await findProduct(db, 'glue')).toMatchObject({
      repository: 'timschoch/glue',
    })
  })

  it('rejects a repository that is not owner/name, and sets nothing', async () => {
    await expect(
      setProductRepository(db, 'glue', 'https://github.com/timschoch/glue'),
    ).rejects.toThrow(
      new InvalidRecordError(
        'repository "https://github.com/timschoch/glue" must look like owner/name',
      ),
    )

    expect(await findProduct(db, 'glue')).toMatchObject({ repository: null })
  })

  it('throws for a Product that does not exist', async () => {
    await expect(
      setProductRepository(db, 'nope', 'timschoch/glue'),
    ).rejects.toThrow(ProductNotFoundError)
  })
})
