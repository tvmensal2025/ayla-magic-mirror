import { ExternalLink } from "lucide-react";

interface PreviewTabProps {
  slug: string;
  baseUrl: string;
}

export function PreviewTab({ slug, baseUrl }: PreviewTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href={`https://${baseUrl}/${slug}`} target="_blank" rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all duration-300 text-primary-foreground hover:shadow-lg"
          style={{ background: "var(--gradient-green)" }}>
          <ExternalLink className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" /> Página de Cliente
        </a>
        <a href={`https://${baseUrl}/licenciado/${slug}`} target="_blank" rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-3.5 rounded-xl hover:bg-primary/10 transition-all duration-300">
          <ExternalLink className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" /> Página de Licenciado
        </a>
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-lg">
        <div className="bg-secondary/50 dark:bg-secondary px-4 py-3 flex items-center gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-destructive/60" />
            <span className="w-3 h-3 rounded-full bg-accent/60" />
            <span className="w-3 h-3 rounded-full bg-primary/60" />
          </div>
          <span className="text-xs text-muted-foreground ml-2 truncate font-mono">{baseUrl}/{slug}</span>
        </div>
        <iframe
          key={`preview-${slug}`}
          src={`https://${baseUrl}/${slug}`}
          className="w-full border-0"
          style={{ height: "70vh", minHeight: "400px" }}
          title="Preview da landing page"
          loading="lazy"
        />
      </div>
    </div>
  );
}
