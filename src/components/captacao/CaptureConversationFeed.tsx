import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Mic, ImageIcon, Video, FileText, Loader2 } from "lucide-react";

interface Props {
  customerId: string;
  /** Quantas mensagens exibir. Default 12. */
  limit?: number;
}

interface ConvRow {
  id: string;
  message_direction: string;
  message_text: string | null;
  message_type: string | null;
  created_at: string;
  slot_key: string | null;
}

function iconFor(type: string | null) {
  switch ((type || "").toLowerCase()) {
    case "audio": return <Mic className="w-3 h-3" />;
    case "image": return <ImageIcon className="w-3 h-3" />;
    case "video": return <Video className="w-3 h-3" />;
    case "document": return <FileText className="w-3 h-3" />;
    default: return <MessageCircle className="w-3 h-3" />;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function sortRows(rows: ConvRow[], limit: number) {
  return [...rows]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-limit);
}

export function CaptureConversationFeed({ customerId, limit = 12 }: Props) {
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const scheduleScrollToBottom = useCallback((force = false) => {
    if (!force && !stickRef.current) return;
    const run = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 80);
    window.setTimeout(run, 240);
  }, []);

  useEffect(() => {
    stickRef.current = true;
    scheduleScrollToBottom(true);
  }, [customerId, scheduleScrollToBottom]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, message_direction, message_text, message_type, created_at, slot_key")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!mounted) return;
      setRows(sortRows((data as ConvRow[]) || [], limit));
      setLoading(false);
    };
    void load();

    const ch = supabase
      .channel(`conv-feed-${customerId}-${Math.random().toString(36).slice(2, 6)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${customerId}` },
        (payload) => {
          setRows((prev) => sortRows([...prev, payload.new as ConvRow], limit));
        }
      )
      .subscribe();

    const poll = window.setInterval(load, 8000);

    return () => {
      mounted = false;
      window.clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [customerId, limit]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const d = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = d < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    const sentinel = bottomRef.current;
    if (!scroller || !sentinel) return;
    const go = () => scheduleScrollToBottom();
    go();
    const ro = new ResizeObserver(go);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [rows.length]);

  return (
    <div className="rounded-lg border border-border bg-card/30 overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <MessageCircle className="w-3 h-3 text-primary" /> Conversa ao vivo
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      <div ref={scrollRef} className="max-h-56 overflow-y-auto p-2 space-y-1.5 bg-[#0b141a]/40">
        {loading && (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px] gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> carregando…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="text-[10px] italic text-muted-foreground text-center py-4">
            Nenhuma mensagem ainda. Envie um passo para começar.
          </p>
        )}
        {rows.map((r) => {
          const out = r.message_direction === "outbound";
          const text = r.message_text || `[${r.message_type || "mídia"}]`;
          return (
            <div key={r.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-2 py-1.5 shadow-sm ${
                  out
                    ? "bg-[#005c4b] text-white rounded-tr-sm"
                    : "bg-[#202c33] text-white rounded-tl-sm"
                }`}
              >
                <div className="flex items-center gap-1 text-[9px] opacity-70 mb-0.5">
                  {iconFor(r.message_type)}
                  <span className="uppercase font-semibold">{out ? "Você" : "Lead"}</span>
                  <span>·</span>
                  <span className="tabular-nums">{fmtTime(r.created_at)}</span>
                  {r.slot_key && <span className="ml-1 opacity-60">· {r.slot_key}</span>}
                </div>
                <p className="text-[11px] leading-snug whitespace-pre-wrap break-words">{text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} aria-hidden className="h-1" />
      </div>
    </div>
  );
}
