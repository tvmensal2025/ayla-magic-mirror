// Mapa termo técnico → linguagem do dia a dia.
// Usado em tooltips e labels do painel de anúncios.

export const adGlossary = {
  impressions: {
    short: "Pessoas que viram",
    long: "Quantas vezes seu anúncio apareceu pra alguém no Facebook ou Instagram. Não significa que tocaram — só que viram passando.",
  },
  clicks: {
    short: "Toques no anúncio",
    long: "Quantas pessoas tocaram no anúncio (clique). Geralmente leva ela pro WhatsApp ou pra página.",
  },
  leads: {
    short: "Conversas no zap",
    long: "Quantas pessoas começaram a conversar com você no WhatsApp depois de ver o anúncio.",
  },
  conversations: {
    short: "Conversas iniciadas",
    long: "Quantas pessoas mandaram a primeira mensagem no zap.",
  },
  registrations: {
    short: "Viraram cliente",
    long: "Quantas pessoas terminaram o cadastro e foram aprovadas como cliente.",
  },
  spend: {
    short: "Quanto gastou",
    long: "Total que o Facebook cobrou pelos anúncios. Sai do seu saldo.",
  },
  cpl: {
    short: "Custo por conversa",
    long: "Quanto custa pra trazer 1 pessoa pro zap. Bom: até R$ 8. Ruim: acima de R$ 20.",
  },
  cpa: {
    short: "Custo por cliente",
    long: "Quanto custa pra ganhar 1 cliente novo (cadastro completo). Meta: até R$ 60.",
  },
  ctr: {
    short: "Taxa de toque",
    long: "De cada 100 pessoas que viram, quantas tocaram. Bom: acima de 1%. Ruim: abaixo de 0,3%.",
  },
  reach: {
    short: "Pessoas únicas",
    long: "Quantas pessoas diferentes viram o anúncio (sem contar repetição).",
  },
  frequency: {
    short: "Quantas vezes apareceu",
    long: "Em média, quantas vezes a mesma pessoa viu o anúncio. Se passa de 3, vale trocar a foto.",
  },
} as const;

export type AdMetricKey = keyof typeof adGlossary;

// Avalia saúde geral pra mostrar 🟢🟡🔴
export function evaluateAdHealth(p: {
  spend_cents: number;
  leads: number;
  impressions: number;
  registrations: number;
}): { color: "green" | "yellow" | "red"; label: string; message: string } {
  const ctr = p.impressions > 0 ? (p.spend_cents > 0 ? p.leads / p.impressions : 0) : 0;
  const cplCents = p.leads > 0 ? p.spend_cents / p.leads : Infinity;
  const cplReais = cplCents / 100;

  if (p.spend_cents < 500) {
    return {
      color: "yellow",
      label: "Ainda gastando pouco",
      message: "Esperando o Facebook entender pra quem mostrar. Aguarda mais umas horas.",
    };
  }
  if (p.leads === 0 && p.spend_cents > 2000) {
    return {
      color: "red",
      label: "Anúncio fraco",
      message: "Já gastou e ninguém começou conversa no zap. A IA vai pausar criativos ruins na próxima rodada.",
    };
  }
  if (cplReais > 25) {
    return {
      color: "yellow",
      label: "Custo por conversa alto",
      message: `Cada conversa está custando R$ ${cplReais.toFixed(2)}. Tente trocar a foto ou o título.`,
    };
  }
  if (p.registrations > 0) {
    return {
      color: "green",
      label: "Convertendo bem",
      message: `Já trouxe ${p.registrations} cliente${p.registrations > 1 ? "s" : ""} novo${p.registrations > 1 ? "s" : ""}. Mantém rodando.`,
    };
  }
  return {
    color: "green",
    label: "Anúncio saudável",
    message: `Cada R$ gasto está trazendo ${(p.leads / Math.max(p.spend_cents / 100, 1)).toFixed(1)} conversa no zap.`,
  };
}
