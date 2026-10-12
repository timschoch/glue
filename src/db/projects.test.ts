import { beforeEach, describe, expect, it } from 'vitest'

import { joinProject, listMembers } from './members.ts'
import { addConcept, addPart, addProject, answerPart } from './part-records.ts'
import { findPart, findProject } from './parts.ts'
import { createToken, findToken } from './tokens.ts'
import {
  addProjectReference,
  canReference,
  findProduct,
  renameProject,
  setProductRepository,
} from './projects.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

beforeEach(async () => {
  await addProject(db, 'glue')
})

describe('renameProject', () => {
  it('gives the Project a new name and a new address', async () => {
    await addProject(db, 'design-system', 'Design system')

    expect(
      await renameProject(db, 'design-system', {
        name: 'Glue UX',
        slug: 'glue-ux',
      }),
    ).toEqual({ slug: 'glue-ux', name: 'Glue UX' })

    expect(await findProduct(db, 'glue-ux')).toMatchObject({ name: 'Glue UX' })
    expect(await findProduct(db, 'design-system')).toBeUndefined()
  })

  it('gives the root Concept the new address and the new name', async () => {
    await addProject(db, 'design-system', 'Design system')

    await renameProject(db, 'design-system', {
      name: 'Glue UX',
      slug: 'glue-ux',
    })

    expect((await findProject(db, 'glue-ux'))?.concept).toMatchObject({
      slug: 'glue-ux',
      title: 'Glue UX',
    })
  })

  it('keeps the address with a new name alone', async () => {
    await renameProject(db, 'glue', { name: 'Glue concept' })

    expect(await findProject(db, 'glue')).toMatchObject({
      slug: 'glue',
      name: 'Glue concept',
      concept: { slug: 'glue', title: 'Glue concept' },
    })
  })

  it('keeps the Parts, the members and the tokens with the Project', async () => {
    await addProject(db, 'design-system', 'Design system')
    await addPart(db, 'design-system', {
      type: 'guardrail',
      title: 'No text that describes the UI',
      enforcedBy: 'review',
    })
    await joinProject(db, 'design-system', {
      id: 'user-tim',
      name: 'Tim',
      email: 'tim@example.com',
    })
    const { token } = await createToken(db, 'design-system', 'ci')

    await renameProject(db, 'design-system', { slug: 'glue-ux' })

    expect((await findPart(db, 'glue-ux', 'R1'))?.title).toBe(
      'No text that describes the UI',
    )
    expect(
      (await listMembers(db, 'glue-ux')).map(({ email }) => email),
    ).toEqual(['tim@example.com'])
    expect((await findToken(db, token))?.project).toBe('glue-ux')
  })

  it('lets a reference from another Project follow the new address', async () => {
    await addProject(db, 'design-system', 'Design system')
    await addPart(db, 'design-system', {
      type: 'guardrail',
      title: 'No text that describes the UI',
      enforcedBy: 'review',
    })
    await answerPart(db, 'design-system', 'R1', { answer: 'supersede' })
    await addProjectReference(db, 'glue', 'design-system')
    await addPart(db, 'glue', {
      type: 'flow',
      title: 'Add a Part',
      body: 'Read #design-system/R1 and design-system#R1, not my-design-system#R1.',
    })

    await renameProject(db, 'design-system', { slug: 'glue-ux' })

    const flow = await findPart(db, 'glue', 'F1')
    expect(flow?.body).toBe(
      'Read #glue-ux/R1 and glue-ux#R1, not my-design-system#R1.',
    )
    expect(
      flow?.needs.map(({ part, project }) => `${project?.slug}/${part.id}`),
    ).toEqual(['glue-ux/R1'])
    expect(await canReference(db, 'glue', 'glue-ux')).toBe(true)
  })

  it('refuses the address of another Project, and changes nothing', async () => {
    await addProject(db, 'design-system', 'Design system')

    await expect(
      renameProject(db, 'design-system', { name: 'Glue UX', slug: 'glue' }),
    ).rejects.toThrow(
      new InvalidRecordError('project "glue" exists already', {
        field: 'slug',
      }),
    )

    expect(await findProduct(db, 'design-system')).toMatchObject({
      name: 'Design system',
    })
  })

  it.each(['api', 'sign-in', 'sign-up'])(
    'refuses the address %s of a fixed path of the app',
    async (slug) => {
      const refused = await renameProject(db, 'glue', { slug }).catch(
        (error: unknown) => error,
      )

      expect(refused).toMatchObject({
        message: `Glue uses the address "${slug}" itself`,
        place: { field: 'slug' },
      })
      expect(await findProduct(db, 'glue')).toBeDefined()
    },
  )

  it.each(['Glue UX', 'glue_ux', 'glue/ux', '-glue', ''])(
    'refuses the address "%s"',
    async (slug) => {
      const refused = await renameProject(db, 'glue', { slug }).catch(
        (error: unknown) => error,
      )

      expect(refused).toMatchObject({
        message: 'an address has lower case letters, digits and "-" only',
        place: { field: 'slug' },
      })
    },
  )

  it('refuses a name with no letter', async () => {
    const refused = await renameProject(db, 'glue', { name: '  ' }).catch(
      (error: unknown) => error,
    )

    expect(refused).toMatchObject({
      message: 'a Project needs a name',
      place: { field: 'name' },
    })
  })

  it('refuses an address that a Concept of the Project has', async () => {
    await addConcept(db, 'glue', { slug: 'part-model', title: 'Part model' })

    const refused = await renameProject(db, 'glue', {
      slug: 'part-model',
    }).catch((error: unknown) => error)

    expect(refused).toMatchObject({
      message: 'concept "part-model" exists already in the Project',
      place: { field: 'slug' },
    })
    expect(await findProduct(db, 'glue')).toBeDefined()
  })

  it('throws for a Project that does not exist', async () => {
    await expect(renameProject(db, 'nope', { name: 'Any' })).rejects.toThrow(
      ProductNotFoundError,
    )
  })
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
