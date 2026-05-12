import { ExternalLink, Copy, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LinkCardProps {
  emoji: string;
  title: string;
  description: string;
  url: string;
  onCopy: (url: string) => void;
  previewUrl: string;
}

export function LinkCard({ emoji, title, description, url, onCopy, previewUrl }: LinkCardProps) {
  return (
    <div className="group relative bg-card rounded-2xl border border-border p-5 sm:p-6 transition-all duration-300 hover:border-primary/20 hover:shadow-lg overflow-hidden">
      {/* Subtle hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-lg ring-1 ring-primary/20 group-hover:scale-110 transition-transform duration-300">
              {emoji}
            </div>
            <div>
              <h3 className="font-heading font-bold text-foreground text-sm sm:text-base">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" 
            className="text-muted-foreground hover:text-primary transition-all shrink-0 p-1.5 rounded-lg hover:bg-primary/10">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-secondary/50 dark:bg-secondary px-3 py-2.5 rounded-xl text-primary text-sm break-all font-mono border border-border/50">
            {url.replace("https://", "")}
          </code>
          <Button size="sm" variant="outline" onClick={() => onCopy(url)} className="gap-1.5 shrink-0 rounded-xl hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all">
            <Copy className="w-3.5 h-3.5" /> Copiar
          </Button>
        </div>
      </div>
    </div>
  );
}
