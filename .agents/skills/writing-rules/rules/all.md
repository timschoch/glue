# Rules for every file

## 1. Who you write for

- 101 Write for someone who was not in the conversation. They did not read the chat or the ticket. Everything they need is on the page, or one link away.
- 102 Every claim names a file path, a command, or a real example. A sentence with none of the three is decoration — delete it.
- 103 Write the outcome, not the debate that produced it. "Use pnpm", never "we compared npm and yarn…". The why belongs in an ADR.
- 104 Structure beats prose: headings H1–H3, tables, keyword bullets, mermaid. Three paragraphs in a row with nothing between them is the limit.
- 105 Order: high level → detail, happy path → edge case. Open questions go last.
- 108 A heading names its subject and nothing else. The sentence goes in the first line below it.
- 109 A bullet holds three sentences at most. More means a table, a sub-bullet, or a paragraph.

## 2. Words and links

- 201 Use the repo's `CONTEXT.md` term, never a synonym. Missing there? Define it where you use it and raise the gap.
- 202 Link everything linkable: files, folders, docs, skills, issues — inside tables too. Link the section that owns the fact.
- 203 A path you name must exist.
- 204 Renamed a term? Rename it everywhere in the same PR. `git grep` the old word to prove none is left.
- 205 Point at a section by its anchor, never by its number — `§5` breaks when sections move.

## 3. Never

- 301 No chat residue: `as discussed`, `we agreed`, `the user asked`, `see above`.
- 302 Docs and comments say what is true now or what we build next, never what it was. History lives in ADRs and issues.
- 303 Never make the reader open a ticket to learn why. Write the reason, then link the ticket with number and title. A skill file names no ticket at all.
- 304 No em dash, no middot in prose destined for gated repos that ban them; a comma, colon or full stop does the job. (Fenced blocks, tables, headings, code spans are outside the rule.)

## 4. Where a statement lives

- 401 One piece of content lives in one file; every other file links to it. Exception: an ADR is a dated record and repeats what it needs.
- 403 Read `CONTEXT.md`, related docs and ADRs before writing. Never contradict quietly — fix the conflicting file in the same PR or say so out loud.
- 406 English for every repo artifact. UI copy follows the product's language.
- 409 Writing into a folder? Follow its `__template.md`, or the pattern of the five newest files there.
