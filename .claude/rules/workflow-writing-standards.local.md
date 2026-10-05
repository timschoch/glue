# Writing standards: local pairs

Extends [workflow-writing-standards.md](workflow-writing-standards.md).

1. A record in Glue (title, body), an issue and a PR body count as output: run `unslop` on each. A reader who never saw the repo gets the title on the first read. One idea per title, no second rule glued on with "and".
   - Bad: "A Project holds Concepts that nest, and a Concept is assembled from Parts of seven types held by Joints"
   - Good: title "A Concept is built from Parts", body "A Project has Concepts. A Concept can hold smaller Concepts. Each Concept is built from Parts, for example a Goal or a Decision. A Joint says that one Part needs another."
2. An issue has two readers. Top: 2 to 4 plain sentences for the Owner, what changes for a user and why. Below `## Build`: the notes for agents, with files and commands.
   - Bad: an issue that opens with "Schema: a Joint can hold the Contract Version (nullable column on `joints`)".
   - Good: "When a Concept changes its Contract, the teams that built on the old one get a flag." then `## Build` and the steps.
