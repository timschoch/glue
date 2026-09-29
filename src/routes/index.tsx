import { createFileRoute } from '@tanstack/react-router'
import { Container, Text, Title } from '@mantine/core'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <Container size="sm" py="xl">
      <Title order={1}>Glue</Title>
      <Text c="dimmed" mt="sm">
        The concept hub for any product: why it is built the way it is.
      </Text>
    </Container>
  )
}
