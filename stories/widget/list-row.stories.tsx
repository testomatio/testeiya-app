import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ListPager,
  ListRow,
  ListRowCaption,
  ListRowGroup,
  ListRowHeader,
} from "@/components/widgets/list-row";
import { MetaPill } from "@/components/widgets/status-pill";
import { suitesFixture } from "@/stories/fixtures";

const SUITES_GRID = "minmax(0,8fr) 2fr 2fr";

const meta = {
  title: "Widget/ListRow",
  component: ListRow,
  args: { children: "Row content" },
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flex: Story = {
  render: () => (
    <ListRowGroup>
      <ListRow onOpen={() => {}}>
        <span className="min-w-0 truncate font-medium">Manual run - Todo Tests</span>
        <MetaPill className="ml-2">staging</MetaPill>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          42 tests
        </span>
      </ListRow>
      <ListRow onOpen={() => {}}>
        <span className="min-w-0 truncate font-medium">
          Hybrid release regression
        </span>
        <MetaPill className="ml-2">production</MetaPill>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          60 tests
        </span>
      </ListRow>
      <ListRow selected onOpen={() => {}}>
        <span className="min-w-0 truncate font-medium">
          Automated nightly run (selected)
        </span>
        <MetaPill className="ml-2">ci</MetaPill>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          128 tests
        </span>
      </ListRow>
    </ListRowGroup>
  ),
};

export const Grid: Story = {
  render: () => (
    <ListRowGroup gridCols={SUITES_GRID}>
      <ListRowHeader gridCols={SUITES_GRID}>
        <div className="min-w-0 truncate">Suite</div>
        <div className="min-w-0 truncate">Tests</div>
        <div className="min-w-0 truncate">Updated</div>
      </ListRowHeader>
      {suitesFixture.data.slice(0, 5).map((suite) => (
        <ListRow key={suite.id} gridCols={SUITES_GRID} onOpen={() => {}}>
          <span className="min-w-0 truncate font-medium">{suite.title}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {suite.tests_total_count}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {new Date(suite.updated_at).toLocaleDateString()}
          </span>
        </ListRow>
      ))}
      <ListRowCaption>
        Showing 5 of {suitesFixture.meta.total} suites
      </ListRowCaption>
    </ListRowGroup>
  ),
};

export const WithPager: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <ListRowGroup>
          {suitesFixture.data.slice(0, 3).map((suite) => (
            <ListRow key={suite.id} onOpen={() => {}}>
              <span className="min-w-0 truncate font-medium">{suite.title}</span>
            </ListRow>
          ))}
        </ListRowGroup>
        <ListPager
          label="Showing 1–50 of 345"
          page={1}
          totalPages={7}
          hasPrev={false}
          hasNext={true}
          onPage={() => {}}
          className="mt-2 border-t pt-2"
        />
      </div>
      <ListPager
        label="Showing 401–450 of 845"
        page={9}
        totalPages={17}
        hasPrev={true}
        hasNext={true}
        onPage={() => {}}
        className="rounded-md border"
      />
      <ListPager
        label="Page 3"
        page={3}
        hasPrev={true}
        hasNext={true}
        onPage={() => {}}
        className="rounded-md border"
      />
    </div>
  ),
};
