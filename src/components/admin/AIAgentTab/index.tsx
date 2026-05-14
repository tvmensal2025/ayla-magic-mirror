import { useEffect, useState } from "react";
import { Bot, MessagesSquare, Library, Loader2, Brain, Mic, FileText, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LiveConversationsPanel } from "./LiveConversationsPanel";
import { MediaColumn } from "./MediaColumn";
import { RoteiroColumn } from "./RoteiroColumn";
import { AIDecisionsPanel } from "./AIDecisionsPanel";
import { SlotsPanel } from "./SlotsPanel";

type SubTab = "atendimentos" | "agente" | "decisoes";
type AgenteSub = "audios" | "midias" | "roteiro";

export function AIAgentTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [sub, setSub] = useState<SubTab>("atendimentos");
  const [agenteSub, setAgenteSub] = useState<AgenteSub>("audios");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [personaName, setPersonaName] = useState<string>("Camila");
  const [savingEnabled, setSavingEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_agent_config")
        .select("enabled, persona_name")
        .eq("consultant_id", userId)
        .maybeSingle();
      setEnabled(data ? !!(data as any).enabled : true);
      if (data && (data as any).persona_name) {
        setPersonaName((data as any).persona_name);
      }
    })();
  }, [userId]);

  async function toggleEnabled(v: boolean) {
    setSavingEnabled(true);
    setEnabled(v);
    const { error } = await supabase
      .from("ai_agent_config")
      .upsert(
        { consultant_id: userId, enabled: v, persona_name: personaName },
        { onConflict: "consultant_id" },
      );
    setSavingEnabled(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setEnabled(!v);
    } else {
      toast({ title: v ? "🤖 IA ativada" : "⏸️ IA pausada para seus leads" });
    }
  }

  async function savePersonaName() {
    const { error } = await supabase
      .from("ai_agent_config")
      .upsert(
        { consultant_id: userId, enabled: enabled ?? true, persona_name: personaName },
        { onConflict: "consultant_id" },
      );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Nome atualizado" });
    }
  }

  const subs: { id: SubTab; label: string; icon: typeof Bot }[] = [
    { id: "atendimentos", label: "Atendimentos", icon: MessagesSquare },
    { id: "agente", label: "Agente & Mídias", icon: Library },
    { id: "decisoes", label: "Decisões da IA", icon: Brain },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <header className="flex items-center gap-3 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold font-heading text-foreground">Atendente IA — Camila</h1>
          <p className="text-xs text-muted-foreground">
            Atendimento humanizado 24/7. Quando você assumir, ela pausa automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
          {savingEnabled || enabled === null ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <span className="text-xs font-medium text-foreground">IA ativa para meus leads</span>
          <Switch
            checked={!!enabled}
            disabled={enabled === null || savingEnabled}
            onCheckedChange={toggleEnabled}
          />
        </div>
      </header>

      <nav className="flex gap-1 border-b border-border">
        {subs.map((s) => {
          const Icon = s.icon;
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-h-0">
        {sub === "atendimentos" && <LiveConversationsPanel userId={userId} />}
        {sub === "agente" && (
          <div className="flex flex-col h-full gap-3">
            <div className="flex gap-1 flex-wrap">
              {[
                { id: "audios" as const, label: "Áudios da Camila", icon: Mic },
                { id: "midias" as const, label: "Mídias livres", icon: FileText },
                { id: "roteiro" as const, label: "Roteiro", icon: BookOpen },
              ].map((t) => {
                const Icon = t.icon;
                const active = agenteSub === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setAgenteSub(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {agenteSub === "audios" && <SlotsPanel userId={userId} />}
              {agenteSub === "midias" && <MediaColumn userId={userId} />}
              {agenteSub === "roteiro" && <RoteiroColumn userId={userId} />}
            </div>
          </div>
        )}
        {sub === "decisoes" && <AIDecisionsPanel userId={userId} />}
      </div>
    </div>
  );
}