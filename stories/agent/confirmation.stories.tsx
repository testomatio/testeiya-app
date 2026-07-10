import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";

const meta = {
  title: "Agent/Confirmation",
  component: Confirmation,
  args: {
    state: "approval-requested",
  },
} satisfies Meta<typeof Confirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Confirmation approval={{ id: "appr_1" }} state="approval-requested">
      <ConfirmationTitle>
        The agent wants to run <code>rm -rf test-results/</code> to clear stale
        artifacts before the next Playwright run.
      </ConfirmationTitle>
      <ConfirmationRequest>
        <p className="text-muted-foreground text-sm">
          This deletes 214 files from the previous regression run.
        </p>
      </ConfirmationRequest>
      <ConfirmationActions>
        <ConfirmationAction variant="outline">Deny</ConfirmationAction>
        <ConfirmationAction>Allow</ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  ),
};

export const Approved: Story = {
  render: () => (
    <Confirmation
      approval={{ id: "appr_2", approved: true, reason: "Safe cleanup" }}
      state="output-available"
    >
      <ConfirmationTitle>
        Run <code>npx check-tests push -d .testeiya/manual-tests</code> to sync
        42 manual tests to Testomat.io.
      </ConfirmationTitle>
      <ConfirmationAccepted>
        <p className="text-muted-foreground text-sm">
          Approved — tests were pushed to the Checkout suite.
        </p>
      </ConfirmationAccepted>
    </Confirmation>
  ),
};

export const Rejected: Story = {
  render: () => (
    <Confirmation
      approval={{
        id: "appr_3",
        approved: false,
        reason: "Do not modify production data",
      }}
      state="output-denied"
    >
      <ConfirmationTitle>
        Delete the <code>Release v2.3 smoke</code> test plan and its 3 linked
        runs.
      </ConfirmationTitle>
      <ConfirmationRejected>
        <p className="text-muted-foreground text-sm">
          Denied — do not modify production data.
        </p>
      </ConfirmationRejected>
    </Confirmation>
  ),
};
