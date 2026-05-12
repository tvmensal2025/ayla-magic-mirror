import { useEffect, useState } from "react";
import { Wallet, Plus, Loader2, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getWalletBalance,
  getWalletTransactions,
  createTopupSession,
  type WalletBalance,
  type WalletTransaction,
} from "@/services/facebookAds";

const QUICK_AMOUNTS = [50_00, 100_00, 200_00, 500_00];
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export function WalletCard({ consultantId }: { consultantId: string }) {
  const { toast } = useToast();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [tx, setTx] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        getWalletBalance(consultantId),
        getWalletTransactions(consultantId, 10),
      ]);
      setBalance(b); setTx(t);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [consultantId]);

  async function handleTopup(cents: number) {
    setTopping(cents);
    try {
      const { url } = await createTopupSession(cents);
      window.location.href = url;
    } catch (e: any) {
      toast({ title: "Não foi possível iniciar a recarga", description: e?.message || "Tente novamente.", variant: "destructive" });
      setTopping(null);
    }
  }

  const low = balance && balance.balance_cents <= balance.auto_pause_at_cents;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold text-foreground">Sua carteira de anúncios</h3>
            <p className="text-xs text-muted-foreground">Pré-pago. Recarregue e o gasto do Facebook é debitado automaticamente.</p>
          </div>
        </div>
      </header>

      {loading || !balance ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo disponível</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmt(balance.balance_cents)}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>Total recarregado: <strong className="text-foreground">{fmt(balance.total_topped_up_cents)}</strong></span>
              <span>Total gasto: <strong className="text-foreground">{fmt(balance.total_spent_cents)}</strong></span>
            </div>
            {low && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warning rounded-md bg-warning/10 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Saldo abaixo de {fmt(balance.auto_pause_at_cents)} — campanhas serão pausadas automaticamente.
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recarga rápida</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((c) => (
                <Button
                  key={c}
                  variant="outline"
                  className="h-12"
                  disabled={topping !== null}
                  onClick={() => handleTopup(c)}
                >
                  {topping === c ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> {fmt(c)}</>}
                </Button>
              ))}
            </div>
          </div>

          {tx.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Últimas movimentações</p>
              <ul className="divide-y divide-border/40 text-sm">
                {tx.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {t.type === "spend"
                        ? <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                        : <ArrowUpRight className="w-3.5 h-3.5 text-primary" />}
                      <span className="truncate max-w-[16rem]">{t.description || t.type}</span>
                    </span>
                    <span className={t.type === "spend" ? "text-destructive" : "text-primary"}>
                      {t.type === "spend" ? "-" : "+"}{fmt(t.amount_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}