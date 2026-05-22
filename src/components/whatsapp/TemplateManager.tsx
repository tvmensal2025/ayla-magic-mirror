import { useState } from "react";
import { Wand2, Mic2 } from "lucide-react";
import type { MessageTemplate } from "@/types/whatsapp";
import { TemplateCreateForm } from "./templates/TemplateCreateForm";
import { TemplateListItem } from "./templates/TemplateListItem";
import { TemplatePreviewDialog } from "./templates/TemplatePreviewDialog";
import { VoiceTemplatesPanel } from "./voice/VoiceTemplatesPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface TemplateManagerProps {
  templates: MessageTemplate[];
  isLoading: boolean;
  consultantId: string;
  onCreateTemplate: (name: string, content: string, mediaType?: string, mediaUrl?: string | null, imageUrl?: string | null) => Promise<void>;
  onUpdateTemplate: (id: string, updates: { name?: string; image_url?: string | null; content?: string; media_url?: string | null; media_type?: string }) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onRefetch?: () => Promise<void> | void;
}

export function TemplateManager({
  templates,
  isLoading,
  consultantId,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onRefetch,
}: TemplateManagerProps) {
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

  const ownedOriginIds = new Set(
    templates.filter((t) => t.consultant_id === consultantId && t.origin_template_id).map((t) => t.origin_template_id!),
  );
  const visibleTemplates = templates.filter((t) => !ownedOriginIds.has(t.id));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="text">
        <TabsList>
          <TabsTrigger value="text"><Wand2 className="w-3.5 h-3.5 mr-1" /> Templates</TabsTrigger>
          <TabsTrigger value="voice"><Mic2 className="w-3.5 h-3.5 mr-1" /> Voz personalizada</TabsTrigger>
        </TabsList>

        <TabsContent value="text">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-purple-950/10">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/3 rounded-full blur-3xl" />
            <div className="relative p-5 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
                  <Wand2 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-foreground text-lg">Templates</h3>
                  <p className="text-xs text-muted-foreground">Texto, áudio, imagem e documentos personalizáveis</p>
                </div>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
              ) : visibleTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum template salvo</p>
              ) : (
                <div className="space-y-2 mb-5">
                  {visibleTemplates.map((t) => (
                    <TemplateListItem
                      key={t.id}
                      template={t}
                      consultantId={consultantId}
                      onUpdateTemplate={onUpdateTemplate}
                      onDeleteTemplate={onDeleteTemplate}
                      onPreview={setPreviewTemplate}
                      onForked={onRefetch}
                    />
                  ))}
                </div>
              )}

              <TemplateCreateForm onCreateTemplate={onCreateTemplate} />
            </div>
            <TemplatePreviewDialog template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
          </div>
        </TabsContent>

        <TabsContent value="voice">
          <VoiceTemplatesPanel consultantId={consultantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
