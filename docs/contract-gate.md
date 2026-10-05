# The Contract gate in your repository

The gate checks each pull request against the Concept of your Project. It answers `holds` or `breaks`. Glue keeps the newest answer with the build and shows it on the Builds screen. The words are in the [glossary](../GLOSSARY.md).

Example: pull request 12 of `timschoch/flexibeck-next` names `Contract: videos@1`. The newest Version of `videos` is 2. The gate answers `breaks`, and the check of the pull request fails.

## 1. Set the repository of the Project

Glue accepts a pull request only from the repository of the Project.

```sh
pnpm concept project set <slug> --repository <owner/name>
```

## 2. Make a token

```sh
pnpm concept token create --project <slug> --name ci
```

The command prints the token once. Save it as the secret `GLUE_API_TOKEN` of your repository. A token works for one Project.

## 3. Name what the pull request builds

The body of the pull request has one of these lines:

- `Contract: <concept>@<version>` for a build from a Contract Version.
- `Decision: D12` for a build from Decisions. A Decision of a Project that yours references is `Decision: glue/D12`.

## 4. Add the one line to your CI

With the Glue command line ([scripts/gate.ts](../scripts/gate.ts)):

```sh
pnpm concept gate --pr <number> --project <slug>
```

It reads `GLUE_API_TOKEN` and `GITHUB_REPOSITORY`. GitHub Actions sets `GITHUB_REPOSITORY`. A private repository needs `GITHUB_TOKEN` too. The command exits 1 on `breaks`.

Without the command line, send the pull request to the HTTP API. This step of GitHub Actions does it:

```yaml
- env:
    GLUE_API_TOKEN: ${{ secrets.GLUE_API_TOKEN }}
  run: |
    jq '{repository: .repository.full_name, number: .pull_request.number, body: (.pull_request.body // "")}' "$GITHUB_EVENT_PATH" \
      | curl --silent --request POST --data @- \
          --header "Authorization: Bearer $GLUE_API_TOKEN" \
          --header 'Content-Type: application/json' \
          https://glue-glue-glue.vercel.app/api/v1/projects/<slug>/gate \
      | tee /dev/stderr | jq --exit-status '.result == "holds"' > /dev/null
```

The answer:

```json
{
  "result": "breaks",
  "reasons": [
    "Contract \"videos@1\" is not the newest Version. Build with \"videos@2\": `pnpm concept contract show videos`."
  ],
  "checkedAt": "2026-10-05T09:00:00.000Z"
}
```

The OpenAPI document at `/api/v1/openapi.json` describes the call as the operation `validateBuild` ([src/api/openapi.ts](../src/api/openapi.ts)).

## What `breaks` means

The pull request does not match the Concept of today. Each reason says what to do.

| Reason                                     | Do this                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| The Contract Version is not the newest     | Read the newest Version, change the build, name the newest Version |
| A Decision is sunk                         | Name an accepted Decision                                          |
| A Decision is superseded                   | Name the Decision that the reason gives                            |
| A Decision does not exist                  | Correct the id                                                     |
| The body names no Decision and no Contract | Add the `Contract:` line or the `Decision:` line                   |

Run the check again after each change to the body of the pull request.
