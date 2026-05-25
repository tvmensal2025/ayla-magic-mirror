import { lazy, Suspense, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Flame, Users } from "lucide-react";
import { SalesFunnelBoard } from "./SalesFunnelBoard";

const PosVendaKanban = lazy(() => import("./PosVendaKanban"));

interface CrmTabsProps {
  consultantId: string;
  instanceName?: string | null;
  onOpenChat?: (phone: string) => void;
}

export function CrmTabs({ consultantId, instanceName, onOpenChat }: CrmTabsProps) {
  const [tab, setTab] = useState<"funil" | "posvenda">("funil");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "funil" | "posvenda")} className="flex flex-col flex-1 min-h-0">
        <div className="px-3 pt-3">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="funil" className="gap-1.5">
              <Flame className="w-4 h-4" />
              <span>Funil de Vendas</span>
            </TabsTrigger>
            <TabsTrigger value="posvenda" className="gap-1.5">
              <Users className="w-4 h-4" />
              <span>Pós-Venda / Clientes</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="funil" className="flex-1 min-h-0 mt-2 overflow-auto data-[state=inactive]:hidden">
          <SalesFunnelBoard consultantId={consultantId} onOpenChat={onOpenChat} />
        </TabsContent>
        <TabsContent value="posvenda" className="flex-1 min-h-0 mt-2 overflow-auto data-[state=inactive]:hidden">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <PosVendaKanban consultantId={consultantId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
