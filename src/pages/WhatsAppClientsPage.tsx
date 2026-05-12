import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Phone, Mail, MapPin, FileText, Calendar, Download, Users, CheckCircle, AlertTriangle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Customer {
  id: string;
  name: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone_whatsapp: string;
  phone_landline: string | null;
  data_nascimento: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  cep: string | null;
  distribuidora: string | null;
  numero_instalacao: string | null;
  electricity_bill_value: number | null;
  conversation_step: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: "Pendente", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  portal_submitting: { label: "Enviando", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  awaiting_otp: { label: "Aguardando OTP", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  validating_otp: { label: "Validando OTP", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  awaiting_signature: { label: "Aguardando Assinatura", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  complete: { label: "Completo", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  approved: { label: "Aprovado", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  registered_igreen: { label: "Cadastrado iGreen", color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20" },
  worker_offline: { label: "Worker Offline", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  automation_failed: { label: "Falha", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  lead: { label: "Lead", color: "text-sky-500", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  data_complete: { label: "Dados Completos", color: "text-teal-500", bg: "bg-teal-500/10", border: "border-teal-500/20" },
  devolutiva: { label: "Devolutiva", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  rejected: { label: "Reprovado", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
};

const stepLabels: Record<string, string> = {
  welcome: "Boas-vindas", aguardando_conta: "Aguardando Conta",
  processando_ocr_conta: "OCR Conta", confirmando_dados_conta: "Confirmando Dados",
  ask_tipo_documento: "Tipo Doc", aguardando_doc_frente: "Doc Frente",
  aguardando_doc_verso: "Doc Verso", confirmando_dados_doc: "Confirmando Doc",
  ask_name: "Nome", ask_cpf: "CPF", ask_rg: "RG", ask_birth_date: "Data Nasc",
  ask_phone_confirm: "Conf. Telefone", ask_phone: "Telefone", ask_email: "Email",
  ask_cep: "CEP", ask_number: "Número", ask_complement: "Complemento",
  ask_installation_number: "Nº Instalação", ask_bill_value: "Valor Conta",
  ask_finalizar: "Finalizar", finalizando: "Finalizando",
  portal_submitting: "Enviando Portal", aguardando_otp: "Aguardando OTP",
  validando_otp: "Validando OTP", aguardando_assinatura: "Aguardando Assinatura",
  complete: "Completo",
};

export default function WhatsAppClientsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Usuário não autenticado"); return; }
      const { data: consultant } = await supabase.from("consultants").select("id").eq("id", user.id).single();
      if (!consultant) { toast.error("Consultor não encontrado"); return; }
      const { data, error } = await supabase.from("customers").select("*").eq("consultant_id", consultant.id).order("created_at", { ascending: false });
      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = !searchTerm ||
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cpf?.includes(searchTerm) ||
      c.phone_whatsapp?.includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && (filterStatus === "all" || c.status === filterStatus);
  });

  const exportToCSV = () => {
    const headers = [
      "Nome","CPF","RG","Email","Telefone","Data Nascimento",
      "Rua","Número","Complemento","Bairro","Cidade","Estado","CEP",
      "Distribuidora","Nº Instalação","Consumo Médio (kW)","Valor Conta (R$)","Desconto Cliente (%)",
      "Tipo Produto","Código iGreen","Andamento","Devolutiva","Status Financeiro",
      "Cashback","Nível Licenciado","Licenciado","Código Licenciado",
      "Indicado Por","Telefone Indicador",
      "Assinatura Cliente","Assinatura iGreen","Link Assinatura",
      "Data Cadastro","Data Ativo","Data Validado",
      "Status","Step","Observação",
    ];
    const rows = filteredCustomers.map((c: any) => [
      c.name||"",c.cpf||"",c.rg||"",c.email||"",c.phone_whatsapp||"",c.data_nascimento||"",
      c.address_street||"",c.address_number||"",c.address_complement||"",
      c.address_neighborhood||"",c.address_city||"",c.address_state||"",c.cep||"",
      c.distribuidora||"",c.numero_instalacao||"",
      c.media_consumo??"",c.electricity_bill_value??"",c.desconto_cliente??"",
      c.tipo_produto||"energia",c.igreen_code||"",c.andamento_igreen||"",
      c.devolutiva||"",c.status_financeiro||"",
      c.cashback||"",c.nivel_licenciado||"",
      c.registered_by_name||"",c.registered_by_igreen_id||"",
      c.customer_referred_by_name||"",c.customer_referred_by_phone||"",
      c.assinatura_cliente||"",c.assinatura_igreen||"",c.link_assinatura||"",
      c.data_cadastro||(c.created_at?format(new Date(c.created_at),"dd/MM/yyyy HH:mm",{locale:ptBR}):""),
      c.data_ativo||"",c.data_validado||"",
      c.status||"",stepLabels[c.conversation_step||""]||c.conversation_step||"",c.observacao||"",
    ]);
    const csv = [headers,...rows].map(r => r.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `clientes-whatsapp-${format(new Date(),"yyyy-MM-dd")}.csv`;
    link.click();
    toast.success("Exportado com sucesso!");
  };

  const stats = [
    { label: "Total", value: customers.length, icon: Users, gradient: "from-violet-500/10 to-violet-600/5", iconColor: "text-violet-500" },
    { label: "Completos", value: customers.filter(c => c.status === "complete" || c.status === "registered_igreen" || c.status === "approved").length, icon: CheckCircle, gradient: "from-emerald-500/10 to-emerald-600/5", iconColor: "text-emerald-500" },
    { label: "Pendentes", value: customers.filter(c => c.status === "pending").length, icon: Clock, gradient: "from-amber-500/10 to-amber-600/5", iconColor: "text-amber-500" },
    { label: "Falhas", value: customers.filter(c => c.status === "automation_failed" || c.status === "worker_offline").length, icon: AlertTriangle, gradient: "from-red-500/10 to-red-600/5", iconColor: "text-red-500" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">Carregando clientes...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Clientes WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Clientes cadastrados via automação WhatsApp</p>
        </div>
        <Button onClick={exportToCSV} variant="outline" className="gap-2 rounded-xl border-border/50 hover:border-primary/30">
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="premium-card !p-4">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="premium-card !p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, telefone ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-muted/30 border-border/50 rounded-xl"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[200px] h-10 rounded-xl border-border/50 bg-muted/30">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="awaiting_signature">Aguardando Assinatura</SelectItem>
              <SelectItem value="complete">Completo</SelectItem>
              <SelectItem value="registered_igreen">Cadastrado iGreen</SelectItem>
              <SelectItem value="devolutiva">Devolutiva</SelectItem>
              <SelectItem value="automation_failed">Falha</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="self-center text-xs py-2 px-3 border-border/50 whitespace-nowrap">
            {filteredCustomers.length} resultado(s)
          </Badge>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-2">
        {filteredCustomers.length === 0 ? (
          <div className="premium-card text-center py-16">
            <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum cliente encontrado</p>
          </div>
        ) : (
          filteredCustomers.map((c) => {
            const sc = statusConfig[c.status] || { label: c.status, color: "text-muted-foreground", bg: "bg-muted", border: "border-border" };
            const isExpanded = expandedId === c.id;

            return (
              <div key={c.id} className="premium-card !p-0 overflow-hidden">
                <button
                  className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl ${sc.bg} flex items-center justify-center shrink-0`}>
                    <span className={`text-sm font-bold ${sc.color}`}>
                      {(c.name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-foreground truncate">{c.name || "Nome não informado"}</span>
                      <Badge className={`text-[10px] px-2 py-0 h-5 border ${sc.bg} ${sc.color} ${sc.border}`}>{sc.label}</Badge>
                      {c.conversation_step && c.conversation_step !== "complete" && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-border/50">
                          {stepLabels[c.conversation_step] || c.conversation_step}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {c.phone_whatsapp && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone_whatsapp}</span>}
                      {c.address_city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address_city}/{c.address_state}</span>}
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(c.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                    </div>
                  </div>

                  {/* Expand icon */}
                  <div className="shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-border/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 text-sm">
                      {c.cpf && <InfoField icon={<FileText />} label="CPF" value={c.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} />}
                      {c.rg && <InfoField icon={<FileText />} label="RG" value={c.rg} />}
                      {c.email && <InfoField icon={<Mail />} label="Email" value={c.email} />}
                      {c.data_nascimento && <InfoField icon={<Calendar />} label="Nascimento" value={c.data_nascimento} />}
                      {c.distribuidora && <InfoField icon={<FileText />} label="Distribuidora" value={c.distribuidora} />}
                      {c.numero_instalacao && <InfoField icon={<FileText />} label="Nº Instalação" value={c.numero_instalacao} />}
                      {c.electricity_bill_value && <InfoField icon={<FileText />} label="Valor Conta" value={`R$ ${c.electricity_bill_value.toFixed(2)}`} />}
                    </div>
                    {c.address_street && (
                      <div className="mt-3 pt-3 border-t border-border/20">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {c.address_street}, {c.address_number}
                          {c.address_complement && ` - ${c.address_complement}`}
                          {c.address_neighborhood && ` - ${c.address_neighborhood}`}
                          {c.cep && ` - CEP: ${c.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5">
      <span className="w-4 h-4 text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
