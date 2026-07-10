import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const meta = {
  title: "Global/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
      <ConfirmDialogContent />
    </Dialog>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button />}>Settings dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure your workspace preferences.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">API Key</label>
            <Input placeholder="sk-…" type="password" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Dark mode</span>
            <Switch size="sm" />
          </div>
        </div>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
      <ConfirmDialogContent />
    </Dialog>
  ),
};

function ConfirmDialogContent() {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Confirm action</DialogTitle>
        <DialogDescription>
          This action cannot be undone. Are you sure you want to continue?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-4">
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button variant="destructive">Delete</Button>
      </DialogFooter>
    </DialogContent>
  );
}
