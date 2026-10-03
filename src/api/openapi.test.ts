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
      ['/api/v1/projects/{project}', '/api/v1/products/{product}']
        .flatMap((root) => [
          `get ${root}/concept`,
          ...['goals', 'decisions', 'insights', 'facts', 'guardrails'].flatMap(
            (folder) => [
              `get ${root}/${folder}`,
              `get ${root}/${folder}/{recordId}`,
            ],
          ),
          `post ${root}/goals`,
          `post ${root}/insights`,
          `post ${root}/decisions`,
          `post ${root}/facts`,
          `patch ${root}/goals/{recordId}`,
          `patch ${root}/decisions/{recordId}`,
          `post ${root}/measure`,
        ])
        .sort(),
    )
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
    expect(ids).toContain('getConcept')
  })

  it('describes the bearer token and the shared schemas', async () => {
    const document = await handleGetOpenApi().json()

    expect(document.components.securitySchemes.token).toEqual({
      type: 'http',
      scheme: 'bearer',
    })
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        'Concept',
        'Decision',
        'DecisionInput',
        'DecisionUpdate',
        'GoalInput',
        'GoalUpdate',
        'GoalMeasure',
        'MeasuredInsight',
        'SkippedGoal',
        'InsightInput',
        'FactInput',
        'Error',
      ]),
    )
  })

  it('describes the downstream issue of a Decision', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components
    const decisions = document.paths['/api/v1/projects/{project}/decisions']
    const decision =
      document.paths['/api/v1/projects/{project}/decisions/{recordId}']
    const changed = { $ref: '#/components/schemas/ChangedDecision' }

    expect(schemas.Decision.properties.issueUrl).toMatchObject({
      anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }],
    })
    expect(schemas.ChangedDecision.properties.issueError).toMatchObject({
      type: 'string',
    })
    expect(
      decisions.post.responses[201].content['application/json'].schema,
    ).toEqual(changed)
    expect(
      decision.patch.responses[200].content['application/json'].schema,
    ).toEqual(changed)
  })

  it('describes the Goal status, its progress and the two measure kinds', async () => {
    const document = await handleGetOpenApi().json()
    const { schemas } = document.components

    expect(schemas.Goal.properties.status).toMatchObject({
      enum: ['open', 'achieved'],
    })
    expect(Object.keys(schemas.Goal.properties)).toEqual(
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
    expect(schemas.GoalUpdate.properties.status).toMatchObject({
      enum: ['open', 'achieved'],
    })
    expect(schemas.GoalMeasure.oneOf).toEqual([
      { $ref: '#/components/schemas/FunnelMeasure' },
      { $ref: '#/components/schemas/MeanMeasure' },
    ])
  })

  it('describes the Decision that a new Decision supersedes', async () => {
    const document = await handleGetOpenApi().json()

    expect(
      document.components.schemas.DecisionInput.properties.supersedes,
    ).toMatchObject({ type: 'string' })
  })
})
