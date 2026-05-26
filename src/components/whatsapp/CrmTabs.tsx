import { KanbanBoard } from "./KanbanBoard";

interface CrmTabsProps {
  consultantId: string;
  instanceName?: string | null;
  onOpenChat?: (phone: string) => void;
}

export function CrmTabs({ consultantId, instanceName }: CrmTabsProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 pt-3">
      <KanbanBoard consultantId={consultantId} instanceName={instanceName} />
    </div>
  );
}
