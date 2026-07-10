import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const meta = {
  title: "Global/Carousel",
  component: Carousel,
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="px-12 py-4">
      <Carousel className="w-full max-w-xs">
        <CarouselContent>
          {Array.from({ length: 5 }, (_, i) => (
            <CarouselItem key={i}>
              <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-card">
                <span className="text-3xl font-semibold">{i + 1}</span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
};

export const MultipleItems: Story = {
  render: () => (
    <div className="px-12 py-4">
      <Carousel className="w-full max-w-md">
        <CarouselContent>
          {Array.from({ length: 8 }, (_, i) => (
            <CarouselItem key={i} className="basis-1/3">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-card">
                <span className="text-xl font-semibold">{i + 1}</span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
};
