import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Database, Bot, Play, Trash2, AlertTriangle, ThumbsUp, MessageSquare, FileX } from "lucide-react";
import { toast } from "sonner";

type FakeResult = { id: number; name: string; passed: boolean; expected: unknown; got: unknown };
type FakeReport = { mode: string; total: number; passed: number; failed: number; results: FakeResult[] };
type RealReport = {
  mode: string;
  lint: Array<{ category: string; severity: string; detail: string; step: string; customer_id: string }>;
  distribution: Record<string, number>;
  recent_transitions: Array<{ created_at: string; from_step: string; to_step: string; trigger_type: string }>;
  bot_paused_24h: number;
};

type OutboundRow = {
  turn: number;
  direction: "inbound" | "outbound" | "system" | "error";
  kind: string;
  content: string | null;
  conversation_step_before: string | null;
  conversation_step_after: string | null;
  latency_ms: number | null;
  created_at: string;
};
type Check = { name: string; passed: boolean; detail?: string };
type E2EResult = {
  ok: boolean;
  runId: string;
  status: string;
  phone: string;
  turns: number;
  lastStep: string | null;
  stopReason?: string;
  visitedSteps?: string[];
  outbound: OutboundRow[];
  checks: Check[];
  checksPassed: number;
  checksTotal: number;
  customerId: string;
  finalCustomerStatus: string | null;
  marketReadiness?: string;
  recommendation?: string;
};

const SCENARIOS = [
  { value: "happy_path", label: "Venda completa — aceita tudo" },
  { value: "joia_validacao", label: "Joia — aprova com 👍" },
  { value: "lead_indeciso", label: "Dúvida real — pergunta antes de seguir" },
  { value: "recusa_conta", label: "Recusa conta — reprova e recupera" },
  { value: "recusa_documento", label: "Recusa documento — reprova e recupera" },
  { value: "valor_baixo", label: "Valor baixo — não vender" },
  { value: "lead_some", label: "Lead some — abandono" },
  { value: "documento_cnh", label: "CNH — sem pedir verso" },
];

