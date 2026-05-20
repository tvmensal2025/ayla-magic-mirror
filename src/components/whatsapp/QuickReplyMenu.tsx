import { useEffect, useRef } from "react";
import type { MessageTemplate } from "@/types/whatsapp";

interface QuickReplyMenuProps {
  templates: MessageTemplate[];
  search: string;
  onSelect: (template: MessageTemplate) => void;
  onClose: () => void;
}

export function QuickReplyMenu({ templates, search, onSelect, onClose }: QuickReplyMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const q = search.toLowerCase();
  // Match exato por atalho (digitou "oi" e existe template com shortcut="/oi")
  const exactShortcut = q.length >= 2
    ? templates.find((t) => (t.shortcut || "").toLowerCase() === `/${q}`)
    : null;

  const filtered = templates
    .filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      (t.shortcut || "").toLowerCase().includes(q ? `/${q}` : "")
    )
    // Atalho-match primeiro
    .sort((a, b) => {
      const aS = (a.shortcut || "").toLowerCase().startsWith(`/${q}`) ? 0 : 1;
      const bS = (b.shortcut || "").toLowerCase().startsWith(`/${q}`) ? 0 : 1;
      return aS - bS;
    });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50"
    >
      <div className="p-1">
        <p className="text-[10px] text-muted-foreground px-2 py-1">
          Respostas rápidas {exactShortcut && <span className="text-primary">· Enter envia "{exactShortcut.name}"</span>}
        </p>
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="w-full text-left px-3 py-2 hover:bg-secondary rounded transition-colors flex flex-col gap-0.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{t.name}</span>
              {t.shortcut && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary">{t.shortcut}</span>
              )}
              {t.media_type && t.media_type !== "text" && (
                <span className="text-[9px] uppercase text-muted-foreground">{t.media_type}</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">{t.content || <em>(somente mídia)</em>}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
