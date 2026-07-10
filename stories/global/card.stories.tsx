import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const meta = {
  title: "Global/Card",
  component: Card,
  argTypes: {
    size: {
      control: "select",
      options: ["default", "sm"],
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Default card</CardTitle>
        <CardDescription>Card description or subtitle.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Card content area. Use for grouped information or actions.
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Action</Button>
        <Button size="sm" variant="ghost">Cancel</Button>
      </CardFooter>
    </Card>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <Card size="sm" className="w-80">
      <CardHeader>
        <CardTitle>Small card</CardTitle>
        <CardDescription>Compact variant with tighter spacing.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Same structure, more compact padding.
      </CardContent>
    </Card>
  ),
};