export default function BotAudit() {
  const [loading, setLoading] = useState<"fake" | "real" | "e2e" | null>(null);
  const [fakeReport, setFakeReport] = useState<FakeReport | null>(null);
  const [realReport, setRealReport] = useState<RealReport | null>(null);
  const [scenario, setScenario] = useState<string>("happy_path");
  const [e2eResult, setE2eResult] = useState<E2EResult | null>(null);
  const [livePolling, setLivePolling] = useState<OutboundRow[]>([]);
  const [liveTurn, setLiveTurn] = useState(0);
  const pollRef = useRef<number | null>(null);

  async function run(mode: "fake" | "real") {
    setLoading(mode);
    try {
      const { data, error } = await supabase.functions.invoke(`bot-audit-runner?mode=${mode}`, { method: "GET" });
      if (error) throw error;
      if (mode === "fake") setFakeReport(data as FakeReport);
      else setRealReport(data as RealReport);
      toast.success(`Auditoria ${mode === "fake" ? "fictícia" : "real"} concluída`);
    } catch (e) {
      toast.error(`Falhou: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  function startPolling(runId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from("bot_test_outbound")
        .select("turn,direction,kind,content,conversation_step_before,conversation_step_after,latency_ms,created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true });
      if (data) {
        setLivePolling(data as OutboundRow[]);
        setLiveTurn(Math.max(0, ...data.map((d: any) => d.turn || 0)));
      }
    }, 1000);
  }
  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }
  useEffect(() => () => stopPolling(), []);

  async function runE2E(scenarioOverride?: string) {
    const selectedScenario = scenarioOverride || scenario;
    setScenario(selectedScenario);
    setLoading("e2e");
    setE2eResult(null);
    setLivePolling([]);
    setLiveTurn(0);

    // Cria placeholder de polling: chamamos primeiro a função para conseguir o runId,
    // mas como ela só retorna no fim, fazemos polling pelas runs mais recentes do usuário.
    // Estratégia: dispara invocação e em paralelo poll runs novas.
    const startedAt = Date.now();
    const pollNewRun = window.setInterval(async () => {
      const { data: runs } = await supabase
        .from("bot_test_runs")
        .select("id,started_at,scenario,status")
        .eq("scenario", selectedScenario)
        .order("started_at", { ascending: false })
        .limit(1);
      const r = runs?.[0];
      if (r && new Date(r.started_at).getTime() >= startedAt - 2000 && pollRef.current === null) {
        startPolling(r.id);
      }
    }, 800);

    try {
      const { data, error } = await supabase.functions.invoke("bot-e2e-runner", {
        method: "POST", body: { scenario: selectedScenario },
      });
      if (error) throw error;
      const result = data as E2EResult;
      setE2eResult(result);
      setLivePolling(result.outbound || []);
      toast.success(`E2E concluído: ${result.status} em ${result.turns} turnos`);
    } catch (e) {
      toast.error(`E2E falhou: ${(e as Error).message}`);
    } finally {
      clearInterval(pollNewRun);
      stopPolling();
      setLoading(null);
    }
  }

  async function cleanupRun(runId: string) {
    try {
      const { data, error } = await supabase.rpc("cleanup_bot_test_data", { _run_id: runId });
      if (error) throw error;
      toast.success("Dados de teste limpos");
      if (e2eResult?.runId === runId) setE2eResult(null);
      setLivePolling([]);
    } catch (e) {
      toast.error(`Limpeza falhou: ${(e as Error).message}`);
    }
  }

  const timeline = livePolling;

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Auditoria do Bot-Flow</h1>
        <p className="text-muted-foreground mt-1">
          Valida o roteamento entre o motor determinístico (sys) e o conversacional (flow:UUID).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Dados fictícios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Roda 20 cenários sintéticos cobrindo welcome, UUIDs legacy, fluxo PAULO, ping-pong e edge cases. Não toca o banco.
            </p>
            <Button onClick={() => run("fake")} disabled={loading !== null} className="w-full" size="lg">
              {loading === "fake" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Testar com dados fictícios
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Dados reais (somente leitura)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lint do DB, distribuição de steps, últimas transições e bots pausados em 24h.
            </p>
            <Button onClick={() => run("real")} disabled={loading !== null} variant="secondary" className="w-full" size="lg">
              {loading === "real" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Testar com dados reais
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ---------- E2E real ---------- */}
      <Card className="border-emerald-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-500" />
            Teste end-to-end real
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cria um lead fictício (telefone <code className="px-1 rounded bg-muted">5500000…</code>), dispara mensagens reais
            no <code className="px-1 rounded bg-muted">whapi-webhook</code> e percorre o fluxo do início ao fim.
            Sem custo de WhatsApp, sem delay de mídia, OCR mockado.
          </p>

          <div className="flex gap-2 items-center">
            <Select value={scenario} onValueChange={setScenario} disabled={loading !== null}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={runE2E} disabled={loading !== null} size="lg" className="gap-2">
              {loading === "e2e" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Rodar bot do início ao fim
            </Button>
          </div>

          {loading === "e2e" && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Turno {liveTurn} em andamento…
            </div>
          )}

          {e2eResult && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={e2eResult.status === "completed" ? "default" : e2eResult.status === "stuck" || e2eResult.status === "error" ? "destructive" : "secondary"}>
                  {e2eResult.status}
                </Badge>
                <span><strong>{e2eResult.turns}</strong> turnos</span>
                <span>último step: <code className="px-1 rounded bg-background">{e2eResult.lastStep || "∅"}</code></span>
                <span>customer status: <code className="px-1 rounded bg-background">{e2eResult.finalCustomerStatus || "∅"}</code></span>
                <span className="ml-auto">
                  <Button size="sm" variant="ghost" onClick={() => cleanupRun(e2eResult.runId)} className="gap-1 h-7">
                    <Trash2 className="h-3 w-3" /> Limpar
                  </Button>
                </span>
              </div>

              {e2eResult.checks?.length > 0 && (
                <div className="grid gap-1">
                  {e2eResult.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {c.passed
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                      <span className={c.passed ? "" : "text-destructive"}>{c.name}</span>
                      {c.detail && <span className="text-muted-foreground font-mono">— {c.detail}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {timeline.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Transcrição ({timeline.length} eventos)</h3>
              <div className="space-y-1.5 max-h-[600px] overflow-auto pr-2">
                {timeline.map((row, i) => {
                  const dirColor =
                    row.direction === "inbound" ? "bg-blue-500/10 border-blue-500/30" :
                    row.direction === "outbound" ? "bg-emerald-500/10 border-emerald-500/30" :
                    row.direction === "error" ? "bg-destructive/10 border-destructive/40" :
                    "bg-muted/40 border-border";
                  const dirLabel =
                    row.direction === "inbound" ? "USER" :
                    row.direction === "outbound" ? "BOT" :
                    row.direction === "error" ? "ERR" : "SYS";
                  return (
                    <div key={i} className={`rounded-md border p-2 text-xs ${dirColor}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] h-5">T{row.turn}</Badge>
                        <Badge variant="outline" className="text-[10px] h-5 font-mono">{dirLabel}</Badge>
                        <Badge variant="outline" className="text-[10px] h-5">{row.kind}</Badge>
                        {row.latency_ms != null && <span className="text-muted-foreground ml-auto">{row.latency_ms}ms</span>}
                      </div>
                      {row.content && (
                        <div className="font-mono text-[11px] whitespace-pre-wrap break-words">
                          {String(row.content).slice(0, 400)}
                          {String(row.content).length > 400 ? "…" : ""}
                        </div>
                      )}
                      {(row.conversation_step_before || row.conversation_step_after) && (
                        <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                          {row.conversation_step_before || "∅"} → <span className="text-foreground">{row.conversation_step_after || "∅"}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {fakeReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Resultado — fictícios</span>
              <Badge variant={fakeReport.failed === 0 ? "default" : "destructive"}>
                {fakeReport.passed}/{fakeReport.total} passaram
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fakeReport.results.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-md border">
                  {r.passed
                    ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">[{r.id.toString().padStart(2, "0")}] {r.name}</div>
                    {!r.passed && (
                      <div className="mt-1 text-xs space-y-1 font-mono">
                        <div className="text-muted-foreground">esperado: <span className="text-foreground">{JSON.stringify(r.expected)}</span></div>
                        <div className="text-muted-foreground">obtido: <span className="text-destructive">{JSON.stringify(r.got)}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {realReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Resultado — dados reais</span>
              <Badge variant={(realReport.lint?.length ?? 0) === 0 ? "default" : "destructive"}>
                {realReport.lint?.length ?? 0} problema(s) no DB
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2">Distribuição de conversation_step</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(realReport.distribution).map(([k, v]) => (
                  <div key={k} className="rounded-md border p-2 text-sm">
                    <div className="text-muted-foreground text-xs">{k}</div>
                    <div className="font-mono text-lg">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Lint ({realReport.lint?.length ?? 0})</h3>
              {(realReport.lint?.length ?? 0) === 0 ? (
                <div className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Banco limpo, sem problemas.
                </div>
              ) : (
                <div className="space-y-1">
                  {realReport.lint.map((l, i) => (
                    <div key={i} className="text-xs font-mono p-2 rounded border border-destructive/30">
                      <Badge variant="destructive" className="mr-2">{l.severity}</Badge>
                      {l.category} — step={l.step} — {l.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">
                Bots pausados nas últimas 24h: <span className="font-mono">{realReport.bot_paused_24h}</span>
              </h3>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Últimas transições ({realReport.recent_transitions?.length ?? 0})</h3>
              <div className="space-y-1 max-h-96 overflow-auto">
                {(realReport.recent_transitions ?? []).map((t, i) => (
                  <div key={i} className="text-xs font-mono p-2 rounded border">
                    <span className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                    {" — "}<span>{t.from_step ?? "∅"}</span>{" → "}
                    <span className="text-primary">{t.to_step ?? "∅"}</span>
                    {" ("}{t.trigger_type}{")"}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
