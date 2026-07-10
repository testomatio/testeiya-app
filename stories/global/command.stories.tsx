import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CopyIcon,
  EditIcon,
  ExternalLinkIcon,
  PlusIcon,
  SettingsIcon,
} from "@/lib/icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const meta = {
  title: "Global/Command",
  component: Command,
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="border rounded-lg overflow-hidden max-w-sm">
      <Command>
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem>
              <PlusIcon className="size-4" /> New test case
            </CommandItem>
            <CommandItem>
              <EditIcon className="size-4" /> Edit selected
            </CommandItem>
            <CommandItem>
              <CopyIcon className="size-4" /> Duplicate
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navigation">
            <CommandItem>
              <SettingsIcon className="size-4" /> Settings
            </CommandItem>
            <CommandItem>
              <ExternalLinkIcon className="size-4" /> Open in Testomat.io
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};
