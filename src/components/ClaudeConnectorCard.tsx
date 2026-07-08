import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import {
  getMcpStatusFn,
  createMcpTokenFn,
  revokeMcpTokenFn,
  type McpTokenMeta,
} from "@/lib/mcp.functions";
import { Bot, Copy, KeyRound, Loader2, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ConnectedAppsSection } from "@/components/ConnectedAppsSection";

async function copy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  } catch {
    toast.error("Could not copy");
  }
}

export function ClaudeConnectorCard() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [endpoint, setEndpoint] = useState("https://milogrowth.com/api/mcp");
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await getMcpStatusFn();
      setEndpoint(s.endpoint);
      setToolNames(s.toolNames);
      setTokens(s.tokens);
    } catch {
      /* not configured / offline — leave defaults */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    setCreating(true);
    try {
      const res = await createMcpTokenFn({ data: { label: label.trim() || undefined } });
      setFreshToken(res.token);
      setLabel("");
      await refresh();
    } catch {
      toast.error(t("claude.createError"));
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await revokeMcpTokenFn({ data: { id } });
      await refresh();
      toast.success(t("claude.revoked"));
    } catch {
      toast.error(t("claude.revokeError"));
    }
  }

  const tokenForSnippet = freshToken ?? "YOUR_TOKEN";
  const cliSnippet = `claude mcp add --transport http milo-growth ${endpoint} --header "Authorization: Bearer ${tokenForSnippet}"`;
  const desktopSnippet = `{
  "mcpServers": {
    "milo-growth": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer ${tokenForSnippet}" }
    }
  }
}`;

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-gold/80" />
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("claude.title")}</div>
      </div>
      <div className="my-4 gold-rule" />
      <p className="text-sm text-muted-foreground max-w-2xl">{t("claude.subtitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-2xl">{t("claude.accountNote")}</p>

      {/* Endpoint */}
      <div className="mt-5">
        <div className="text-xs font-medium text-muted-foreground">{t("claude.endpoint")}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-mono break-all">{endpoint}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => copy(endpoint, t("claude.copied"))}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Generate token */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("claude.label")}</label>
          <Input className="mt-1.5 w-56" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("claude.labelPlaceholder")} />
        </div>
        <Button type="button" onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {t("claude.generate")}
        </Button>
      </div>

      {/* Freshly-created token (shown once) */}
      {freshToken ? (
        <div className="mt-4 rounded-md border border-gold/40 bg-gold/5 p-4">
          <div className="text-xs font-medium text-foreground">{t("claude.tokenOnce")}</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono break-all">{freshToken}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(freshToken, t("claude.copied"))}>
              <Copy className="h-3.5 w-3.5" /> {t("claude.copy")}
            </Button>
          </div>
          <div className="mt-4 text-xs font-medium text-muted-foreground">{t("claude.cliHeading")}</div>
          <div className="mt-1.5 flex items-start gap-2">
            <code className="flex-1 rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono break-all">{cliSnippet}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(cliSnippet, t("claude.copied"))}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-3 text-xs font-medium text-muted-foreground">{t("claude.desktopHeading")}</div>
          <div className="mt-1.5 flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono">{desktopSnippet}</pre>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(desktopSnippet, t("claude.copied"))}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Existing tokens */}
      <div className="mt-6">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("claude.activeTokens")}</div>
        {loading ? (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> …</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("claude.noTokens")}</p>
        ) : (
          <ul className="space-y-1.5">
            {tokens.map((tok) => (
              <li key={tok.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{tok.label || t("claude.unnamed")}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("claude.created")} {tok.createdAt.slice(0, 10)} · {t("claude.lastUsed")} {tok.lastUsedAt ? tok.lastUsedAt.slice(0, 10) : t("claude.never")}
                  </span>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevoke(tok.id)} aria-label={t("claude.revoke")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tools + security */}
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("claude.tools")}</div>
          <div className="flex flex-wrap gap-1.5">
            {toolNames.map((n) => (
              <span key={n} className="rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs font-mono">{n}</span>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {t("claude.securityTitle")}</div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("claude.security")}</p>
        </div>
      </div>

      {/* Connected apps (Claude.ai OAuth grants) — hidden when there are none */}
      <ConnectedAppsSection />
    </section>
  );
}
