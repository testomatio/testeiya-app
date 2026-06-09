"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Trash2Icon, PlusIcon, InfoIcon, KeyRoundIcon } from "@/lib/icons";
import { toast } from "sonner";
import { observer } from "mobx-react-lite";
import { mcpServiceDisplay } from "@/lib/mcp-services";
import { useConnectionsService } from "@/lib/services/StoreProvider";

type McpTransport = "http" | "sse" | "stdio";

interface McpServer {
  name: string;
  enabled: boolean;
  type: McpTransport;
  command?: string;
  url?: string;
  envKeys?: string[];
  headerKeys?: string[];
  auth?: "oauth" | "apikey";
  authenticated?: boolean;
  source: "project" | "user";
  removable: boolean;
}

interface CatalogSecret {
  env: string;
  label: string;
  placeholder?: string;
}

interface CatalogService {
  id: string;
  label: string;
  transport: McpTransport;
  auth: "oauth" | "apikey" | "none";
  secrets?: CatalogSecret[];
}

/**
 * Manage the MCP servers for the active session: enable/disable, remove
 * user-added ones, install predefined services, and add custom servers.
 * Changes take effect when a new agent session starts (clear chat / reload).
 */
export const McpServersDialog = observer(function McpServersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const conn = useConnectionsService();
  const sessionId = conn.sessionId;

  // Refresh the list/catalog each time the dialog opens (the service also
  // reloads automatically when the session changes).
  useEffect(() => {
    if (open) void conn.load();
  }, [open, conn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle>MCP servers</DialogTitle>
          <DialogDescription>
            Connect the agent to external tools. Changes apply when a new agent
            session starts (clear chat or reload).
          </DialogDescription>
        </DialogHeader>

        {!sessionId ? (
          <p className="text-muted-foreground text-sm py-4">
            Start a session to manage MCP servers.
          </p>
        ) : (
          <Tabs defaultValue="configured" className="w-full min-w-0">
            <TabsList className="w-full">
              <TabsTrigger value="configured">Configured</TabsTrigger>
              <TabsTrigger value="services">Add service</TabsTrigger>
              <TabsTrigger value="custom">Add custom</TabsTrigger>
            </TabsList>

            <TabsContent value="configured" className="space-y-2 pt-2 min-w-0">
              <ConfiguredList
                servers={conn.servers}
                loading={conn.loading}
                busy={conn.busy}
                authBusy={conn.authBusy}
                onToggle={(name, enabled) => void conn.toggle(name, enabled)}
                onRemove={(name) => void conn.remove(name)}
                onAuthenticate={(name) => void conn.authenticate(name)}
              />
            </TabsContent>

            <TabsContent value="services" className="pt-2 min-w-0">
              <ServiceGallery
                catalog={conn.catalog}
                configured={conn.configuredNames}
                onAdd={conn.add}
              />
            </TabsContent>

            <TabsContent value="custom" className="pt-2 min-w-0">
              <CustomForm configured={conn.configuredNames} onAdd={conn.add} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

function ConfiguredList({
  servers,
  loading,
  busy,
  authBusy,
  onToggle,
  onRemove,
  onAuthenticate,
}: {
  servers: McpServer[];
  loading: boolean;
  busy: string | null;
  authBusy: string | null;
  onToggle: (name: string, enabled: boolean) => void;
  onRemove: (name: string) => void;
  onAuthenticate: (name: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
        <Spinner className="size-3" /> Loading…
      </div>
    );
  }
  if (servers.length === 0) {
    return (
      <p className="text-muted-foreground text-xs py-2">
        No MCP servers configured yet. Add one from a service or a custom server.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {servers.map((s) => (
        <li
          key={s.name}
          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{s.name}</span>
              {s.source === "project" && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  project
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                {s.type}
              </Badge>
              {s.auth === "oauth" && (
                <Badge
                  variant={s.authenticated ? "secondary" : "outline"}
                  className="text-[10px] uppercase shrink-0"
                >
                  {s.authenticated ? "authed" : "oauth"}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground text-[11px] font-mono truncate">
              {s.url ?? s.command ?? "—"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {s.auth === "oauth" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                title={s.authenticated ? "Re-authenticate" : "Authenticate in browser"}
                disabled={authBusy === s.name}
                onClick={() => onAuthenticate(s.name)}
              >
                {authBusy === s.name ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <KeyRoundIcon className="size-3.5" />
                )}
              </Button>
            )}
            {s.removable && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                title="Remove server"
                disabled={busy === s.name}
                onClick={() => onRemove(s.name)}
              >
                {busy === s.name ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Trash2Icon className="size-3.5" />
                )}
              </Button>
            )}
            <Switch
              checked={s.enabled}
              onCheckedChange={(checked) => onToggle(s.name, checked)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ServiceGallery({
  catalog,
  configured,
  onAdd,
}: {
  catalog: CatalogService[];
  configured: Set<string>;
  onAdd: (payload: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (catalog.length === 0) {
    return <p className="text-muted-foreground text-xs py-2">No services available.</p>;
  }

  const install = async (svc: CatalogService) => {
    if (svc.secrets?.length && expanded !== svc.id) {
      setExpanded(svc.id);
      return;
    }
    setBusy(svc.id);
    const ok = await onAdd({ fromCatalog: svc.id, secrets }, svc.label);
    setBusy(null);
    if (ok) {
      setExpanded(null);
      setSecrets({});
    }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {catalog.map((svc) => {
          const display = mcpServiceDisplay(svc.id);
          const added = configured.has(svc.id);
          const isExpanded = expanded === svc.id;
          return (
            <div key={svc.id} className="rounded-lg border p-3 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={display.logo}
                  alt=""
                  className="size-7 shrink-0"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{svc.label}</span>
                    {svc.auth === "oauth" && (
                      <Tooltip>
                        <TooltipTrigger className="inline-flex items-center text-muted-foreground">
                          <InfoIcon className="size-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Authenticates in your browser on first use.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    {display.blurb}
                  </p>
                </div>
              </div>

              {isExpanded && svc.secrets?.length ? (
                <div className="space-y-2">
                  {svc.secrets.map((secret) => (
                    <Input
                      key={secret.env}
                      type="password"
                      autoComplete="off"
                      placeholder={secret.placeholder ?? secret.label}
                      value={secrets[secret.env] ?? ""}
                      onChange={(e) =>
                        setSecrets((p) => ({ ...p, [secret.env]: e.target.value }))
                      }
                    />
                  ))}
                </div>
              ) : null}

              <Button
                size="sm"
                variant={added ? "outline" : "default"}
                disabled={added || busy === svc.id}
                onClick={() => void install(svc)}
                className="mt-auto"
              >
                {busy === svc.id ? (
                  <Spinner className="size-3.5" />
                ) : added ? (
                  "Added"
                ) : (
                  <>
                    <PlusIcon className="size-3.5" /> Add
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function CustomForm({
  configured,
  onAdd,
}: {
  configured: Set<string>;
  onAdd: (payload: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setTransport("stdio");
    setCommand("");
    setArgsText("");
    setEnvText("");
    setUrl("");
    setHeadersText("");
  };

  const parseLines = (text: string, sep: RegExp) => {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(sep);
      if (m) out[m[1].trim()] = m[2].trim();
    }
    return out;
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (configured.has(trimmedName)) {
      toast.error(`"${trimmedName}" already exists`);
      return;
    }
    const isRemote = transport === "http" || transport === "sse";
    if (isRemote && !url.trim()) {
      toast.error(`${transport} transport requires a URL`);
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      toast.error("stdio transport requires a command");
      return;
    }

    const server: Record<string, unknown> = { name: trimmedName, type: transport };
    if (isRemote) {
      server.url = url.trim();
      const headers = parseLines(headersText, /^([^:]+):\s*(.+)$/);
      if (Object.keys(headers).length) server.headers = headers;
    } else {
      server.command = command.trim();
      const args = argsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (args.length) server.args = args;
      const env = parseLines(envText, /^([^=]+)=(.*)$/);
      if (Object.keys(env).length) server.env = env;
    }

    setBusy(true);
    const ok = await onAdd({ server }, trimmedName);
    setBusy(false);
    if (ok) reset();
  };

  const isRemote = transport === "http" || transport === "sse";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium">Name</label>
        <Input
          placeholder="my-server"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium">Transport</label>
        <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stdio">stdio (local command)</SelectItem>
            <SelectItem value="http">http (remote)</SelectItem>
            <SelectItem value="sse">sse (remote)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isRemote ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">URL</label>
            <Input
              placeholder="https://mcp.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Headers <span className="text-muted-foreground">(one per line, Key: Value)</span>
            </label>
            <Textarea
              rows={2}
              placeholder="Authorization: Bearer ${MY_TOKEN}"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Command</label>
            <Input
              placeholder="npx"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Args <span className="text-muted-foreground">(one per line)</span>
            </label>
            <Textarea
              rows={3}
              placeholder={"-y\n@scope/mcp-server"}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Env <span className="text-muted-foreground">(one per line, KEY=VALUE)</span>
            </label>
            <Textarea
              rows={2}
              placeholder="API_KEY=..."
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </>
      )}

      <Button onClick={() => void submit()} disabled={busy} className="w-full">
        {busy ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5" />}
        Add server
      </Button>
    </div>
  );
}
