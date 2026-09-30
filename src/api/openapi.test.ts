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
    const product = '/api/v1/products/{product}'
    expect(routes.sort()).toEqual(
      [
        `get ${product}/concept`,
        ...['goals', 'decisions', 'insights', 'facts', 'guardrails'].flatMap(
          (folder) => [
            `get ${product}/${folder}`,
            `get ${product}/${folder}/{recordId}`,
          ],
        ),
        `post ${product}/goals`,
        `post ${product}/insights`,
        `post ${product}/decisions`,
        `post ${product}/facts`,
        `patch ${product}/goals/{recordId}`,
        `patch ${product}/decisions/{recordId}`,
        `post ${product}/measure`,
      ].sort(),
    )
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
        'InsightInput',
        'FactInput',
        'Error',
      ]),
    )
  })
})
