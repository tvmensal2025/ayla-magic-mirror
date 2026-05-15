import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bell, BarChart3, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HandoffAlert {
  id: string;
  customer_id: string | null;
  phone: string | null;
  reason: string | null;
  user_message: string | null;
  created_at: string;
}

interface AbResult {
  id: string;
  template_key: string;
  step_key: string;
  variant: string;
  sent_count: number;
  replied_count: number;
  advanced_count: number;
  last_sent_at: string | null;
}

export default function AdminBotTools() {
  const [handoffs, setHandoffs] = useState<HandoffAlert[]>([]);
  const [abResults, setAbResults] = useState<AbResult[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: h }, { data: ab }] = await Promise.all([
      supabase.from("bot_handoff_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      supabase.from("bot_message_ab_results").select("*").order("sent_count", { ascending: false }).limit(100),
    ]);
    setHandoffs((h as any) || []);
    setAbResults((ab as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolveHandoff = async (alert: HandoffAlert) => {
    if (alert.customer_id) {
      await supabase.from("customers").update({
        bot_paused_until: null, bot_paused_reason: null,
      }).eq("id", alert.customer_id);
    }
    const { error } = await supabase.from("bot_handoff_alerts").update({
      resolved_at: new Date().toISOString(),
    }).eq("id", alert.id);
    if (error) { toast.error("Erro ao reativar bot"); return; }
    toast.success("Bot reativado para esse cliente");
    load();
  };

  const rate = (num: number, den: number) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" /> Ferramentas do Bot
              </h1>
              <p className="text-sm text-muted-foreground">Handoffs pendentes, métricas A/B e saúde do bot</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Atualizar</Button>
        </div>

        <Tabs defaultValue="handoffs">
          <TabsList>
            <TabsTrigger value="handoffs">
              <Bell className="h-4 w-4 mr-2" /> Handoffs
              {handoffs.length > 0 && <Badge variant="destructive" className="ml-2">{handoffs.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ab">
              <BarChart3 className="h-4 w-4 mr-2" /> A/B Testing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="handoffs" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>Conversas pausadas (handoff humano)</CardTitle>
                <CardDescription>
                  Clientes que pediram pra falar com humano. O bot fica pausado por 24h.
                  Clique em "Reativar bot" depois de responder.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : handoffs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum handoff pendente. 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {handoffs.map(h => (
                      <div key={h.id} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline">{h.phone || "—"}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(h.created_at).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          {h.user_message && (
                            <p className="text-sm mt-1 italic text-muted-foreground line-clamp-2">"{h.user_message}"</p>
                          )}
                        </div>
                        <Button size="sm" variant="default" onClick={() => resolveHandoff(h)}>
                          Reativar bot
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ab" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>Performance de mensagens (A/B)</CardTitle>
                <CardDescription>
                  Compare variantes pelas taxas de resposta e avanço de etapa. Variantes com baixa taxa devem ser revisadas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : abResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados ainda. As métricas aparecem conforme o bot conversa.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-2">Etapa</th>
                          <th className="py-2 pr-2">Variante</th>
                          <th className="py-2 pr-2 text-right">Enviadas</th>
                          <th className="py-2 pr-2 text-right">Respostas</th>
                          <th className="py-2 pr-2 text-right">Avanços</th>
                          <th className="py-2 pr-2 text-right">% Resp</th>
                          <th className="py-2 pr-2 text-right">% Avanço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {abResults.map(r => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 pr-2 font-mono text-xs">{r.step_key}</td>
                            <td className="py-2 pr-2"><Badge variant="outline">{r.variant}</Badge></td>
                            <td className="py-2 pr-2 text-right">{r.sent_count}</td>
                            <td className="py-2 pr-2 text-right">{r.replied_count}</td>
                            <td className="py-2 pr-2 text-right">{r.advanced_count}</td>
                            <td className="py-2 pr-2 text-right">{rate(r.replied_count, r.sent_count)}</td>
                            <td className="py-2 pr-2 text-right font-medium text-primary">
                              {rate(r.advanced_count, r.sent_count)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
