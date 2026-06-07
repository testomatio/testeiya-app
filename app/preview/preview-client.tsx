"use client";

import { useEffect, useState } from "react";
import { ServicesProvider } from "@/lib/services/StoreProvider";
import PlansListRenderer from "@/components/agent-output/PlansListRenderer";
import RequirementsListRenderer from "@/components/agent-output/RequirementsListRenderer";
import RunsListRenderer from "@/components/agent-output/RunsListRenderer";
import SuitesListRenderer from "@/components/agent-output/SuitesListRenderer";
import TestRunsListRenderer from "@/components/agent-output/TestRunsListRenderer";
import TestsListRenderer from "@/components/agent-output/TestsListRenderer";
import PlanItemRenderer from "@/components/agent-output/items/PlanItemRenderer";
import RunItemRenderer from "@/components/agent-output/items/RunItemRenderer";
import SuiteItemRenderer from "@/components/agent-output/items/SuiteItemRenderer";
import TestItemRenderer from "@/components/agent-output/items/TestItemRenderer";
import TestRunItemRenderer from "@/components/agent-output/items/TestRunItemRenderer";
import {
  LabelsRow,
  MetaPill,
  RunProgress,
  RunStatusDot,
  StatusCount,
  StatusTriplet,
} from "@/components/agent-output/status-pill";
import {
  SuiteKindIcon,
  TypeIcon,
} from "@/components/agent-output/type-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  planItemFixture,
  plansFixture,
  requirementsFixture,
  runItemFixture,
  runsFixture,
  suiteItemFixture,
  suitesFixture,
  testItemFixture,
  testrunItemFixture,
  testrunsFixture,
  testsFixture,
} from "@/lib/preview/fixtures";
import { MoonIcon, SunIcon } from "lucide-react";

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-16 space-y-3 border-b border-dashed pb-10"
    >
      <header>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function PreviewClient() {
  // Opt-in real fetching: when the gallery is opened with ?session=<sid>
  // we wrap it in a WorkspaceProvider so useWorkspace() returns that id and
  // the Testomat.io hooks fire against live data. Without it, the gallery
  // stays fixture-only.
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    setSessionId(sp.get("session"));
  }, []);

  const [dark, setDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.documentElement.classList.contains("dark");
  });

  function toggleDark() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.classList.toggle("light", !next);
  }

  const sections = [
    { id: "primitives", label: "Status primitives" },
    { id: "type-icons", label: "Type icons" },
    { id: "runs-list", label: "RunsListRenderer" },
    { id: "tests-list", label: "TestsListRenderer" },
    { id: "suites-list", label: "SuitesListRenderer" },
    { id: "plans-list", label: "PlansListRenderer" },
    { id: "requirements-list", label: "RequirementsListRenderer" },
    { id: "testruns-list", label: "TestRunsListRenderer" },
    { id: "run-item", label: "RunItemRenderer" },
    { id: "testrun-item", label: "TestRunItemRenderer" },
    { id: "test-item", label: "TestItemRenderer" },
    { id: "suite-item", label: "SuiteItemRenderer" },
    { id: "plan-item", label: "PlanItemRenderer" },
    { id: "empty", label: "Empty state" },
  ];

  return (
    <ServicesProvider sessionId={sessionId}>
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
        <aside className="sticky top-10 hidden h-[calc(100vh-5rem)] w-48 shrink-0 self-start overflow-y-auto lg:block">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Components
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "rounded px-2 py-1 text-muted-foreground",
                  "hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 space-y-10">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Component preview
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Development-only gallery of every agent-output renderer, seeded
                with fixtures sampled from the Testomat.io MCP.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={toggleDark}
            >
              {dark ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
              {dark ? "Light" : "Dark"}
            </Button>
          </header>

          <Section
            id="primitives"
            title="Status primitives"
            subtitle="MetaPill / LabelsRow / StatusCount / StatusTriplet / RunStatusDot / RunProgress"
          >
            <SubSection title="MetaPill">
              <Swatch>
                <MetaPill>manual</MetaPill>
                <MetaPill>automated</MetaPill>
                <MetaPill title="branch">release/v2.3</MetaPill>
                <MetaPill>staging</MetaPill>
                <MetaPill className="text-amber-600 dark:text-amber-400">
                  hidden
                </MetaPill>
              </Swatch>
            </SubSection>

            <SubSection title="LabelsRow">
              <Swatch>
                <LabelsRow
                  labels={[
                    { title: "smoke" },
                    { title: "tier-1" },
                    { title: "a11y" },
                    "wcag-2.0",
                    { name: "regression" },
                  ]}
                />
              </Swatch>
            </SubSection>

            <SubSection title="StatusCount & StatusTriplet">
              <Swatch>
                <StatusCount tone="pass" value={38} />
                <StatusCount tone="fail" value={2} />
                <StatusCount tone="skip" value={2} />
                <StatusCount tone="pass" value={0} />
                <span className="ml-2 text-xs text-muted-foreground">→</span>
                <StatusTriplet passed={38} failed={2} skipped={2} />
                <span className="ml-2 text-xs text-muted-foreground">→</span>
                <StatusTriplet passed={0} failed={0} skipped={0} />
              </Swatch>
            </SubSection>

            <SubSection title="RunStatusDot">
              <Swatch>
                {[
                  "passed",
                  "failed",
                  "skipped",
                  "running",
                  "terminated",
                  "queued",
                ].map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-xs">
                    <RunStatusDot status={s} />
                    <span className="capitalize text-muted-foreground">{s}</span>
                  </span>
                ))}
              </Swatch>
            </SubSection>

            <SubSection title="RunProgress">
              <Swatch>
                <RunProgress percent={0} automated />
                <RunProgress percent={28} />
                <RunProgress percent={60} />
                <RunProgress percent={100} />
              </Swatch>
            </SubSection>
          </Section>

          <Section
            id="type-icons"
            title="Type icons"
            subtitle="Vendored from frontend/app/svgs — manual/automated/mixed colors match badge/state-icon.hbs 1:1."
          >
            <SubSection title="Manual · Automated · Mixed (for tests, runs, testruns)">
              <Swatch>
                <span className="inline-flex items-center gap-2 text-xs">
                  <TypeIcon type="manual" />
                  <span className="text-muted-foreground">manual</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs">
                  <TypeIcon type="automated" />
                  <span className="text-muted-foreground">automated</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs">
                  <TypeIcon type="mixed" />
                  <span className="text-muted-foreground">mixed</span>
                </span>
              </Swatch>
            </SubSection>

            <SubSection title="Suite kind — folder · root folder · file">
              <Swatch>
                <span className="inline-flex items-center gap-2 text-xs">
                  <SuiteKindIcon fileType="folder" />
                  <span className="text-muted-foreground">folder</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs">
                  <SuiteKindIcon fileType="folder" isRoot />
                  <span className="text-muted-foreground">root folder</span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs">
                  <SuiteKindIcon fileType="file" />
                  <span className="text-muted-foreground">file (suite)</span>
                </span>
              </Swatch>
            </SubSection>
          </Section>

          <Section
            id="runs-list"
            title="RunsListRenderer"
            subtitle="render_list kind='runs' / MCP runs_list"
          >
            <RunsListRenderer
              json={runsFixture}
              summary="5 most recent runs in codeceptjs"
            />
          </Section>

          <Section
            id="tests-list"
            title="TestsListRenderer"
            subtitle="render_list kind='tests' / MCP tests_list"
          >
            <TestsListRenderer json={testsFixture} summary="8 tests" />
          </Section>

          <Section
            id="suites-list"
            title="SuitesListRenderer"
            subtitle="render_list kind='suites' / MCP suites_list"
          >
            <SuitesListRenderer json={suitesFixture} summary="8 root suites" />
          </Section>

          <Section
            id="plans-list"
            title="PlansListRenderer"
            subtitle="render_list kind='plans' / MCP plans_list"
          >
            <PlansListRenderer json={plansFixture} summary="5 test plans" />
          </Section>

          <Section
            id="requirements-list"
            title="RequirementsListRenderer"
            subtitle="render_list kind='requirements' / MCP issues_list"
          >
            <RequirementsListRenderer
              json={requirementsFixture}
              summary="37 linked requirements"
            />
          </Section>

          <Section
            id="testruns-list"
            title="TestRunsListRenderer"
            subtitle="render_list kind='testruns' / MCP testruns_list"
          >
            <TestRunsListRenderer
              json={testrunsFixture}
              summary="Latest 8 test executions"
            />
          </Section>

          <Section
            id="run-item"
            title="RunItemRenderer"
            subtitle="render_item kind='run' — uses <TestResults> drill-down"
          >
            <RunItemRenderer data={runItemFixture} />
          </Section>

          <Section
            id="testrun-item"
            title="TestRunItemRenderer"
            subtitle="render_item kind='testrun' — steps + assertions + artifacts"
          >
            <TestRunItemRenderer data={testrunItemFixture} />
          </Section>

          <Section
            id="test-item"
            title="TestItemRenderer"
            subtitle="render_item kind='test' — description + body"
          >
            <TestItemRenderer data={testItemFixture} />
          </Section>

          <Section
            id="suite-item"
            title="SuiteItemRenderer"
            subtitle="render_item kind='suite' — description + nested tests"
          >
            <SuiteItemRenderer data={suiteItemFixture} />
          </Section>

          <Section
            id="plan-item"
            title="PlanItemRenderer"
            subtitle="render_item kind='plan' — tests and suites in the plan"
          >
            <PlanItemRenderer data={planItemFixture} />
          </Section>

          <Section
            id="empty"
            title="Empty states"
            subtitle="What renderers show when the MCP returns no data"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <RunsListRenderer json={{ data: [] }} />
              <TestsListRenderer json={{ data: [] }} />
              <SuitesListRenderer json={{ data: [] }} />
              <PlansListRenderer json={{ data: [] }} />
              <TestRunsListRenderer json={{ data: [] }} />
            </div>
          </Section>
        </main>
      </div>
    </div>
    </ServicesProvider>
  );
}
