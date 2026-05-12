import { FolderOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const DRIVE_URL = "https://drive.google.com/drive/folders/1KupNLRpZaJwHfgRUgbWV-cGYQenreSfu";

export function MaterialsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold text-foreground text-lg">Materiais para Download</h2>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Acesse todos os materiais de apoio, apresentações e vídeos no Google Drive.
      </p>

      <Button
        onClick={() => window.open(DRIVE_URL, "_blank", "noopener,noreferrer")}
        className="gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        Abrir Materiais no Google Drive
      </Button>
    </div>
  );
}
