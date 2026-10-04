import { ProgressIndicator, ProgressStep } from '@carbon/react'

export type StepBarProps = {
  // The name of the common flow, for example Insight to Decision.
  name: string
  steps: ReadonlyArray<string>
  // The position of the current step. The count of the steps: all are done.
  current: number
}

// The steps of one common flow, with the current step marked. The steps
// before it are done.
export function StepBar({ name, steps, current }: StepBarProps) {
  return (
    <ProgressIndicator aria-label={name} currentIndex={current}>
      {steps.map((step, position) => (
        <ProgressStep
          key={step}
          label={step}
          aria-current={position === current ? 'step' : undefined}
        />
      ))}
    </ProgressIndicator>
  )
}
