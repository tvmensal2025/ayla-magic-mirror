/**
 * AutoLearningTab — aba central de auto aprendizado da IA.
 *
 * Integra:
 * 1. AiFeedbackPanel — avaliação de respostas (👍/👎) → alimenta few-shot
 * 2. LearningHealthPanel — padrões aprendidos por intent
 * 3. FlowFunnelPanel — funil de abandono por step do fluxo
 *
 * Esta aba fecha o ciclo: consultor avalia → IA aprende → funil melhora.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Cpu, GitBranch } from "lucide-react";
import { AiFeedbackPanel } from "./AiFeedbackPanel";
import { LearningHealthPanel } from "./LearningHealthPanel";
import { FlowFunnelPanel } from "./FlowFunnelPanel";

interface Props {
  consultantId: string;
}

type SubView = "feedback" | "patterns" | "funnel";

export function AutoLearningTab({ consultantId }: Props) {
  const [sub, setSub] = useState<SubView>("feedback");

  const tabs: { id: SubView; label: string; icon: any; description: string }[] = [
    {
      id: "feedback",
      label: "Feedback",
      icon: MessageSquare,
      description: "Avalie respostas da IA para treiná-la",
    },
    {
      id: "patterns",
      label: "Padrões",
      icon: Cpu,
      description: "O que a IA aprendeu por intenção",
    },
    {
      id: "funnel",
      label: "Funil",
      icon: GitBranch,
      description: "Abandono por passo do fluxo",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Explicação do ciclo */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          Como funciona o auto aprendizado
        </h3>
        <div className="grid sm:grid-cols-3 gap-3 mt-2">
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold text-sm shrink-0">1.</span>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Você avalia</strong> as respostas da IA com 👍 ou 👎 na aba Feedback.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold text-sm shrink-0">2.</span>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">A IA aprende</strong> os padrões aprovados e evita os reprovados (cron diário 04:15 UTC).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold text-sm shrink-0">3.</span>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">O funil melhora</strong> — menos handoffs, menos abandono, mais cadastros.
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navegação */}
      <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 w-full sm:w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              size="sm"
              variant={sub === t.id ? "default" : "ghost"}
              onClick={() => setSub(t.id)}
              className="h-8 gap-1.5"
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {sub === "feedback" && <AiFeedbackPanel consultantId={consultantId} />}
      {sub === "patterns" && <LearningHealthPanel consultantId={consultantId} />}
      {sub === "funnel" && <FlowFunnelPanel consultantId={consultantId} />}
    </div>
  );
}
