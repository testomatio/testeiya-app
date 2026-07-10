import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { SearchIcon } from "@/lib/icons";

const meta = {
  title: "Global/InputGroup",
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Showcase: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="example.com" />
      </InputGroup>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText><SearchIcon className="size-3.5" /></InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Search…" />
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="Enter email…" />
        <InputGroupAddon align="inline-end">
          <Button size="sm">Subscribe</Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};

export const WithAddonPrefix: Story = {
  render: () => (
    <div className="w-80">
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="example.com" />
      </InputGroup>
    </div>
  ),
};

export const WithButton: Story = {
  render: () => (
    <div className="w-80">
      <InputGroup>
        <InputGroupInput placeholder="Enter email…" />
        <InputGroupAddon align="inline-end">
          <Button size="sm">Subscribe</Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};
