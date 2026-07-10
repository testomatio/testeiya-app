import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/data-table/sortable";
import { GripVerticalIcon } from "@/lib/icons";

const initialItems = [
  { id: "status", label: "Status" },
  { id: "suite", label: "Suite" },
  { id: "test", label: "Test" },
  { id: "message", label: "Message" },
  { id: "time", label: "Time" },
];

const meta = {
  title: "Widget/Sortable",
  component: Sortable,
  args: { value: initialItems },
} satisfies Meta<typeof Sortable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SortableColumnsDemo />,
};

export const Horizontal: Story = {
  render: () => <SortableChipsDemo />,
};

function SortableColumnsDemo() {
  const [items, setItems] = useState(initialItems);
  return (
    <Sortable value={items} onValueChange={setItems}>
      <div className="flex w-64 flex-col gap-1">
        {items.map((item) => (
          <SortableItem key={item.id} value={item.id}>
            <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm">
              <SortableDragHandle
                variant="ghost"
                size="icon-xs"
                aria-label={`Reorder ${item.label}`}
              >
                <GripVerticalIcon className="size-3.5 text-muted-foreground" />
              </SortableDragHandle>
              {item.label}
            </div>
          </SortableItem>
        ))}
      </div>
    </Sortable>
  );
}

function SortableChipsDemo() {
  const [items, setItems] = useState(initialItems.slice(0, 3));
  return (
    <Sortable value={items} onValueChange={setItems} orientation="horizontal">
      <div className="flex items-center gap-1.5">
        {items.map((item) => (
          <SortableItem key={item.id} value={item.id} asTrigger>
            <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
              {item.label}
            </span>
          </SortableItem>
        ))}
      </div>
    </Sortable>
  );
}
