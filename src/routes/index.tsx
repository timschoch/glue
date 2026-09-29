import { createFileRoute } from '@tanstack/react-router'
import { Container, Text, Title } from '@mantine/core'
import { DecisionCard } from '../components/decisions/decision-card'
import type { Decision } from '../components/decisions/decision-card'

export const Route = createFileRoute('/')({ component: Home })

const concept = 'https://github.com/timschoch/glue/blob/main/concept'

// A sample: Decision D6 from concept/, as static data.
const decision: Decision = {
  id: 'D6',
  title:
    'One hallmark run sets the design direction, design.md plus a Mantine theme and CSS variables that every screen uses',
  href: `${concept}/decisions/D6-design-direction-from-hallmark.md`,
  date: '2026-09-29',
  owner: 'Orchestrator',
  status: 'accepted',
  goal: {
    id: 'G1',
    title: 'Run goal',
    href: `${concept}/goals/G1-run-goal.md`,
  },
  evidence: [
    {
      id: 'F4',
      title:
        'The first UI ticket runs hallmark once, output design.md and tokens as a Mantine theme and CSS variables',
      href: `${concept}/facts/F4-first-ui-ticket-runs-hallmark.md`,
    },
  ],
}

function Home() {
  return (
    <Container component="main" size="sm" py="xl">
      <Title order={1}>Glue</Title>
      <Text c="dimmed" mt="xs" mb="lg">
        The concept hub for any product: why it is built the way it is.
      </Text>
      <DecisionCard decision={decision} />
    </Container>
  )
}
