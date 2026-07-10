import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CopyIcon, EditIcon, ExternalLinkIcon, TrashIcon } from "@/lib/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const meta = {
  title: "Global/ContextMenu",
  component: ContextMenu,
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-36 w-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground select-none">
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <EditIcon /> Edit
        </ContextMenuItem>
        <ContextMenuItem>
          <CopyIcon /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem>
          <ExternalLinkIcon /> Open in Testomat.io
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <TrashIcon /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
