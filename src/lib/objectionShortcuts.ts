// 40 atalhos de objeção pré-cadastrados (iGreen Energy)
// Fonte: Reclame Aqui + blogs do setor (Voltera, EDP, Resolaris, Prime Energy).
// O front separa a categoria pelo prefixo "Categoria · Nome" do intent_name.

export type ObjectionShortcut = {
  category: ObjectionCategory;
  name: string; // sem prefixo
  triggers: string[];
  text: string; // resposta padrão (tom Camila)
  isHandoff?: boolean; // se true, dispara handoff humano
};

export type ObjectionCategory =
  | "Confiança"
  | "Preço"
  | "Cobrança"
  | "Técnico"
  | "Cancelamento"
  | "Cadastro";

export const OBJECTION_CATEGORIES: ObjectionCategory[] = [
  "Confiança",
  "Preço",
  "Cobrança",
  "Técnico",
  "Cancelamento",
  "Cadastro",
];

export const CATEGORY_EMOJI: Record<ObjectionCategory, string> = {
  Confiança: "🛡️",
  Preço: "💰",
  Cobrança: "🧾",
  Técnico: "⚙️",
  Cancelamento: "⏱️",
  Cadastro: "📋",
};

export const OBJECTION_SHORTCUTS: ObjectionShortcut[] = [
  // 1. Confiança
  { category: "Confiança", name: "É golpe / furada", triggers: ["golpe", "furada", "enganação", "fraude", "scam", "picaretagem"], text: "Imagina, {{nome}} 😅 entendo seu receio, é normal. A iGreen é regulamentada pela ANEEL, tem CNPJ, escritório físico e mais de 100 mil clientes ativos. Posso te mandar um vídeo curto explicando como funciona?" },
  { category: "Confiança", name: "Não confio nessa empresa", triggers: ["não confio", "desconfio", "suspeito", "estranho", "duvido"], text: "Faz total sentido desconfiar, {{nome}}. É sua conta de luz, tem que ser sério mesmo. A iGreen existe desde 2017, é parceira de geradoras autorizadas pela ANEEL. Quer ver nosso CNPJ e endereço?" },
  { category: "Confiança", name: "Nunca ouvi falar", triggers: ["nunca ouvi", "não conheço", "primeira vez", "quem é"], text: "Tranquilo, {{nome}}! A iGreen atua há 7+ anos, com escritório físico e + de 100k clientes. Te mando o link do nosso site e do Reclame Aqui pra você conferir, pode ser?" },
  { category: "Confiança", name: "Reclame Aqui", triggers: ["reclame aqui", "reclamação", "ra", "mal falaram"], text: "Boa pergunta, {{nome}}. Toda empresa grande tem reclamação — o que conta é como resolve. Nosso índice de solução é alto e respondemos publicamente. Posso te enviar o print da nossa página?" },
  { category: "Confiança", name: "CNPJ / regulamentação", triggers: ["cnpj", "regulamentado", "aneel", "autorizado", "legal"], text: "Sim, {{nome}}! CNPJ 28.152.342/0001-89, regulada pela ANEEL na modalidade de geração compartilhada (Lei 14.300/2022). 100% legal." },
  { category: "Confiança", name: "Há quanto tempo existe", triggers: ["quanto tempo", "anos", "fundada", "começou", "mercado"], text: "A iGreen está no mercado desde 2017, {{nome}} — mais de 7 anos operando energia limpa por assinatura no Brasil." },
  { category: "Confiança", name: "Onde fica a sede", triggers: ["sede", "endereço", "escritório", "onde fica", "localização"], text: "Sede em Cuiabá-MT, com escritórios regionais em vários estados. Quer o endereço completo?" },
  { category: "Confiança", name: "Quem é o dono", triggers: ["dono", "sócio", "fundador", "proprietário", "ceo"], text: "A iGreen é fundada e dirigida pelo empresário Beto Bahia. Empresa privada, 100% brasileira." },

  // 2. Preço
  { category: "Preço", name: "É caro / não tenho dinheiro", triggers: ["caro", "sem dinheiro", "apertado", "sem grana", "tô quebrado"], text: "Pelo contrário, {{nome}} — você NÃO paga nada a mais. Só passa a pagar uma fatura iGreen MENOR no lugar da fatura da concessionária. Sem custo de adesão, sem instalação, sem mensalidade." },
  { category: "Preço", name: "Quanto economizo de verdade", triggers: ["quanto economizo", "quanto vou economizar", "economia real", "comprovação"], text: "Em média 12% a 20% de desconto no valor da sua conta atual, {{nome}}. Com sua conta em mãos eu te mostro EXATAMENTE quanto vai sobrar no seu bolso por mês 👀" },
  { category: "Preço", name: "Desconto é falso", triggers: ["desconto falso", "mentira", "propaganda enganosa", "não é verdade"], text: "Entendo a desconfiança, {{nome}}. O desconto vem CONTRATUALIZADO — você assina prevendo o percentual exato. Se não vier, a iGreen é obrigada a devolver. Quer ver o contrato modelo?" },
  { category: "Preço", name: "Tem taxa escondida", triggers: ["taxa escondida", "custo extra", "surpresa", "oculta", "letra miúda", "pegadinha"], text: "Zero taxa escondida, {{nome}}. Você paga só a fatura mensal da iGreen (já com desconto). Sem adesão, sem instalação, sem fidelidade. Tudo está no contrato." },
  { category: "Preço", name: "Vou pagar a mais no fim", triggers: ["pagar mais", "dobrar", "soma maior", "conta cresce", "vai sair mais caro"], text: "Não, {{nome}}. A fatura iGreen SUBSTITUI parte da fatura da concessionária — não soma. No fim do mês você paga MENOS do que pagava antes." },
  { category: "Preço", name: "Tarifa subir", triggers: ["tarifa sobe", "aumento", "reajuste", "bandeira vermelha", "se subir"], text: "Boa, {{nome}}! Se a tarifa da concessionária subir, sua economia AUMENTA — porque o desconto é percentual sobre o valor cheio. Você se protege do aumento." },
  { category: "Preço", name: "Pagar pra entrar", triggers: ["pagar pra entrar", "adesão", "taxa inicial", "mensalidade", "custo entrada"], text: "Zero, {{nome}}. Adesão gratuita, sem mensalidade, sem instalação. Você só passa a pagar a fatura mensal com desconto." },

  // 3. Cobrança
  { category: "Cobrança", name: "Cobrar duas vezes", triggers: ["cobrar duas", "duplicado", "conta dobrada", "em dobro", "duas faturas"], text: "Não é dobrado, {{nome}}. A conta da concessionária vem com VALOR MENOR (só a parte de impostos/disponibilidade) e a fatura iGreen vem com a energia. Somando as duas, dá MENOS que antes." },
  { category: "Cobrança", name: "Conta da concessionária", triggers: ["conta concessionária", "enel", "light", "cemig", "equatorial", "coelba", "neoenergia"], text: "Continua chegando, {{nome}} — mas com valor muito menor (só a taxa de disponibilidade da rede). A energia em si passa a vir da iGreen, mais barata." },
  { category: "Cobrança", name: "Vencimento do boleto", triggers: ["vencimento", "data", "quando vence", "prazo"], text: "Você escolhe o melhor dia, {{nome}}! Dia 5, 10, 15, 20 ou 25. Receberá o boleto por WhatsApp e email." },
  { category: "Cobrança", name: "Forma de pagamento", triggers: ["débito automático", "pix", "cartão", "como pago", "forma de pagamento"], text: "Boleto, Pix ou débito automático, {{nome}}! O que for melhor pra você." },
  { category: "Cobrança", name: "E se eu atrasar", triggers: ["atrasar", "multa", "juros", "esquecer"], text: "Atrasou, é como qualquer boleto: pequena multa de 2% + juros de mora. Mas você recebe lembretes antes do vencimento pra não esquecer 😉" },
  { category: "Cobrança", name: "Vão me negativar", triggers: ["negativar", "spc", "serasa", "nome sujo"], text: "Só em caso de inadimplência prolongada (90+ dias), igual qualquer fatura. Pagando normal, ZERO risco." },

  // 4. Técnico
  { category: "Técnico", name: "Trocar de empresa", triggers: ["trocar empresa", "mudar concessionária", "sair da enel", "trocar fornecedor"], text: "Você NÃO troca de empresa, {{nome}}. A concessionária continua entregando a energia em casa. A iGreen só FORNECE a energia limpa que vai pra rede. Nada muda na sua casa." },
  { category: "Técnico", name: "Mexer na fiação", triggers: ["fiação", "instalação", "técnico em casa", "obra", "mexer na minha casa"], text: "ZERO obra, {{nome}}! Ninguém vai na sua casa, não mexemos em nada. Tudo é feito na conta — a energia limpa vai pra rede e abate a sua." },
  { category: "Técnico", name: "E se faltar luz", triggers: ["faltar luz", "apagão", "queda", "blackout", "sem energia"], text: "Faltou luz? Você liga pra concessionária igual antes, {{nome}}. A entrega da energia continua sendo dela. A iGreen só desconta na fatura." },
  { category: "Técnico", name: "Placa solar / painel", triggers: ["placa", "painel", "telhado", "equipamento", "instalar"], text: "Nada disso, {{nome}}! As usinas solares são da iGreen, longe da sua casa. Você só recebe o desconto. Sem placa, sem inversor, sem nada no seu telhado." },
  { category: "Técnico", name: "E se eu mudar de casa", triggers: ["mudar casa", "mudança", "novo endereço", "me mudar"], text: "Sem problema, {{nome}}! Se ficar na mesma área de concessionária, a iGreen acompanha. Se mudar de estado, é só avisar — sem multa." },
  { category: "Técnico", name: "Funciona pra apartamento", triggers: ["apartamento", "prédio", "condomínio", "ap"], text: "Funciona sim, {{nome}}! Apartamento, casa, comércio — qualquer imóvel com conta de luz no seu nome serve." },
  { category: "Técnico", name: "Funciona na minha cidade", triggers: ["minha cidade", "região", "atende aqui", "cobertura", "atendem"], text: "Me conta sua cidade que eu confirmo na hora, {{nome}}! Atendemos a maioria dos estados do Brasil." },

  // 5. Cancelamento
  { category: "Cancelamento", name: "Quanto demora pra começar", triggers: ["quanto tempo", "demora", "começa quando", "prazo de início"], text: "Em até 60 dias, {{nome}}, o desconto já aparece na sua próxima fatura. Cadastro leva uns 10 minutos hoje." },
  { category: "Cancelamento", name: "Fidelidade / multa", triggers: ["fidelidade", "multa", "contrato preso", "amarrado", "prazo de contrato"], text: "ZERO fidelidade, {{nome}}! Cancela quando quiser, sem multa, sem burocracia. É só avisar pelo app." },
  { category: "Cancelamento", name: "Posso cancelar quando quiser", triggers: ["cancelar quando quiser", "sair", "desistir", "encerrar"], text: "Sempre, {{nome}}! Sem multa, sem fidelidade. Cancelamento em até 30 dias após solicitar." },
  { category: "Cancelamento", name: "Como faço pra cancelar", triggers: ["como cancelar", "processo cancelar", "passo a passo cancelar"], text: "Pelo app da iGreen ou pelo WhatsApp do atendimento. Em até 30 dias o contrato encerra, sem multa." },
  { category: "Cancelamento", name: "Quero desistir (7 dias)", triggers: ["arrependimento", "sete dias", "desistência", "desistir do contrato"], text: "Tranquilo, {{nome}}! Você tem 7 dias de arrependimento por lei (CDC). Só precisa avisar por escrito que cancela sem nenhum custo." },
  { category: "Cancelamento", name: "Vou pensar / depois", triggers: ["pensar", "depois", "amanhã", "te aviso", "ver com esposa", "ver com marido"], text: "Claro, {{nome}}! Quer que eu te mande os documentos pra estudar com calma? Posso te chamar amanhã pra tirar dúvidas, que horário fica melhor?" },

  // 6. Cadastro
  { category: "Cadastro", name: "Não vou mandar foto da conta", triggers: ["foto não", "conta não", "privacidade conta", "não mando foto"], text: "Entendo, {{nome}}. A foto serve só pra eu confirmar o valor do seu desconto e o nome do titular. Posso te explicar exatamente o que olhamos antes, se preferir." },
  { category: "Cadastro", name: "Não vou mandar RG/CNH", triggers: ["documento não", "rg não", "cnh não", "identidade não", "não mando doc"], text: "Sem pressa, {{nome}}. O documento é exigência da ANEEL pra cadastrar você como titular. É enviado direto pra plataforma segura da iGreen — não fica comigo." },
  { category: "Cadastro", name: "Por que precisam do CPF", triggers: ["cpf", "dados pessoais", "lgpd", "privacidade"], text: "Pra cadastrar você como titular da conta na iGreen, {{nome}}, igual qualquer contratação. Dados ficam protegidos pela LGPD." },
  { category: "Cadastro", name: "E se vazarem meus dados", triggers: ["vazar dados", "segurança", "hacker", "lgpd", "proteção"], text: "A iGreen segue a LGPD à risca, {{nome}}. Dados criptografados, servidores seguros, e você pode pedir exclusão a qualquer momento." },
  { category: "Cadastro", name: "Quero falar com humano", triggers: ["humano", "pessoa", "atendente", "falar com alguém", "consultor", "vendedor"], text: "", isHandoff: true },
  { category: "Cadastro", name: "Conhecer presencialmente", triggers: ["presencial", "pessoalmente", "escritório", "reunião", "ir até"], text: "Posso te apresentar tudo por vídeo-chamada, {{nome}}! Mais rápido e do conforto da sua casa. Que horário?" },
];

export function formatIntentName(s: ObjectionShortcut): string {
  return `${s.category} · ${s.name}`;
}

export function parseIntentName(intentName: string): { category: ObjectionCategory | null; name: string } {
  const sep = " · ";
  const idx = intentName.indexOf(sep);
  if (idx < 0) return { category: null, name: intentName };
  const cat = intentName.slice(0, idx) as ObjectionCategory;
  return {
    category: OBJECTION_CATEGORIES.includes(cat) ? cat : null,
    name: intentName.slice(idx + sep.length),
  };
}

// Palavras do funil — evitar usar como gatilho (capturam fluxo principal)
export const RESERVED_FLOW_KEYWORDS = [
  "sim", "não", "nao", "ok", "certo", "beleza", "vamos", "valor",
  "r$", "foto", "documento", "doc", "rg", "cnh", "cpf",
];
