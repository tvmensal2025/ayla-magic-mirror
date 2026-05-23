import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Step, renderVarsPreview, getButtons } from "./flowTypes";
import { Mic, Image as ImageIcon, Video, CheckCheck } from "lucide-react";

interface Props {
  step: Step | null;
  consultantName?: string;
}

/**
 * Mockup fiel de uma conversa do WhatsApp. Renderiza o passo selecionado
 * como bolhas verdes do bot, com variáveis substituídas por exemplos.
 * Mídia aparece como placeholders (chip de áudio, miniatura de imagem,
 * caixa de vídeo) sem precisar carregar o arquivo real.
 */
export default function WhatsAppPreview({ step, consultantName }: Props) {
  const renderedText = useMemo(() => renderVarsPreview(step?.message_text), [step?.message_text]);
  const buttons = useMemo(() => (step ? getButtons(step) : []), [step]);

  return (
    <div className="sticky top-4 mx-auto w-full max-w-[380px] overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-foreground/80 shadow-2xl">
      {/* Header WhatsApp */}
      <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
        <div className="h-9 w-9 shrink-0 rounded-full bg-white/20 grid place-items-center text-sm font-semibold">
          {(consultantName?.[0] || "B").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{consultantName || "Bot"}</div>
          <div className="text-[11px] text-white/70">online agora</div>
        </div>
      </div>

      {/* Conteúdo */}
      <div
        className="min-h-[460px] space-y-2 bg-[#ECE5DD] p-3"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.3) 0%, transparent 50%)",
        }}
      >
        {!step && (
          <div className="grid h-[440px] place-items-center text-center text-xs text-foreground/60">
            Selecione um passo à esquerda<br />para ver como o cliente vai receber
          </div>
        )}

        {step && (
          <>
            {/* Mídia (placeholders) */}
            {step.slot_key && <MediaChip slot={step.slot_key} />}

            {/* Texto */}
            {renderedText && (
              <BotBubble>
                <p className="whitespace-pre-wrap break-words">{renderedText}</p>
              </BotBubble>
            )}

            {/* Botões */}
            {buttons.length > 0 && (
              <div className="mt-1 space-y-1">
                {buttons.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="rounded-md bg-white px-3 py-2 text-center text-[13px] font-medium text-[#075E54] shadow-sm"
                  >
                    {b.title}
                  </div>
                ))}
              </div>
            )}

            {/* Estado vazio */}
            {!renderedText && buttons.length === 0 && !step.slot_key && (
              <BotBubble>
                <p className="text-xs italic text-foreground/50">
                  (sem texto, mídia ou botões — adicione conteúdo na coluna ao lado)
                </p>
              </BotBubble>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 bg-[#F0F0F0] px-3 py-2">
        <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs text-foreground/40">
          Mensagem
        </div>
        <Mic className="h-4 w-4 text-[#075E54]" />
      </div>
    </div>
  );
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <div className="relative max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-[13px] text-foreground shadow-sm">
        {children}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-foreground/50">
          14:32
          <CheckCheck className="h-3 w-3 text-[#34B7F1]" />
        </div>
      </div>
    </div>
  );
}

function MediaChip({ slot: _slot }: { slot: string }) {
  // Sem fetch — só mostra que o passo TEM mídia configurada. Real virá do
  // inspector que já conhece a contagem via mediaCounts.
  return (
    <div className={cn("flex flex-wrap gap-1")}>
      <Pill icon={Mic} label="Áudio" />
      <Pill icon={ImageIcon} label="Imagem" />
      <Pill icon={Video} label="Vídeo" />
    </div>
  );
}

function Pill({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] text-foreground/70 shadow-sm">
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}
