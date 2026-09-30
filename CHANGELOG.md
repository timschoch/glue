# Changelog

## [1.5.1](https://github.com/timschoch/glue/compare/v1.5.0...v1.5.1) (2026-09-30)


### Bug Fixes

* **mock-analytics:** lighter identify query, chain tests, values stringify ([#89](https://github.com/timschoch/glue/issues/89)) ([1763325](https://github.com/timschoch/glue/commit/176332563e6959855522001603d8e47f788989f8)), closes [#85](https://github.com/timschoch/glue/issues/85)
* **user-sim:** take flexibeck's closest plan when no plan fits ([#87](https://github.com/timschoch/glue/issues/87)) ([9235bcf](https://github.com/timschoch/glue/commit/9235bcf13324e2024d786298f9c672a2fcc6d5a1)), closes [#81](https://github.com/timschoch/glue/issues/81)

## [1.5.0](https://github.com/timschoch/glue/compare/v1.4.0...v1.5.0) (2026-09-30)


### Features

* **app:** show Goal progress and close a Goal as achieved ([#80](https://github.com/timschoch/glue/issues/80)) ([46e531c](https://github.com/timschoch/glue/commit/46e531c1ee8cb4509db381b1ad766fd02636cb79))
* **mock-analytics:** read property values and merge identified persons ([#84](https://github.com/timschoch/glue/issues/84)) ([4b79fa1](https://github.com/timschoch/glue/commit/4b79fa14d7465144cc4d67e4c01b5048355f2903)), closes [#79](https://github.com/timschoch/glue/issues/79) [#78](https://github.com/timschoch/glue/issues/78)
* **user-sim:** walk live flexibeck, answer the SEQ, add worked example rule ([#82](https://github.com/timschoch/glue/issues/82)) ([0cdb21b](https://github.com/timschoch/glue/commit/0cdb21b791fd9e124d2962d35e064fc94623987c))

## [1.4.0](https://github.com/timschoch/glue/compare/v1.3.0...v1.4.0) (2026-09-30)


### Features

* **measure:** record the sentiment of public comments as draft Insights ([#75](https://github.com/timschoch/glue/issues/75)) ([6ad5a47](https://github.com/timschoch/glue/commit/6ad5a477580c4d34293c5a34aab91528e156f822))

## [1.3.0](https://github.com/timschoch/glue/compare/v1.2.0...v1.3.0) (2026-09-30)


### Features

* **measure:** measure a Goal by the mean of an event property and close it as achieved ([#76](https://github.com/timschoch/glue/issues/76)) ([aa98bf2](https://github.com/timschoch/glue/commit/aa98bf2bb21d358605737d212b20a159c35bc88d))

## [1.2.0](https://github.com/timschoch/glue/compare/v1.1.0...v1.2.0) (2026-09-30)


### Features

* **app:** triage draft Insights and propose, accept or supersede Decisions ([#60](https://github.com/timschoch/glue/issues/60)) ([7d38ca7](https://github.com/timschoch/glue/commit/7d38ca7a3fa81eab18fe16a30ab203514adfe38a))

## [1.1.0](https://github.com/timschoch/glue/compare/v1.0.0...v1.1.0) (2026-09-30)


### Features

* **downstream:** accepted Decisions open a GitHub issue in the Product's repository ([#57](https://github.com/timschoch/glue/issues/57)) ([f697831](https://github.com/timschoch/glue/commit/f6978317f077fc589e7bfd30203208cbf7ccd643))
* **measure:** measure Goals from mock analytics into draft Insights ([#51](https://github.com/timschoch/glue/issues/51)) ([45e4743](https://github.com/timschoch/glue/commit/45e47434d9258c696757690b6fbab3ad559ff0ed))
* **mocks:** add user-sim, browser bots whose choices depend on the screen ([#64](https://github.com/timschoch/glue/issues/64)) ([bfa6cc8](https://github.com/timschoch/glue/commit/bfa6cc8e7573871848043ab91e7f2f33c3c29e9c))


### Bug Fixes

* **guard:** a test file is not a UI change ([#63](https://github.com/timschoch/glue/issues/63)) ([e5204f8](https://github.com/timschoch/glue/commit/e5204f8eccea6ba8229f7cdb9d4e5881174c5d6f))
* **release:** run the release PR's required checks instead of faking them ([#67](https://github.com/timschoch/glue/issues/67)) ([3aa5748](https://github.com/timschoch/glue/commit/3aa57483f5f91e6078bc61875e9029fe1192bc1d)), closes [#66](https://github.com/timschoch/glue/issues/66)

## 1.0.0 (2026-09-30)


### Features

* **api:** Concept HTTP API with a token per Product, described in OpenAPI ([#45](https://github.com/timschoch/glue/issues/45)) ([e5d4b34](https://github.com/timschoch/glue/commit/e5d4b3428c2b3398dd9410eb928f3d94c733f4b4)), closes [#38](https://github.com/timschoch/glue/issues/38)
* **concept-view:** show the Concept read-only behind Neon Auth sign-in ([#36](https://github.com/timschoch/glue/issues/36)) ([15d2ea2](https://github.com/timschoch/glue/commit/15d2ea26313c1c32bafd62998d1b39fcf8face45))
* **concept:** add Ring 0 Concept as files in concept/ ([#13](https://github.com/timschoch/glue/issues/13)) ([a937157](https://github.com/timschoch/glue/commit/a93715770c446553a255b4a3c039968ab1d233ff))
* **concept:** collect GitHub findings as draft Insights ([#16](https://github.com/timschoch/glue/issues/16)) ([05ef7ed](https://github.com/timschoch/glue/commit/05ef7edee6075f97d6fadb39bee1fb7e5f1bc558))
* **concept:** Concept tables in Neon Postgres, import from concept/ ([#21](https://github.com/timschoch/glue/issues/21)) ([3bd4e86](https://github.com/timschoch/glue/commit/3bd4e86b9f9fd2c076f4acd8bfb230894e1c108e))
* **concept:** pnpm concept CLI to read and add Concept records ([#30](https://github.com/timschoch/glue/issues/30)) ([14b8a24](https://github.com/timschoch/glue/commit/14b8a2471b3386cc54c9f0ac6aaa2a52a91e643b))
* **design:** set the design direction with tokens and a Mantine theme ([#27](https://github.com/timschoch/glue/issues/27)) ([e074c9b](https://github.com/timschoch/glue/commit/e074c9b55a242fb2d06c47bc9ce9d0d523fc5789))
* **measure:** write draft Insights to the database ([#26](https://github.com/timschoch/glue/issues/26)) ([51192e0](https://github.com/timschoch/glue/commit/51192e031808d5d5446949f4d86719c7f61d4189))
* **mock-analytics:** PostHog capture protocol and funnel queries ([#43](https://github.com/timschoch/glue/issues/43)) ([b761ec2](https://github.com/timschoch/glue/commit/b761ec29d19f1f01a2aceedacfc431c49abf9f47))
* **pr-gate:** read Decisions from the database ([#25](https://github.com/timschoch/glue/issues/25)) ([7e96d0e](https://github.com/timschoch/glue/commit/7e96d0e7a6a8f0d1e99f6edaf403128f630b7fe0))
* **pr-gate:** require the Decision line to cite an existing id ([#15](https://github.com/timschoch/glue/issues/15)) ([f9af18d](https://github.com/timschoch/glue/commit/f9af18d26756bdd17a0a3070b97c93a7d5c79f98))
* scaffold TanStack Start app with Mantine ([7b6bc62](https://github.com/timschoch/glue/commit/7b6bc62e3ecc8e50679cd470b93085153e25116f))


### Bug Fixes

* **concept-view:** bigger record links, keep the signed-in frame on errors ([#44](https://github.com/timschoch/glue/issues/44)) ([0d9fd1a](https://github.com/timschoch/glue/commit/0d9fd1a256d2965fc74e73a39b52861ab40a7cd7)), closes [#37](https://github.com/timschoch/glue/issues/37)
* **concept:** no duplicate evidence links, ordered list, session redirect, PATCH guards ([#47](https://github.com/timschoch/glue/issues/47)) ([0ff98ed](https://github.com/timschoch/glue/commit/0ff98ed82d17e251a3b0cc1f55c589855aaa50c9))
* **guard:** keep the interface-review verdict when no UI file changed after it ([#42](https://github.com/timschoch/glue/issues/42)) ([987c6cf](https://github.com/timschoch/glue/commit/987c6cf96d063a484c6b2c26d5dda4c66b972dd3))
* make verify gate and lint work with pnpm and vendored skills ([dd810bc](https://github.com/timschoch/glue/commit/dd810bc1f64a65d47179cd21313a7844f530a6a5))
* **release:** find the release PR by its label to pass its gate checks ([#52](https://github.com/timschoch/glue/issues/52)) ([e8ca5cb](https://github.com/timschoch/glue/commit/e8ca5cba1c25830f715402a57a72d2b32455ce4e)), closes [#48](https://github.com/timschoch/glue/issues/48)
