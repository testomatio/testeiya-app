import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const meta = {
  title: "Global/Drawer",
  component: Drawer,
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Drawer showSwipeHandle>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DemoDrawerContent />
    </Drawer>
  ),
};

export const FromRight: Story = {
  render: () => (
    <Drawer swipeDirection="right">
      <DrawerTrigger render={<Button variant="outline" />}>Open right drawer</DrawerTrigger>
      <DemoDrawerContent />
    </Drawer>
  ),
};

export const Open: Story = {
  render: () => (
    <Drawer defaultOpen showSwipeHandle>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DemoDrawerContent />
    </Drawer>
  ),
};

function DemoDrawerContent() {
  return (
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Sync test cases</DrawerTitle>
        <DrawerDescription>Pull the latest manual tests from Testomat.io into this workspace.</DrawerDescription>
      </DrawerHeader>
      <div className="px-4 py-3 text-sm text-muted-foreground">
        12 test cases will be updated. Local changes that were not pushed may be overwritten.
      </div>
      <DrawerFooter>
        <Button>Pull tests</Button>
        <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  );
}
