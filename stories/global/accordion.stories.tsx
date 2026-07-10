import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const meta = {
  title: "Global/Accordion",
  component: Accordion,
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion className="border rounded-lg divide-y divide-border max-w-lg">
      <AccordionItem value="item-1">
        <AccordionTrigger className="px-4">What is Testeiya?</AccordionTrigger>
        <AccordionContent className="px-4 pb-3 text-muted-foreground">
          Testeiya is an AI-powered QA agent that helps you manage and run your test cases.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger className="px-4">How does it work?</AccordionTrigger>
        <AccordionContent className="px-4 pb-3 text-muted-foreground">
          It connects to your Testomat.io project, pulls test cases, and lets an AI agent run
          them interactively.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger className="px-4">Is it open source?</AccordionTrigger>
        <AccordionContent className="px-4 pb-3 text-muted-foreground">
          Parts of the stack are open. Check the repository for details.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
