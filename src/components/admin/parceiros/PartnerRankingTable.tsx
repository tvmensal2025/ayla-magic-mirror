import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  QrCode,
  Search,
  Trash2,
} from "lucide-react";
import type { ReferralPartner } from "./hooks/useReferralPartners";
import type { PartnerAnalytics } from "./hooks/usePartnerAnalytics";
import { useRankingRows } from "./ranking/useRankingRows";
import { RankingBadges } from "./ranking/RankingBadges";

interface Props {
  partners: ReferralPartner[];
  analytics: PartnerAnalytics[];
  onEdit: (p: ReferralPartner) => void;
  onDelete: (id: string) => void;
  onQrCode: (p: ReferralPartner) => void;
}

const POSITION_TONE: Record<number, string> = {
  1: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  2: "bg-slate-400/15 text-slate-400 ring-slate-400/30",
  3: "bg-orange-500/15 text-orange-500 ring-orange-500/30",
};

export function PartnerRankingTable({
  partners,
  analytics,
  onEdit,
  onDelete,
  onQrCode,
}: Props) {
  const [query, setQuery] = useState("");
  const rows = useRankingRows({ partners, analytics, query });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar parceiro ou palavra-chave..."
          className="pl-9"
        />
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="hidden lg:table-cell">Selos</TableHead>
              <TableHead className="text-right">Leads (30d)</TableHead>
              <TableHead className="text-right hidden sm:table-cell">
                Total
              </TableHead>
              <TableHead className="text-right">Conv%</TableHead>
              <TableHead className="text-right hidden md:table-cell">
                vs mês ant.
              </TableHead>
              <TableHead className="text-right w-10">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  Nenhum parceiro encontrado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const {
                partner,
                position,
                last30,
                total,
                conv,
                trend,
                prev30,
                progressVsLeader,
                badges,
                streak,
              } = row;
              const initials = partner.nome
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const trendPositive = trend >= 0;
              const tone =
                POSITION_TONE[position] ??
                "bg-muted text-muted-foreground ring-border";

              return (
                <TableRow key={partner.id}>
                  <TableCell>
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ring-1 ${tone}`}
                    >
                      {position}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/20 shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight truncate">
                          {partner.nome}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {partner.cli}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <RankingBadges flags={badges} streak={streak} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1 min-w-[80px]">
                      <span className="font-mono tabular-nums font-semibold">
                        {last30}
                      </span>
                      <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progressVsLeader}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums hidden sm:table-cell text-muted-foreground">
                    {total}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`font-mono text-xs font-medium ${
                        conv >= 30 ? "text-emerald-500" : "text-muted-foreground"
                      }`}
                    >
                      {conv}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    {prev30 === 0 && last30 === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          trendPositive ? "text-emerald-500" : "text-destructive"
                        }`}
                      >
                        {trendPositive ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                        {Math.abs(trend)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onQrCode(partner)}>
                          <QrCode className="h-4 w-4 mr-2" /> QR Code
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(partner)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(partner.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
