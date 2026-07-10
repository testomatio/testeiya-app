import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/data-table/date-picker-with-range";

const meta = {
  title: "Widget/DatePickerWithRange",
  component: DatePickerWithRange,
  args: { date: undefined, setDate: () => {} },
} satisfies Meta<typeof DatePickerWithRange>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <DatePickerDemo />,
};

export const Empty: Story = {
  render: () => <DatePickerDemo empty />,
};

function DatePickerDemo({ empty }: { empty?: boolean }) {
  let initial: DateRange | undefined;
  if (!empty) {
    initial = {
      from: new Date("2026-04-01T00:00:00"),
      to: new Date("2026-04-21T00:00:00"),
    };
  }
  const [date, setDate] = useState<DateRange | undefined>(initial);
  return (
    <div className="w-80">
      <DatePickerWithRange date={date} setDate={setDate} />
    </div>
  );
}
