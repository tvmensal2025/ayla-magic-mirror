import { useState } from "react";
import {
  Trash2, Phone, Mail, MapPin, Zap, ChevronDown, ChevronUp, Pencil,
  CreditCard, User, MessageCircle, Building2, AlertTriangle, FileText, ClipboardCopy, Users,
  Download, FileDown, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type Customer, formatPhoneDisplay, formatCpfDisplay, getInitials,
  getStatusBadge, getStageDotsForCustomer, isDevolutiva, buildWhatsAppMessage,
} from "./customerUtils";

function SectionLabel({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 col-span-2 mt-2 mb-1">
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3 w-3 text-primary" />
      </div>
      <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function DetailItem({ icon: Icon, label, value, sensitiveClass }: { icon: React.ElementType; label: string; value: string; sensitiveClass?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-xs text-foreground ${sensitiveClass || ""}`}>{value}</p>
      </div>
    </div>
  );
}

function DocumentDownloadSection({ customerId, customerName }: { customerId: string; customerName: string | null }) {
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Array<{ type: string; url: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetchDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("upload-documents-minio", {
        body: { customer_id: customerId },
      });
      if (fnError) throw fnError;
      if (data?.uploads?.length > 0) {
        setDocs(data.uploads.filter((u: any) => u.success));
      } else {
        setError("Nenhum documento encontrado");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao buscar documentos");
    } finally {
      setLoading(false);
    }
  };

  const docLabel: Record<string, string> = {
    conta: "Conta de Energia",
    doc_frente: "Doc Frente",
    doc_verso: "Doc Verso",
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/20">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-blue-500/10 flex items-center justify-center">
          <FileDown className="h-3 w-3 text-blue-400" />
        </div>
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Documentos</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {!docs && !error && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] gap-1 text-blue-400 border-blue-500/20 hover:bg-blue-500/10"
          onClick={handleFetchDocs}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {loading ? "Preparando..." : "Baixar Documentos"}
        </Button>
      )}

      {error && (
        <p className="text-[10px] text-muted-foreground">{error}</p>
      )}

      {docs && docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((doc) => (
            <a key={doc.type} href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-green-400 border-green-500/20 hover:bg-green-500/10">
                <Download className="w-3 h-3" /> {docLabel[doc.type] || doc.type}
              </Button>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

interface CustomerListItemProps {
  customer: Customer;
  isExpanded: boolean;
  profilePic?: string;
  deal?: { stage: string; deal_origin?: string | null };
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenWhatsApp: () => void;
  onCopyMessage: () => void;
}

export function CustomerListItem({
  customer: c, isExpanded, profilePic, deal,
  onToggleExpand, onEdit, onDelete, onOpenWhatsApp, onCopyMessage,
}: CustomerListItemProps) {
  const status = getStatusBadge(c.status);
  const hasDevolutiva = isDevolutiva(c);
  const stageDots = getStageDotsForCustomer(c.status, deal);
  const reachedStageLabels = stageDots.filter((dot) => dot.reached).map((dot) => dot.label);

  return (
    <div className={`rounded-xl border transition-all duration-200 ${isExpanded ? "border-primary/20 bg-primary/[0.02] shadow-md shadow-primary/5" : hasDevolutiva ? "border-red-500/20 bg-red-500/[0.02] hover:border-red-500/30" : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-2 shrink-0">
          <Avatar className="h-10 w-10 shrink-0 border border-primary/10">
            <AvatarImage src={profilePic} />
            <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-bold text-primary">
              {getInitials(c.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1.5 min-w-[20px]">
            {stageDots.map((dot) => (
              <div
                key={dot.key}
                title={`${dot.label} ${dot.reached ? "✓ Enviado" : "– Falta avisar"}`}
                className={`h-2.5 w-2.5 rounded-full border transition-all ${dot.reached ? `${dot.color} border-transparent` : "bg-muted/30 border-border/50"}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate sensitive-name">{c.name || "Sem nome"}</p>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${status.className}`}>{status.label}</Badge>
            {(c.tipo_produto === "telefonia") && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-purple-500/15 text-purple-400 border-purple-500/20">
                📱 Telecom
              </Badge>
            )}
            {hasDevolutiva && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-red-500/15 text-red-400 border-red-500/20">
                ⚠️ Devolutiva
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground">CRM:</span>
            {reachedStageLabels.length > 0 ? (
              <span className="text-[10px] text-muted-foreground">{reachedStageLabels.join(" • ")}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Sem aviso enviado</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-2.5 w-2.5" />
              <span className="sensitive-phone">{formatPhoneDisplay(c.phone_whatsapp)}</span>
            </span>
            {c.distribuidora && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-2.5 w-2.5" />
                {c.distribuidora}
              </span>
            )}
            {c.address_city && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {c.address_city}{c.address_state ? `/${c.address_state}` : ""}
              </span>
            )}
            {c.registered_by_name && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="h-2.5 w-2.5" />
                {c.registered_by_name}
              </span>
            )}
            {c.customer_referred_by_name && (
              <span className="text-[11px] text-blue-400 flex items-center gap-1">
                <Users className="h-2.5 w-2.5" />
                Ind: <span className="sensitive-name">{c.customer_referred_by_name}</span>
              </span>
            )}
            {c.cashback && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CreditCard className="h-2.5 w-2.5" />
                CB: {c.cashback}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {c.electricity_bill_value != null && c.electricity_bill_value > 0 && (
            <div className="text-right">
              <p className="text-xs font-bold text-primary">R${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              <p className="text-[9px] text-muted-foreground">consumo</p>
            </div>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mt-2">
            {c.igreen_code && <DetailItem icon={FileText} label="Código iGreen" value={c.igreen_code} />}
            {c.cpf && <DetailItem icon={CreditCard} label="CPF" value={formatCpfDisplay(c.cpf)} sensitiveClass="sensitive-cpf" />}
            {c.email && <DetailItem icon={Mail} label="Email" value={c.email} sensitiveClass="sensitive-email" />}
            <DetailItem icon={Phone} label="WhatsApp" value={formatPhoneDisplay(c.phone_whatsapp)} sensitiveClass="sensitive-phone" />
            {c.data_nascimento && <DetailItem icon={User} label="Nascimento" value={c.data_nascimento} sensitiveClass="sensitive-data" />}
            {c.distribuidora && <DetailItem icon={Building2} label="Distribuidora" value={c.distribuidora} />}
            {c.registered_by_name && <DetailItem icon={User} label="Licenciado" value={`${c.registered_by_name}${c.registered_by_igreen_id ? ` (${c.registered_by_igreen_id})` : ""}`} />}
            {c.customer_referred_by_name && <DetailItem icon={User} label="Indicado por" value={`${c.customer_referred_by_name}${c.customer_referred_by_phone ? ` (${c.customer_referred_by_phone})` : ""}`} sensitiveClass="sensitive-name" />}
            {c.nivel_licenciado && <DetailItem icon={User} label="Nível" value={c.nivel_licenciado} />}
            {c.andamento_igreen && <DetailItem icon={FileText} label="Andamento iGreen" value={c.andamento_igreen} />}
            {c.status_financeiro && <DetailItem icon={CreditCard} label="Status Financeiro" value={c.status_financeiro} />}
            {c.media_consumo != null && <DetailItem icon={Zap} label="Consumo Médio" value={`${c.media_consumo} kWh`} />}
            {c.desconto_cliente != null && <DetailItem icon={Zap} label="Desconto" value={`${c.desconto_cliente}%`} />}
            {c.cashback && <DetailItem icon={Zap} label="Cashback" value={c.cashback} />}
            {(c.address_city || c.address_state) && <DetailItem icon={MapPin} label="Localidade" value={`${c.address_city || ""}${c.address_state ? ` / ${c.address_state}` : ""}`} />}
            {c.address_street && <DetailItem icon={MapPin} label="Endereço" value={`${c.address_street}${c.address_number ? `, ${c.address_number}` : ""}`} />}
            {c.numero_instalacao && <DetailItem icon={Zap} label="Nº Instalação" value={c.numero_instalacao} />}
            {c.electricity_bill_value != null && <DetailItem icon={Zap} label="Valor Conta" value={`R$ ${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />}
            {c.assinatura_cliente && <DetailItem icon={FileText} label="Assinatura Cliente" value={c.assinatura_cliente} />}
            {c.assinatura_igreen && <DetailItem icon={FileText} label="Assinatura iGreen" value={c.assinatura_igreen} />}
            {c.data_cadastro && <DetailItem icon={User} label="Data Cadastro" value={c.data_cadastro} />}
            {c.data_ativo && <DetailItem icon={User} label="Data Ativo" value={c.data_ativo} />}
            {c.data_validado && <DetailItem icon={User} label="Data Validado" value={c.data_validado} />}
            {c.created_at && <DetailItem icon={User} label="Cadastrado Sistema" value={new Date(c.created_at).toLocaleDateString("pt-BR")} />}
            {c.link_assinatura && (
              <div className="flex items-start gap-2">
                <FileText className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Link Assinatura</p>
                  <a href={c.link_assinatura} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block max-w-[200px]">Abrir link</a>
                </div>
              </div>
            )}
          </div>

          {(c.devolutiva || c.observacao) && (
            <div className="mt-3 space-y-2">
              {c.devolutiva && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Devolutiva</span>
                  </div>
                  <p className="text-xs text-foreground">{c.devolutiva}</p>
                </div>
              )}
              {c.observacao && (
                <div className="rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Observação</span>
                  </div>
                  <p className="text-xs text-foreground">{c.observacao}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Documentos para download via MinIO ── */}
          <DocumentDownloadSection customerId={c.id} customerName={c.name} />

          <div className="flex justify-between gap-2 mt-3 pt-3 border-t border-border/20">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-green-400 border-green-500/20 hover:bg-green-500/10" onClick={onOpenWhatsApp}>
                <MessageCircle className="w-3 h-3" /> Enviar WhatsApp
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground border-border/30 hover:bg-secondary/30" onClick={onCopyMessage}>
                <ClipboardCopy className="w-3 h-3" /> Copiar Msg
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-primary border-primary/20 hover:bg-primary/10" onClick={onEdit}>
                <Pencil className="w-3 h-3" /> Editar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-destructive border-destructive/20 hover:bg-destructive/10">
                    <Trash2 className="w-3 h-3" /> Remover
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover cliente</AlertDialogTitle>
                    <AlertDialogDescription>Tem certeza que deseja remover {c.name || "este cliente"}?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
