import type { Meta, StoryObj } from '@storybook/react-vite'

import { CredentialsForm } from './credentials-form.tsx'
import { PlainFrame } from './frame.tsx'

const meta = {
  title: 'Credentials form',
  component: CredentialsForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    title: 'Sign in to Glue',
    action: 'Sign in',
    pendingAction: 'Signing in',
    passwordAutoComplete: 'current-password',
    other: { name: 'Make an account', href: '#' },
    onSubmit: () => {},
    onOpen: (_href, event) => event.preventDefault(),
  },
} satisfies Meta<typeof CredentialsForm>

export default meta

type Story = StoryObj<typeof meta>

export const SignIn: Story = {}

export const SignUp: Story = {
  args: {
    title: 'Make an account',
    action: 'Make account',
    pendingAction: 'Making the account',
    withName: true,
    passwordAutoComplete: 'new-password',
    passwordPlaceholder: '8 characters or more',
    other: { name: 'Sign in', href: '#' },
  },
}

export const Pending: Story = { args: { pending: true } }

export const WrongFields: Story = {
  args: {
    ...SignUp.args,
    problems: {
      name: 'Enter your name.',
      email: 'Enter an email address, such as ada@example.com.',
      password: 'The password must have 8 characters or more.',
    },
  },
}

export const Failed: Story = {
  args: { failure: 'The email or the password is wrong.' },
}

export const NarrowWindow: Story = {
  args: { ...WrongFields.args, failure: Failed.args?.failure },
  globals: { viewport: { value: 'mobile1' } },
}
