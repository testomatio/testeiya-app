import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation";

const meta = {
  title: "Agent/InlineCitation",
  component: InlineCitation,
} satisfies Meta<typeof InlineCitation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <p className="max-w-xl text-sm leading-relaxed">
      Retries should stay a diagnostic tool for flaky tests, not a way to hide
      them.
      <InlineCitation>
        <InlineCitationText>
          {" "}
          Playwright recommends quarantining flaky specs and fixing the root
          cause instead of raising the retry count
        </InlineCitationText>
        <InlineCitationCard>
          <InlineCitationCardTrigger
            sources={[
              "https://playwright.dev/docs/test-retries",
              "https://testomat.io/blog/flaky-tests",
            ]}
          />
          <InlineCitationCardBody>
            <InlineCitationCarousel>
              <InlineCitationCarouselHeader>
                <InlineCitationCarouselPrev />
                <InlineCitationCarouselNext />
                <InlineCitationCarouselIndex />
              </InlineCitationCarouselHeader>
              <InlineCitationCarouselContent>
                <InlineCitationCarouselItem>
                  <InlineCitationSource
                    title="Test retries | Playwright"
                    url="https://playwright.dev/docs/test-retries"
                    description="Playwright Test will retry failing tests when the retries option is set, and classifies them as flaky when they pass on retry."
                  />
                  <InlineCitationQuote>
                    Flaky tests pass on retry — track them and fix the
                    underlying instability.
                  </InlineCitationQuote>
                </InlineCitationCarouselItem>
                <InlineCitationCarouselItem>
                  <InlineCitationSource
                    title="Dealing with flaky tests"
                    url="https://testomat.io/blog/flaky-tests"
                    description="Quarantine flaky tests into a dedicated run so they stop blocking releases while the team investigates."
                  />
                </InlineCitationCarouselItem>
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
      .
    </p>
  ),
};
