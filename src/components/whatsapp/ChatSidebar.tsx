import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MessageCirclePlus, X, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import type { ChatItem } from "@/hooks/useChats";

interface CustomerResult {
  name: string | null;
  phone_whatsapp: string;
}

interface ChatSidebarProps {
  chats: ChatItem[];
  isLoading: boolean;
  selectedJid: string | null;
  onSelectChat: (jid: string) => void;
  consultantId?: string;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({ chats, isLoading, selectedJid, onSelectChat, consultantId }: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const newPhoneRef = useRef<HTMLInputElement>(null);
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showNewChat) {
      setTimeout(() => newPhoneRef.current?.focus(), 100);
    }
  }, [showNewChat]);

  // Search customers from DB when search has 3+ chars
  const searchCustomers = useCallback(async (query: string) => {
    if (!consultantId || query.length < 3) { setCustomerResults([]); return; }
    try {
      const { data } = await supabase
        .from("customers")
        .select("name, phone_whatsapp")
        .eq("consultant_id", consultantId)
        .or(`name.ilike.%${query}%,phone_whatsapp.ilike.%${query}%`)
        .limit(5);
      setCustomerResults(data || []);
    } catch {
      setCustomerResults([]);
    }
  }, [consultantId]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchCustomers(search), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, searchCustomers]);

  const handleStartNewChat = () => {
    const clean = newPhone.replace(/\D/g, "");
    if (clean.length < 10) return;
    const phone = clean.startsWith("55") ? clean : `55${clean}`;
    const jid = `${phone}@s.whatsapp.net`;
    onSelectChat(jid);
    setNewPhone("");
    setShowNewChat(false);
  };

  const handleStartChatFromCustomer = (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    const normalized = clean.startsWith("55") ? clean : `55${clean}`;
    const jid = `${normalized}@s.whatsapp.net`;
    onSelectChat(jid);
    setSearch("");
    setCustomerResults([]);
  };

  const filtered = chats.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.remoteJid.includes(search)
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Conversas</h3>
        <MessageCirclePlus
          className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
          onClick={() => setShowNewChat((v) => !v)}
        />
      </div>

      {/* New chat input */}
      {showNewChat && (
        <div className="p-2 border-b border-border bg-secondary/30">
          <p className="text-[10px] text-muted-foreground mb-1.5">Nova conversa — digite o número:</p>
          <div className="flex gap-1.5">
            <Input
              ref={newPhoneRef}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="h-8 text-xs flex-1 bg-background border-border/50"
              onKeyDown={(e) => e.key === "Enter" && handleStartNewChat()}
            />
            <button
              onClick={handleStartNewChat}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Iniciar
            </button>
            <button
              onClick={() => { setShowNewChat(false); setNewPhone(""); }}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-secondary border-none"
          />
        </div>
      </div>

      {/* Customer search results from DB */}
      {customerResults.length > 0 && (
        <div className="border-b border-border">
          <p className="text-[10px] text-muted-foreground px-3 pt-1.5 pb-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Clientes encontrados
          </p>
          {customerResults.map((cr) => (
            <button
              key={cr.phone_whatsapp}
              onClick={() => handleStartChatFromCustomer(cr.phone_whatsapp)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/80"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-accent/20 text-accent text-[10px]">
                  {(cr.name || "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-xs font-medium text-foreground truncate block sensitive-name">{cr.name || cr.phone_whatsapp}</span>
                <span className="text-[10px] text-muted-foreground sensitive-phone">{cr.phone_whatsapp}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Chat list */}
      <ScrollArea className="flex-1">
        {isLoading && chats.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Carregando conversas...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        )}
        {filtered.map((chat) => (
          <button
            key={chat.remoteJid}
            onClick={() => onSelectChat(chat.remoteJid)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/80 ${
              selectedJid === chat.remoteJid ? "bg-secondary" : ""
            }`}
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={chat.profilePicUrl} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {chat.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate sensitive-name">
                  {chat.name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                  {formatTime(chat.lastMessageTimestamp)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                  {chat.lastMessage || "..."}
                </span>
                {chat.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 shrink-0 ml-1">
                    {chat.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </ScrollArea>
    </div>
  );
}
