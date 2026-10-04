import { describe, expect, it } from 'vitest'

import { handleGetOpenApi } from './openapi.ts'

describe('GET /api/v1/openapi.json', () => {
  it('returns an OpenAPI 3.1 document that names every route', async () => {
    const response = handleGetOpenApi()
    const document = JSON.parse(await response.text())

    expect(response.status).toBe(200)
    expect(document.openapi).toBe('3.1.0')
    const routes = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item as object).map((method) => `${method} ${path}`),
    )
    expect(routes.sort()).toEqual(
      ['post /api/v1/products/{product}/measure']
        .concat(
          [
            'get ',
            'get /concepts/{concept}',
            'post /concepts',
            'get /concepts/{concept}/contract',
            'post /concepts/{concept}/contract',
            'get /parts',
            'post /parts',
            'get /parts/{recordId}',
            'patch /parts/{recordId}',
            'post /parts/{recordId}/answers',
            'post /parts/{recordId}/question-answers',
            'get /mine',
            'get /signals',
            'post /signals/insights',
            'get /builds',
            'post /joints',
            'delete /joints/{jointId}',
            'get /members',
            'post /members',
            'get /assignments',
            'post /assignments',
            'delete /assignments',
            'post /measure',
          ].map((route) => route.replace(' ', ' /api/v1/projects/{project}')),
        )
        .sort(),
    )
  })

  it('describes the Part model: what each answer holds and what each request takes', async () => {
    const document = await handleGetOpenApi().json()
    const root = document.paths['/api/v1/projects/{project}']
    const parts = document.paths['/api/v1/projects/{project}/parts']
    const { schemas } = document.components

    expect(root.get.responses[200].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Project',
    })
    expect(parts.get.parameters).toContainEqual(
      expect.objectContaining({ in: 'query', name: 'type' }),
    )
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        'Project',
        'ConceptNode',
        'ProjectConcept',
        'PartSummary',
        'Part',
        'ChangedPart',
        'ConceptInput',
        'PartInput',
        'PartUpdate',
        'JointInput',
      ]),
    )
    expect(schemas.Part.properties.evidenceLevel.anyOf).toContainEqual({
      type: 'string',
      enum: ['hunch', 'pattern', 'confirmed'],
    })
    expect(JSON.stringify(schemas.PartInput)).toContain('"entity"')
  })

  it('describes the Contract of a Concept: the Version, the checksum and the two tiers', async () => {
    const document = await handleGetOpenApi().json()
    const contract =
      document.paths['/api/v1/projects/{project}/concepts/{concept}/contract']
    const { Contract } = document.components.schemas

    expect(contract.get.operationId).toBe('getContract')
    expect(contract.get.parameters).toContainEqual(
      expect.objectContaining({ in: 'query', name: 'version' }),
    )
    expect(contract.post.operationId).toBe('signContract')
    expect(
      contract.post.requestBody.content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/ContractSignInput' })
    expect(Object.keys(Contract.properties)).toEqual(
      expect.arrayContaining([
        'version',
        'checksum',
        'tier1',
        'tier2',
        'slots',
      ]),
    )
    expect(Contract.properties.tier1.items).toEqual({
      $ref: '#/components/schemas/FrozenPart',
    })
  })

  it('describes Trust, the Work state, the flags and the answers', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components
    const root = '/api/v1/projects/{project}'
    const answers = document.paths[`${root}/parts/{recordId}/answers`].post
    const mine = document.paths[`${root}/mine`].get

    expect(schemas.PartSummary.properties.trust.enum).toEqual([
      'solid',
      'flagged',
      'not-ready',
      'wrong',
    ])
    expect(schemas.PartSummary.properties.workState.enum).toEqual([
      'to-check',
      'waiting',
      'draft',
      'review',
      'published',
      'sunk',
    ])
    expect(schemas.Part.required).toEqual(
      expect.arrayContaining(['flags', 'waitsOn']),
    )
    expect(answers.operationId).toBe('answerPart')
    expect(answers.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/AnswerInput',
    })
    for (const answer of [
      'fine',
      'wait',
      'need-time',
      'not-ready',
      'supersede',
      'sink',
    ]) {
      expect(JSON.stringify(schemas.AnswerInput)).toContain(`"${answer}"`)
    }
    expect(answers.responses[200].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ChangedPart',
    })
    expect(mine.operationId).toBe('listMine')
    expect(mine.responses[200].content['application/json'].schema).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/PartSummary' },
    })
  })

  it('describes the question of a Decision and its answer', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components
    const answer =
      document.paths[
        '/api/v1/projects/{project}/parts/{recordId}/question-answers'
      ].post

    expect(answer.operationId).toBe('answerQuestion')
    expect(answer.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/QuestionAnswerInput',
    })
    expect(JSON.stringify(schemas.QuestionAnswerInput)).toContain('"option"')
    expect(JSON.stringify(schemas.QuestionAnswerInput)).toContain('"text"')
    expect(schemas.Part.required).toEqual(
      expect.arrayContaining(['question', 'unchosen']),
    )
    expect(JSON.stringify(schemas.PartInput)).toContain('"options"')
  })

  it('describes the issue of a Decision in the answer, and in no request', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components

    expect(schemas.Part.properties.issueUrl).toBeDefined()
    expect(JSON.stringify(schemas.PartInput)).not.toContain('issueUrl')
    expect(JSON.stringify(schemas.PartUpdate)).not.toContain('issueUrl')
  })

  it('describes the Evidence level of an Insight and the source of a Guardrail', async () => {
    const { schemas } = (await handleGetOpenApi().json()).components

    expect(schemas.Part.required).toContain('evidenceLevel')
    expect(schemas.Part.required).toContain('source')
  })

  it('marks every products route as deprecated, and no projects route', async () => {
    const document = await handleGetOpenApi().json()
    const deprecatedByRoot: Record<string, Array<boolean>> = {}
    for (const [path, item] of Object.entries(document.paths)) {
      const root = path.split('/')[3]
      const operations = Object.values(item as object)
      deprecatedByRoot[root] = (deprecatedByRoot[root] ?? []).concat(
        operations.map((operation) => operation.deprecated === true),
      )
    }

    expect(new Set(deprecatedByRoot.products)).toEqual(new Set([true]))
    expect(new Set(deprecatedByRoot.projects)).toEqual(new Set([false]))
  })

  it('gives every operation its own id', async () => {
    const document = await handleGetOpenApi().json()
    const ids = Object.values(document.paths).flatMap((item) =>
      Object.values(item as object).map((operation) => operation.operationId),
    )

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('getProjectConcept')
  })

  it('describes the bearer token and the shared schemas', async () => {
    const document = await handleGetOpenApi().json()

    expect(document.components.securitySchemes.token).toEqual({
      type: 'http',
      scheme: 'bearer',
    })
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        'GoalMeasure',
        'MeasureResult',
        'MeasuredInsight',
        'SkippedGoal',
        'Error',
      ]),
    )
  })

  it('describes no way to add a Fact: a Fact is no longer a type', async () => {
    const { schemas } = (await handleGetOpenApi().json()).components

    expect(JSON.stringify(schemas.PartInput)).not.toContain('"fact"')
    expect(Object.keys(schemas)).not.toContain('FactInput')
  })

  it('describes the downstream issue of a Decision', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components
    const parts = document.paths['/api/v1/projects/{project}/parts']
    const part = document.paths['/api/v1/projects/{project}/parts/{recordId}']
    const changed = { $ref: '#/components/schemas/ChangedPart' }

    expect(schemas.Part.properties.issueUrl).toEqual({
      type: ['string', 'null'],
    })
    expect(schemas.ChangedPart.properties.issueError).toMatchObject({
      type: 'string',
    })
    expect(
      parts.post.responses[201].content['application/json'].schema,
    ).toEqual(changed)
    expect(
      part.patch.responses[200].content['application/json'].schema,
    ).toEqual(changed)
  })

  it('describes the Goal status, its progress and the two measure kinds', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components

    expect(JSON.stringify(schemas.PartInput)).toContain(
      '"status":{"type":"string","enum":["open","achieved"]}',
    )
    expect(Object.keys(schemas.PartMeasure.properties)).toEqual(
      expect.arrayContaining([
        'baseline',
        'latestValue',
        'latestBreakdownValue',
        'measuredAt',
      ]),
    )
    expect(Object.keys(schemas.MeanMeasure.properties)).toContain(
      'baseline_value',
    )
    expect(schemas.GoalMeasure.oneOf).toEqual([
      { $ref: '#/components/schemas/FunnelMeasure' },
      { $ref: '#/components/schemas/MeanMeasure' },
    ])
  })

  it('describes the Decision that a new Decision supersedes', async () => {
    const { PartInput } = (await handleGetOpenApi().json()).components.schemas
    const decision = PartInput.oneOf.find(
      (input: { properties: { type: { const: string } } }) =>
        input.properties.type.const === 'decision',
    )

    expect(decision.properties.supersedes).toMatchObject({ type: 'string' })
  })
})
