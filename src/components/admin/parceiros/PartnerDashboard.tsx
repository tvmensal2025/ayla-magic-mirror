import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PartnerKpiRow } from "./PartnerKpiRow";
import { PartnerLeadsBarChart } from "./PartnerLeadsBarChart";
import { PartnerTrendChart } from "./PartnerTrendChart";
import { PartnerFunnelChart } from "./PartnerFunnelChart";
import { PartnerOriginDonut } from "./PartnerOriginDonut";
import { PartnerRankingTable } from "./PartnerRankingTable";
import { LicenseeHeader } from "./licensee/LicenseeHeader";
import { PodiumTop3 } from "./ranking/PodiumTop3";
import { useRankingRows } from "./ranking/useRankingRows";
import { useLicenseeStats } from "./hooks/useLicenseeStats";
import { usePartnerAnalytics } from "./hooks/usePartnerAnalytics";
import type { ReferralPartner } from "./hooks/useReferralPartners";

interface Props {
  partners: ReferralPartner[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (p: ReferralPartner) => void;
  onDelete: (id: string) => void;
  onQrCode: (p: ReferralPartner) => void;
  consultantName: string;
  consultantPhone: string;
  consultantIgreenId: string;
  consultantSlug: string;
}

export function PartnerDashboard({
  partners,
  isLoading,
  onNew,
  onEdit,
  onDelete,
  onQrCode,
  consultantName,
  consultantPhone,
  consultantIgreenId,
  consultantSlug,
}: Props) {
  const { data: analytics = [], isLoading: analyticsLoading } =
    usePartnerAnalytics();

  const licenseeStats = useLicenseeStats(analytics, partners.length);
  const podiumRows = useRankingRows({ partners, analytics });
  const hasPodium = useMemo(
    () => podiumRows.some((r) => r.last30 > 0),
    [podiumRows],
  );

  if (isLoading || analyticsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Licenciado no topo (sempre visível) */}
      <LicenseeHeader
        name={consultantName}
        phone={consultantPhone}
        igreenId={consultantIgreenId}
        slug={consultantSlug}
        stats={licenseeStats}
      />

      {partners.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
              <Sparkles className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Nenhum parceiro ainda</h3>
              <p className="text-sm text-muted-foreground max-w-md mt-1">
                Cadastre indicadores e acompanhe captação, conversão e cashback
                de cada um em tempo real. Clientes vindos da sincronização
                aparecem aqui automaticamente.
              </p>
            </div>
            <Button onClick={onNew} className="gap-2">
              <Plus className="h-4 w-4" /> Cadastrar primeiro parceiro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cabeçalho da seção + CTA */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                Ranking de Parceiros
              </h3>
              <p className="text-xs text-muted-foreground">
                Competição mensal — quem traz mais leads sobe no pódio
              </p>
            </div>
            <Button onClick={onNew} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Parceiro
            </Button>
          </div>

          {/* Pódio Top 3 */}
          {hasPodium && <PodiumTop3 rows={podiumRows} />}

          {/* KPIs gerais */}
          <PartnerKpiRow analytics={analytics} activeCount={partners.length} />

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PartnerLeadsBarChart analytics={analytics} />
            <PartnerTrendChart analytics={analytics} />
            <PartnerFunnelChart analytics={analytics} />
            <PartnerOriginDonut analytics={analytics} />
          </div>

          {/* Ranking detalhado */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ranking detalhado</CardTitle>
            </CardHeader>
            <CardContent>
              <PartnerRankingTable
                partners={partners}
                analytics={analytics}
                onEdit={onEdit}
                onDelete={onDelete}
                onQrCode={onQrCode}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
