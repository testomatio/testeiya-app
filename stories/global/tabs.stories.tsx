import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const meta = {
  title: "Global/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tests">Tests</TabsTrigger>
        <TabsTrigger value="runs">Runs</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-3 text-sm text-muted-foreground">Overview content.</TabsContent>
      <TabsContent value="tests" className="mt-3 text-sm text-muted-foreground">Test cases content.</TabsContent>
      <TabsContent value="runs" className="mt-3 text-sm text-muted-foreground">Run history content.</TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: () => (
    <Tabs defaultValue="all">
      <TabsList variant="line">
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="manual">Manual</TabsTrigger>
        <TabsTrigger value="automated">Automated</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="mt-3 text-sm text-muted-foreground">All items.</TabsContent>
      <TabsContent value="manual" className="mt-3 text-sm text-muted-foreground">Manual items.</TabsContent>
      <TabsContent value="automated" className="mt-3 text-sm text-muted-foreground">Automated items.</TabsContent>
    </Tabs>
  ),
};

export const WithBadges: Story = {
  render: () => (
    <Tabs defaultValue="tests">
      <TabsList>
        <TabsTrigger value="tests">
          Tests <Badge variant="secondary">128</Badge>
        </TabsTrigger>
        <TabsTrigger value="runs">
          Runs <Badge variant="secondary">12</Badge>
        </TabsTrigger>
        <TabsTrigger value="failed">
          Failed <Badge variant="destructive">3</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tests" className="mt-3 text-sm text-muted-foreground">Test cases content.</TabsContent>
      <TabsContent value="runs" className="mt-3 text-sm text-muted-foreground">Run history content.</TabsContent>
      <TabsContent value="failed" className="mt-3 text-sm text-muted-foreground">Failed items.</TabsContent>
    </Tabs>
  ),
};
