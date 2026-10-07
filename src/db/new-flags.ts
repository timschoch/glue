import { sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'

// The new flags of a member (glue/D61): the open flags that the member can
// answer and did not see yet. The count beside Mine is the notice: Glue
// sends no mail for a flag.
//
// A flag goes only to a person who can act. So the flags are the ones of
// the Parts where the member is Responsible, and of the Parts with no
// Responsible, which each member answers. A Part that waits is answered.

// The new flags of the member with the e-mail address in the Project, as
// the `from` and the `where` of a select. "flags" and "members" name the
// flag and the member.
function fromNewFlags(projectSlug: string, memberEmail: string) {
  return sql`
    from "flags"
    join "parts" on "parts"."id" = "flags"."part_id"
    join "projects" on "projects"."id" = "parts"."project_id"
    join "members" on "members"."project_id" = "projects"."id"
    where "projects"."slug" = ${projectSlug}::text
      and lower("members"."email") = lower(${memberEmail}::text)
      and "flags"."closed_at" is null
      and "parts"."work_state" <> 'waiting'
      and not exists (
        select 1 from "assignments"
        where "assignments"."part_id" = "parts"."id"
          and "assignments"."role" = 'responsible'
          and "assignments"."member_id" <> "members"."id"
      )
      and not exists (
        select 1 from "seen_flags"
        where "seen_flags"."flag_id" = "flags"."id"
          and "seen_flags"."member_id" = "members"."id"
      )`
}

// The member saw the new flags: Mine showed them. A flag that opens later
// is new.
export async function setFlagsSeen(
  db: ConceptDb,
  projectSlug: string,
  memberEmail: string,
): Promise<void> {
  await db.execute(sql`
    insert into "seen_flags" ("flag_id", "member_id")
    select "flags"."id", "members"."id"
    ${fromNewFlags(projectSlug, memberEmail)}
    on conflict do nothing
  `)
}

const countSchema = z.object({
  rows: z.tuple([z.object({ count: z.number() })]),
})

// The count of the new flags of the member. A person who is no member of
// the Project has none.
export async function getNewFlagCount(
  db: ConceptDb,
  projectSlug: string,
  memberEmail: string,
): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::integer as "count"
    ${fromNewFlags(projectSlug, memberEmail)}
  `)
  return countSchema.parse(result).rows[0].count
}
