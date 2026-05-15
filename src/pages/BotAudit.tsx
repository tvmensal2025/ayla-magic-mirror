import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Database } from "lucide-react";
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

export default function BotAudit() {
  const [loading, setLoading] = useState<"fake" | "real" | null>(null);
  const [fakeReport, setFakeReport] = useState<FakeReport | null>(null);
  const [realReport, setRealReport] = useState<RealReport | null>(null);

  async function run(mode: "fake" | "real") {
    setLoading(mode);
    try {
      const { data, error } = await supabase.functions.invoke(`bot-audit-runner?mode=${mode}`, {
        method: "GET",
      });
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
            <Button
              onClick={() => run("fake")}
              disabled={loading !== null}
              className="w-full"
              size="lg"
            >
              {loading === "fake" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Testar com dados fictícios
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Dados reais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Roda o lint no DB, conta customers por tipo de step, traz últimas 20 transições e bots pausados em 24h. Só leitura.
            </p>
            <Button
              onClick={() => run("real")}
              disabled={loading !== null}
              variant="secondary"
              className="w-full"
              size="lg"
            >
              {loading === "real" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Testar com dados reais
            </Button>
          </CardContent>
        </Card>
      </div>

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
                  {r.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      [{r.id.toString().padStart(2, "0")}] {r.name}
                    </div>
                    {!r.passed && (
                      <div className="mt-1 text-xs space-y-1 font-mono">
                        <div className="text-muted-foreground">
                          esperado: <span className="text-foreground">{JSON.stringify(r.expected)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          obtido: <span className="text-destructive">{JSON.stringify(r.got)}</span>
                        </div>
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
              <h3 className="font-semibold text-sm mb-2">
                Lint ({realReport.lint?.length ?? 0})
              </h3>
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
                    {" — "}
                    <span>{t.from_step ?? "∅"}</span>
                    {" → "}
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
