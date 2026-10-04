import {
  Checkbox,
  CheckboxGroup,
  InlineNotification,
  Select,
  SelectItem,
} from '@carbon/react'
import { useId } from 'react'

import styles from './people.module.scss'

export type AssigneeRole = 'responsible' | 'co-author'

export type AssigneesProps = {
  // The members of the Project.
  members: ReadonlyArray<{ id: number; name: string }>
  // The member id of the Responsible.
  responsible: number | null
  // The member ids of the Co-Authors.
  coAuthors: ReadonlyArray<number>
  // Gives the member the role, or takes the role away with null. Without
  // the callback the person reads only.
  onChange?: (change: { memberId: number; role: AssigneeRole | null }) => void
  // Why the last change failed.
  error?: string
}

// Who holds a Concept or a Part: the one Responsible and the Co-Authors. A
// member changes them here.
export function Assignees({
  members,
  responsible,
  coAuthors,
  onChange,
  error,
}: AssigneesProps) {
  const id = useId()
  const names = (ids: ReadonlyArray<number>) =>
    members
      .filter((member) => ids.includes(member.id))
      .map(({ name }) => name)
      .join(', ')

  if (!onChange) {
    const values = [
      ['Responsible', names(responsible === null ? [] : [responsible])],
      ['Co-Authors', names(coAuthors)],
    ].filter(([, value]) => value !== '')
    if (values.length === 0) return null
    return (
      <dl className={styles.assignees}>
        {values.map(([label, value]) => (
          <div key={label} className={styles.value}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <div className={styles.assignees}>
      <div className={styles.responsible}>
        <Select
          id={`${id}-responsible`}
          size="sm"
          labelText="Responsible"
          value={responsible ?? ''}
          onChange={({ target }) => {
            if (target.value !== '') {
              onChange({ memberId: Number(target.value), role: 'responsible' })
            } else if (responsible !== null) {
              onChange({ memberId: responsible, role: null })
            }
          }}
        >
          <SelectItem value="" text="" />
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id} text={member.name} />
          ))}
        </Select>
      </div>
      {members.length > (responsible === null ? 0 : 1) && (
        <CheckboxGroup legendText="Co-Authors" orientation="horizontal">
          {members
            .filter((member) => member.id !== responsible)
            .map((member) => (
              <Checkbox
                key={member.id}
                id={`${id}-${member.id}`}
                labelText={member.name}
                checked={coAuthors.includes(member.id)}
                onChange={(_event, { checked }) =>
                  onChange({
                    memberId: member.id,
                    role: checked ? 'co-author' : null,
                  })
                }
              />
            ))}
        </CheckboxGroup>
      )}
      {error !== undefined && (
        <InlineNotification
          kind="error"
          role="alert"
          lowContrast
          hideCloseButton
          title={error}
        />
      )}
    </div>
  )
}
