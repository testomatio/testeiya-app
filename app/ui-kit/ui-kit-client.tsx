"use client"

import { useState } from "react"
import {
  SunIcon, MoonIcon, CheckIcon, InfoIcon, AlertTriangleIcon, XCircleIcon,
  UserIcon, ZapIcon, StarIcon, SearchIcon, MailIcon, LockIcon, PhoneIcon,
  ChevronDownIcon, MoreHorizontalIcon, EditIcon, TrashIcon, CopyIcon,
  SettingsIcon, LogOutIcon, PlusIcon, ExternalLinkIcon,
} from "lucide-react"

import { useTheme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
  DropdownMenuGroup, DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover"
import {
  HoverCard, HoverCardTrigger, HoverCardContent,
} from "@/components/ui/hover-card"
import {
  InputGroup, InputGroupAddon, InputGroupInput, InputGroupText,
} from "@/components/ui/input-group"
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-14">
      <h6>{title}</h6>
      <div>{children}</div>
    </section>
  )
}

function Row({ children, wrap = true }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${wrap ? "flex-wrap" : ""}`}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs text-muted-foreground">{children}</p>
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function Swatch({ label, varName, className }: { label: string; varName: string; className: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 min-w-[80px]">
      <div className={`h-10 w-full rounded-lg border border-border ${className}`} />
      <span className="text-[10px] font-medium text-foreground leading-tight">{label}</span>
      <span className="text-[10px] text-muted-foreground font-mono leading-tight">{varName}</span>
    </div>
  )
}

// ─── Font weight sample ───────────────────────────────────────────────────────

function FontSample({ weight, label }: { weight: number; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-28 text-xs text-muted-foreground font-mono shrink-0">{label} / {weight}</span>
      <span style={{ fontWeight: weight }} className="text-xl font-sans">
        The quick brown fox
      </span>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV = [
  ["colors", "Colors"],
  ["typography", "Typography"],
  ["buttons", "Buttons"],
  ["button-group", "Button Group"],
  ["badges", "Badges"],
  ["inputs", "Inputs"],
  ["input-group", "Input Group"],
  ["select", "Select"],
  ["switch", "Switch"],
  ["tabs", "Tabs"],
  ["alerts", "Alerts"],
  ["cards", "Cards"],
  ["accordion", "Accordion"],
  ["collapsible", "Collapsible"],
  ["dialog", "Dialog"],
  ["dropdown", "Dropdown"],
  ["popover", "Popover"],
  ["hover-card", "Hover Card"],
  ["command", "Command"],
  ["table", "Table"],
  ["avatar", "Avatar"],
  ["progress", "Progress"],
  ["scroll-area", "Scroll Area"],
  ["tooltip", "Tooltip"],
  ["spinner", "Spinner"],
  ["separator", "Separator"],
  ["links", "Links & Text"],
  ["radius", "Radius"],
] as const

// ─── Main ─────────────────────────────────────────────────────────────────────

export function UIKit() {
  const { theme, toggle } = useTheme()
  const [switchA, setSwitchA] = useState(false)
  const [switchB, setSwitchB] = useState(true)
  const [dropdownCheck, setDropdownCheck] = useState(false)

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground">

        {/* Header */}
        <div className="fixed top-0 inset-x-0 z-20 flex h-12 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground">UI Kit</span>
            <Badge variant="outline">Design System</Badge>
          </div>
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </button>
        </div>

        <div className="flex pt-12">

          {/* Sidebar nav */}
          <aside className="sticky top-12 h-[calc(100vh-3rem)] w-44 shrink-0 overflow-y-auto border-r border-border p-4 hidden lg:block">
            <nav className="space-y-0.5">
              {NAV.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="mx-auto w-full max-w-4xl space-y-12 px-6 py-10">

            {/* ── Colors ──────────────────────────────────────────────────── */}
            <Section title="Color Tokens" id="colors">
              <div className="space-y-6">
                <div>
                  <Label>Core tokens</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Background" varName="--background" className="bg-background" />
                    <Swatch label="Foreground" varName="--foreground" className="bg-foreground" />
                    <Swatch label="Primary" varName="--primary" className="bg-primary" />
                    <Swatch label="Primary fg" varName="--primary-foreground" className="bg-primary-foreground border border-border" />
                    <Swatch label="Secondary" varName="--secondary" className="bg-secondary" />
                    <Swatch label="Muted" varName="--muted" className="bg-muted" />
                    <Swatch label="Muted fg" varName="--muted-foreground" className="bg-muted-foreground" />
                    <Swatch label="Accent" varName="--accent" className="bg-accent" />
                    <Swatch label="Accent fg" varName="--accent-foreground" className="bg-accent-foreground" />
                    <Swatch label="Card" varName="--card" className="bg-card" />
                    <Swatch label="Border" varName="--border" className="bg-border" />
                    <Swatch label="Destructive" varName="--destructive" className="bg-destructive" />
                    <Swatch label="Ring" varName="--ring" className="bg-ring" />
                    <Swatch label="Input" varName="--input" className="bg-input" />
                    <Swatch label="Popover" varName="--popover" className="bg-popover border border-border" />
                  </div>
                </div>

                <div>
                  <Label>Status</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Success" varName="--status-success" className="bg-status-success" />
                    <Swatch label="Success fg" varName="--status-success-foreground" className="bg-status-success-foreground" />
                    <Swatch label="Error" varName="--status-error" className="bg-status-error" />
                    <Swatch label="Error fg" varName="--status-error-foreground" className="bg-status-error-foreground" />
                    <Swatch label="Warning" varName="--status-warning" className="bg-status-warning" />
                    <Swatch label="Warning fg" varName="--status-warning-foreground" className="bg-status-warning-foreground" />
                    <Swatch label="Info" varName="--status-info" className="bg-status-info" />
                    <Swatch label="Info fg" varName="--status-info-foreground" className="bg-status-info-foreground" />
                  </div>
                </div>

                <div>
                  <Label>Test types</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Manual" varName="--type-manual" className="bg-type-manual" />
                    <Swatch label="Manual fg" varName="--type-manual-foreground" className="bg-type-manual-foreground" />
                    <Swatch label="Automated" varName="--type-automated" className="bg-type-automated" />
                    <Swatch label="Auto fg" varName="--type-automated-foreground" className="bg-type-automated-foreground" />
                    <Swatch label="Mixed" varName="--type-mixed" className="bg-type-mixed" />
                    <Swatch label="Mixed fg" varName="--type-mixed-foreground" className="bg-type-mixed-foreground" />
                  </div>
                </div>

                <div>
                  <Label>Run statuses</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Passed" varName="--run-passed" className="bg-run-passed" />
                    <Swatch label="Failed" varName="--run-failed" className="bg-run-failed" />
                    <Swatch label="Skipped" varName="--run-skipped" className="bg-run-skipped" />
                    <Swatch label="Running" varName="--run-running" className="bg-run-running" />
                    <Swatch label="Terminated" varName="--run-terminated" className="bg-run-terminated" />
                    <Swatch label="Pending" varName="--run-pending" className="bg-run-pending" />
                  </div>
                </div>

                <div>
                  <Label>Charts</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Chart 1" varName="--chart-1" className="bg-chart-1" />
                    <Swatch label="Chart 2" varName="--chart-2" className="bg-chart-2" />
                    <Swatch label="Chart 3" varName="--chart-3" className="bg-chart-3" />
                    <Swatch label="Chart 4" varName="--chart-4" className="bg-chart-4" />
                    <Swatch label="Chart 5" varName="--chart-5" className="bg-chart-5" />
                  </div>
                </div>

                <div>
                  <Label>Sidebar</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-4">
                    <Swatch label="Sidebar" varName="--sidebar" className="bg-sidebar" />
                    <Swatch label="Sidebar fg" varName="--sidebar-foreground" className="bg-sidebar-foreground" />
                    <Swatch label="Primary" varName="--sidebar-primary" className="bg-sidebar-primary" />
                    <Swatch label="Accent" varName="--sidebar-accent" className="bg-sidebar-accent" />
                    <Swatch label="Border" varName="--sidebar-border" className="bg-sidebar-border" />
                    <Swatch label="Ring" varName="--sidebar-ring" className="bg-sidebar-ring" />
                  </div>
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Typography ──────────────────────────────────────────────── */}
            <Section title="Typography — THICCCBOI" id="typography">
              <div className="space-y-8">
                <div>
                  <Label>Heading scale</Label>
                  <div className="space-y-1">
                    <h1>H1 — 24px Medium Tight</h1>
                    <h2>H2 — 22px Medium Tight</h2>
                    <h3>H3 — 20px Medium Tight</h3>
                    <h4>H4 — 18px SemiBold</h4>
                    <h5>H5 — 16px SemiBold</h5>
                    <h6>H6 — 14px Bold Uppercase Indigo Eyebrow</h6>
                  </div>
                </div>
                <div>
                  <Label>Body sizes</Label>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">text-xs / 12px — caption, labels</p>
                    <p className="text-sm">text-sm / 14px — default body, UI text</p>
                    <p className="text-base">text-base / 16px — primary readable content</p>
                    <p className="text-lg">text-lg / 18px — lead paragraph</p>
                    <p className="text-xl">text-xl / 20px — large callout</p>
                    <p className="text-2xl">text-2xl / 24px — display</p>
                  </div>
                </div>
                <div>
                  <Label>Font weights</Label>
                  <div className="space-y-1.5">
                    <FontSample weight={100} label="Thin" />
                    <FontSample weight={300} label="Light" />
                    <FontSample weight={400} label="Regular" />
                    <FontSample weight={500} label="Medium" />
                    <FontSample weight={600} label="SemiBold" />
                    <FontSample weight={700} label="Bold" />
                    <FontSample weight={800} label="ExtraBold" />
                    <FontSample weight={900} label="Black" />
                  </div>
                </div>
                <div>
                  <Label>Monospace — JetBrains Mono</Label>
                  <code className="font-mono text-sm bg-muted px-2 py-1 rounded-md">
                    const greeting = "Hello, Testeiya!";
                  </code>
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Buttons ─────────────────────────────────────────────────── */}
            <Section title="Buttons" id="buttons">
              <Sub>
                <div>
                  <Label>Variants</Label>
                  <Row>
                    <Button variant="default">Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link</Button>
                  </Row>
                </div>
                <div>
                  <Label>Sizes</Label>
                  <Row>
                    <Button size="lg">Large</Button>
                    <Button size="default">Default</Button>
                    <Button size="sm">Small</Button>
                    <Button size="xs">XSmall</Button>
                    <Button size="icon"><StarIcon /></Button>
                    <Button size="icon-sm"><StarIcon /></Button>
                    <Button size="icon-xs"><StarIcon /></Button>
                  </Row>
                </div>
                <div>
                  <Label>With icons</Label>
                  <Row>
                    <Button><ZapIcon /> With icon</Button>
                    <Button variant="outline"><UserIcon /> Outline</Button>
                    <Button variant="secondary">Secondary <StarIcon /></Button>
                    <Button variant="ghost" size="sm"><PlusIcon /> Ghost sm</Button>
                  </Row>
                </div>
                <div>
                  <Label>States</Label>
                  <Row>
                    <Button disabled>Disabled</Button>
                    <Button variant="outline" disabled>Disabled outline</Button>
                    <Button><Spinner className="mr-1" /> Loading</Button>
                  </Row>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Button Group ─────────────────────────────────────────────── */}
            <Section title="Button Group" id="button-group">
              <Sub>
                <div>
                  <Label>Horizontal (default)</Label>
                  <ButtonGroup>
                    <Button variant="outline">Left</Button>
                    <Button variant="outline">Center</Button>
                    <Button variant="outline">Right</Button>
                  </ButtonGroup>
                </div>
                <div>
                  <Label>Vertical</Label>
                  <ButtonGroup orientation="vertical" className="w-32">
                    <Button variant="outline">Top</Button>
                    <Button variant="outline">Middle</Button>
                    <Button variant="outline">Bottom</Button>
                  </ButtonGroup>
                </div>
                <div>
                  <Label>With icon buttons</Label>
                  <ButtonGroup>
                    <Button variant="outline" size="icon"><EditIcon /></Button>
                    <Button variant="outline" size="icon"><CopyIcon /></Button>
                    <Button variant="outline" size="icon"><TrashIcon /></Button>
                  </ButtonGroup>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Badges ──────────────────────────────────────────────────── */}
            <Section title="Badges" id="badges">
              <Sub>
                <div>
                  <Label>Variants</Label>
                  <Row>
                    <Badge variant="default">Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                    <Badge variant="ghost">Ghost</Badge>
                  </Row>
                </div>
                <div>
                  <Label>With icons</Label>
                  <Row>
                    <Badge variant="default"><CheckIcon /> Passed</Badge>
                    <Badge variant="secondary"><InfoIcon /> Manual</Badge>
                    <Badge variant="destructive"><XCircleIcon /> Failed</Badge>
                    <Badge variant="outline"><StarIcon /> Featured</Badge>
                  </Row>
                </div>
                <div>
                  <Label>Status badges</Label>
                  <Row>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium bg-run-passed/20 text-run-passed">Passed</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium bg-run-failed/20 text-run-failed">Failed</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium bg-run-skipped/20 text-run-skipped">Skipped</span>
                    <span className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium bg-muted text-muted-foreground">Pending</span>
                  </Row>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Inputs ──────────────────────────────────────────────────── */}
            <Section title="Form Inputs" id="inputs">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default</label>
                  <Input placeholder="Type something…" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Disabled</label>
                  <Input placeholder="Disabled" disabled />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Invalid</label>
                  <Input placeholder="Error state" aria-invalid="true" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">With value</label>
                  <Input defaultValue="testeiya@example.com" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Textarea</label>
                  <Textarea placeholder="Write your test case description…" rows={3} />
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Input Group ──────────────────────────────────────────────── */}
            <Section title="Input Group" id="input-group">
              <Sub>
                <div>
                  <Label>With addon prefix</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>https://</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput placeholder="example.com" />
                  </InputGroup>
                </div>
                <div>
                  <Label>With icon prefix</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText><SearchIcon className="size-3.5" /></InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Search…" />
                  </InputGroup>
                </div>
                <div>
                  <Label>With button</Label>
                  <InputGroup>
                    <InputGroupInput placeholder="Enter email…" />
                    <InputGroupAddon>
                      <Button size="sm">Subscribe</Button>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Select ──────────────────────────────────────────────────── */}
            <Section title="Select" id="select">
              <Row>
                <Select>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Pick a status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue placeholder="Small select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a">Manual</SelectItem>
                    <SelectItem value="b">Automated</SelectItem>
                    <SelectItem value="c">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </Section>

            <Separator />

            {/* ── Switch ──────────────────────────────────────────────────── */}
            <Section title="Switch" id="switch">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={switchA} onCheckedChange={setSwitchA} />
                  <span className="text-sm">{switchA ? "On" : "Off"} — default size</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch size="sm" checked={switchB} onCheckedChange={setSwitchB} />
                  <span className="text-sm">{switchB ? "On" : "Off"} — small size</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch disabled />
                  <span className="text-sm text-muted-foreground">Disabled off</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch disabled checked />
                  <span className="text-sm text-muted-foreground">Disabled on</span>
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <Section title="Tabs" id="tabs">
              <Sub>
                <div>
                  <Label>Default (pill)</Label>
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
                </div>
                <div>
                  <Label>Line variant</Label>
                  <Tabs defaultValue="a">
                    <TabsList variant="line">
                      <TabsTrigger value="a">All</TabsTrigger>
                      <TabsTrigger value="b">Manual</TabsTrigger>
                      <TabsTrigger value="c">Automated</TabsTrigger>
                    </TabsList>
                    <TabsContent value="a" className="mt-3 text-sm text-muted-foreground">All items.</TabsContent>
                    <TabsContent value="b" className="mt-3 text-sm text-muted-foreground">Manual items.</TabsContent>
                    <TabsContent value="c" className="mt-3 text-sm text-muted-foreground">Automated items.</TabsContent>
                  </Tabs>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Alerts ──────────────────────────────────────────────────── */}
            <Section title="Alerts" id="alerts">
              <div className="space-y-3">
                <Alert>
                  <InfoIcon />
                  <AlertTitle>Default alert</AlertTitle>
                  <AlertDescription>This is a neutral informational alert message.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <XCircleIcon />
                  <AlertTitle>Destructive alert</AlertTitle>
                  <AlertDescription>Something went wrong. Please try again.</AlertDescription>
                </Alert>
                <div className="rounded-lg border border-border bg-status-success p-2.5 text-sm">
                  <p className="font-medium text-status-success-foreground flex items-center gap-1.5"><CheckIcon className="size-4" /> Success status surface</p>
                  <p className="mt-0.5 text-status-success-foreground/80">All tests passed successfully.</p>
                </div>
                <div className="rounded-lg border border-border bg-status-warning p-2.5 text-sm">
                  <p className="font-medium text-status-warning-foreground flex items-center gap-1.5"><AlertTriangleIcon className="size-4" /> Warning status surface</p>
                  <p className="mt-0.5 text-status-warning-foreground/80">Some tests need attention.</p>
                </div>
                <div className="rounded-lg border border-border bg-status-error p-2.5 text-sm">
                  <p className="font-medium text-status-error-foreground flex items-center gap-1.5"><XCircleIcon className="size-4" /> Error status surface</p>
                  <p className="mt-0.5 text-status-error-foreground/80">Build failed with 3 errors.</p>
                </div>
                <div className="rounded-lg border border-border bg-status-info p-2.5 text-sm">
                  <p className="font-medium text-status-info-foreground flex items-center gap-1.5"><InfoIcon className="size-4" /> Info status surface</p>
                  <p className="mt-0.5 text-status-info-foreground/80">Sync is in progress.</p>
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Cards ───────────────────────────────────────────────────── */}
            <Section title="Cards" id="cards">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Default card</CardTitle>
                    <CardDescription>Card description or subtitle.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Card content area. Use for grouped information or actions.
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button size="sm">Action</Button>
                    <Button size="sm" variant="ghost">Cancel</Button>
                  </CardFooter>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Small card</CardTitle>
                    <CardDescription>Compact variant with tighter spacing.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Same structure, more compact padding.
                  </CardContent>
                </Card>
              </div>
            </Section>

            <Separator />

            {/* ── Accordion ───────────────────────────────────────────────── */}
            <Section title="Accordion" id="accordion">
              <Accordion className="border rounded-lg divide-y divide-border">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="px-4">What is Testeiya?</AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 text-muted-foreground">
                    Testeiya is an AI-powered QA agent that helps you manage and run your test cases.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger className="px-4">How does it work?</AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 text-muted-foreground">
                    It connects to your Testomat.io project, pulls test cases, and lets an AI agent run them interactively.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger className="px-4">Is it open source?</AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 text-muted-foreground">
                    Parts of the stack are open. Check the repository for details.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Section>

            <Separator />

            {/* ── Collapsible ─────────────────────────────────────────────── */}
            <Section title="Collapsible" id="collapsible">
              <Collapsible className="border rounded-lg overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                  <span>Show advanced settings</span>
                  <ChevronDownIcon className="size-4 text-muted-foreground transition-transform data-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Enable verbose logging</span>
                    <Switch size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-retry on failure</span>
                    <Switch size="sm" checked />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Section>

            <Separator />

            {/* ── Dialog ──────────────────────────────────────────────────── */}
            <Section title="Dialog" id="dialog">
              <Row>
                <Dialog>
                  <DialogTrigger render={<Button variant="outline" />}>
                    Open dialog
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm action</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. Are you sure you want to continue?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                      <Button variant="destructive">Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger render={<Button />}>
                    Settings dialog
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Settings</DialogTitle>
                      <DialogDescription>Configure your workspace preferences.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
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
              </Row>
            </Section>

            <Separator />

            {/* ── Dropdown ────────────────────────────────────────────────── */}
            <Section title="Dropdown Menu" id="dropdown">
              <Row>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" />}>
                    Actions <ChevronDownIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    <DropdownMenuLabel>My account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem>
                        <EditIcon /> Edit
                        <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <CopyIcon /> Duplicate
                        <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={dropdownCheck}
                      onCheckedChange={setDropdownCheck}
                    >
                      Show labels
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <TrashIcon /> Delete
                      <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem><SettingsIcon /> Settings</DropdownMenuItem>
                    <DropdownMenuItem><ExternalLinkIcon /> Open</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem><LogOutIcon /> Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
            </Section>

            <Separator />

            {/* ── Popover ─────────────────────────────────────────────────── */}
            <Section title="Popover" id="popover">
              <Row>
                <Popover>
                  <PopoverTrigger render={<Button variant="outline" />}>
                    Open popover
                  </PopoverTrigger>
                  <PopoverContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Popover content</p>
                      <p className="text-xs text-muted-foreground">Use popovers for contextual controls and additional information.</p>
                      <Button size="sm" className="w-full">Action</Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger render={<Button size="icon" variant="ghost" />}>
                    <InfoIcon />
                  </PopoverTrigger>
                  <PopoverContent side="right">
                    <p className="text-xs text-muted-foreground">This field accepts a valid API key from Testomat.io.</p>
                  </PopoverContent>
                </Popover>
              </Row>
            </Section>

            <Separator />

            {/* ── Hover Card ──────────────────────────────────────────────── */}
            <Section title="Hover Card" id="hover-card">
              <HoverCard>
                <HoverCardTrigger className="text-sm text-primary underline underline-offset-4 cursor-pointer">
                  @testomat.io
                </HoverCardTrigger>
                <HoverCardContent>
                  <div className="flex gap-3">
                    <Avatar>
                      <AvatarFallback>T</AvatarFallback>
                    </Avatar>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Testomat.io</p>
                      <p className="text-xs text-muted-foreground">Test management platform for modern QA teams.</p>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </Section>

            <Separator />

            {/* ── Command ─────────────────────────────────────────────────── */}
            <Section title="Command" id="command">
              <div className="border rounded-lg overflow-hidden max-w-sm">
                <Command>
                  <CommandInput placeholder="Search commands…" />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Actions">
                      <CommandItem><PlusIcon className="size-4" /> New test case</CommandItem>
                      <CommandItem><EditIcon className="size-4" /> Edit selected</CommandItem>
                      <CommandItem><CopyIcon className="size-4" /> Duplicate</CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Navigation">
                      <CommandItem><SettingsIcon className="size-4" /> Settings</CommandItem>
                      <CommandItem><ExternalLinkIcon className="size-4" /> Open in Testomat.io</CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            </Section>

            <Separator />

            {/* ── Table ───────────────────────────────────────────────────── */}
            <Section title="Table" id="table">
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableCaption className="mb-3">Recent test runs</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { name: "Login flow", type: "Automated", status: "Passed", dur: "1.2s" },
                      { name: "Checkout", type: "Manual", status: "Failed", dur: "34s" },
                      { name: "Search", type: "Automated", status: "Skipped", dur: "—" },
                      { name: "Profile update", type: "Mixed", status: "Passed", dur: "5.4s" },
                    ].map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">{row.type}</TableCell>
                        <TableCell>
                          <span className={
                            row.status === "Passed" ? "text-run-passed" :
                            row.status === "Failed" ? "text-run-failed" :
                            "text-run-skipped"
                          }>
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.dur}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Separator />

            {/* ── Avatar ──────────────────────────────────────────────────── */}
            <Section title="Avatars" id="avatar">
              <Sub>
                <div>
                  <Label>Sizes: lg / default / sm</Label>
                  <Row>
                    <Avatar size="lg"><AvatarImage src="https://github.com/shadcn.png" alt="User" /><AvatarFallback>SC</AvatarFallback></Avatar>
                    <Avatar><AvatarFallback>EE</AvatarFallback></Avatar>
                    <Avatar size="sm"><AvatarFallback>AB</AvatarFallback></Avatar>
                  </Row>
                </div>
                <div>
                  <Label>With image fallback</Label>
                  <Row>
                    <Avatar><AvatarImage src="/broken.png" alt="Broken" /><AvatarFallback>FB</AvatarFallback></Avatar>
                    <Avatar><AvatarFallback className="bg-primary text-primary-foreground">TM</AvatarFallback></Avatar>
                    <Avatar><AvatarFallback className="bg-chart-2 text-white">AI</AvatarFallback></Avatar>
                  </Row>
                </div>
              </Sub>
            </Section>

            <Separator />

            {/* ── Progress ────────────────────────────────────────────────── */}
            <Section title="Progress" id="progress">
              <div className="space-y-4 max-w-sm">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>25%</span><span>Uploading…</span></div>
                  <Progress value={25} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>60%</span><span>Processing</span></div>
                  <Progress value={60} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>90%</span><span>Almost done</span></div>
                  <Progress value={90} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Indeterminate (null)</p>
                  <Progress value={null} />
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Scroll Area ─────────────────────────────────────────────── */}
            <Section title="Scroll Area" id="scroll-area">
              <ScrollArea className="h-40 w-full rounded-lg border border-border">
                <div className="p-4 space-y-2">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-muted-foreground font-mono text-xs">{i + 1}</span>
                      <span>Test case #{i + 1} — Login with valid credentials</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Section>

            <Separator />

            {/* ── Tooltip ─────────────────────────────────────────────────── */}
            <Section title="Tooltips" id="tooltip">
              <Row>
                <Tooltip>
                  <TooltipTrigger render={<Button variant="outline" />}>
                    Hover me
                  </TooltipTrigger>
                  <TooltipContent>This is a tooltip</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={<Button size="icon" variant="ghost" />}>
                    <InfoIcon />
                  </TooltipTrigger>
                  <TooltipContent side="right">More info on the right</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={<Button size="sm" variant="secondary" />}>
                    Bottom tooltip
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Appears below</TooltipContent>
                </Tooltip>
              </Row>
            </Section>

            <Separator />

            {/* ── Spinner ─────────────────────────────────────────────────── */}
            <Section title="Spinner" id="spinner">
              <Row>
                <Spinner className="size-3 text-muted-foreground" />
                <Spinner className="size-4" />
                <Spinner className="size-5 text-primary" />
                <Spinner className="size-6 text-destructive" />
                <Spinner className="size-8 text-chart-2" />
              </Row>
            </Section>

            <Separator />

            {/* ── Separator ───────────────────────────────────────────────── */}
            <Section title="Separator" id="separator">
              <div className="space-y-4">
                <div>
                  <Label>Horizontal</Label>
                  <Separator />
                </div>
                <div>
                  <Label>Vertical (inline)</Label>
                  <div className="flex h-8 items-center gap-4">
                    <span className="text-sm">Left</span>
                    <Separator orientation="vertical" />
                    <span className="text-sm">Middle</span>
                    <Separator orientation="vertical" />
                    <span className="text-sm">Right</span>
                  </div>
                </div>
              </div>
            </Section>

            <Separator />

            {/* ── Links & Text ─────────────────────────────────────────────── */}
            <Section title="Links & Text Styles" id="links">
              <div className="space-y-2 text-sm">
                <p>
                  Plain paragraph with an{" "}
                  <a href="#" className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
                    inline link
                  </a>{" "}
                  and more text after.
                </p>
                <p><a href="#" className="text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">Muted link style</a></p>
                <p className="text-destructive">Destructive / error text</p>
                <p className="text-muted-foreground">Muted / secondary text</p>
                <p className="text-primary font-medium">Primary emphasis</p>
                <p>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">inline code snippet</code>
                </p>
                <p>
                  <strong>Bold text</strong> and <span className="font-medium">medium weight</span> for emphasis hierarchy.
                </p>
              </div>
            </Section>

            <Separator />

            {/* ── Border Radius ────────────────────────────────────────────── */}
            <Section title="Border Radius" id="radius">
              <Row>
                {([
                  ["rounded-sm", "sm (0.375rem)"],
                  ["rounded-md", "md (0.5rem)"],
                  ["rounded-lg", "lg (0.625rem)"],
                  ["rounded-xl", "xl (0.875rem)"],
                  ["rounded-2xl", "2xl (1.125rem)"],
                  ["rounded-3xl", "3xl (1.375rem)"],
                  ["rounded-full", "full"],
                ] as const).map(([cls, label]) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div className={`h-10 w-10 bg-primary ${cls}`} />
                    <span className="text-[10px] font-mono text-muted-foreground text-center">{label}</span>
                  </div>
                ))}
              </Row>
            </Section>

            <div className="h-10" />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
