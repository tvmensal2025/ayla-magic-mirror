// Templates iniciais para o editor de fluxo. Lista estática — sem nova tabela.
// Cada template é uma sequência de passos que será inserida no flow atual,
// preservando step_keys legados quando aplicável (pra continuar funcionando
// com whapi-webhook).

export type TemplateStepSeed = {
  step_key: string;
  step_type: string;
  title: string;
  summary?: string;
  icon?: string;
  message_text?: string;
  slot_key?: string;
  transitions?: any[];
  captures?: any[];
  fallback?: any;
};

export type FlowTemplate = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  steps: TemplateStepSeed[];
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "captacao_solar",
    name: "Captação solar (completo)",
    emoji: "☀️",
    description: "Boas-vindas → como funciona → captação da conta → cadastro.",
    steps: [
      {
        step_key: "welcome",
        step_type: "message",
        title: "Boas-vindas",
        icon: "msg",
        message_text:
          "Oi, {{nome}}! 😊\n\nAqui é o *{{representante}}*, da *iGreen Energy*. 🌱\n\nVocê pode economizar *até 20%* na sua conta de luz, *sem instalar nada*.\n\nQuer que eu te mostre *como funciona*? 👇",
        slot_key: "welcome",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "simular", title: "📸 Quero simular" },
          { id: "como", title: "🤔 Como funciona?" },
        ]}],
      },
      {
        step_key: "como_funciona",
        step_type: "message",
        title: "Como funciona",
        icon: "msg",
        message_text:
          "É *bem simples*, {{nome}} 👇\n\nVocê continua na *mesma distribuidora*, recebe a *mesma energia* — só que paga *até 20% menos* todo mês.\n\n✅ Sem obra\n✅ Sem instalação\n✅ Sem fidelidade\n\nBora *simular* agora? 🚀",
        slot_key: "como_funciona",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "simular", title: "📸 Quero simular" },
        ]}],
      },
      {
        step_key: "aguardando_conta",
        step_type: "capture_conta",
        title: "Captar conta de luz",
        icon: "file",
        message_text: "📸 Me manda uma *foto da sua conta de luz* pra eu calcular sua *economia* na hora. 💚\n\n(pode ser a fatura do *mês atual* ou a anterior)",
        slot_key: "aguardando_conta",
      },
      {
        step_key: "pre_cadastro",
        step_type: "message",
        title: "Confirmar dados",
        icon: "msg",
        message_text:
          "Show, {{nome}}! 🎉\n\nSua economia vai ser de *{{economia_range}}* por mês. 💚\n\nPra cadastrar, só preciso confirmar uma coisinha 👇\n\nEste WhatsApp (*{{telefone}}*) é o *melhor número* pra contato?",
        slot_key: "pre_cadastro",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "sim", title: "✅ Sim" },
          { id: "nao", title: "📱 Usar outro" },
        ]}],
      },
      {
        step_key: "finalizar_cadastro",
        step_type: "finalizar_cadastro",
        title: "Finalizar cadastro",
        icon: "sparkle",
        message_text: "Pronto, {{nome}}! 🎉\n\nSeu *cadastro foi enviado* com sucesso.\n\n📬 Em até *2 dias úteis* sua *conta nova* chega no seu e-mail.\n\nQualquer dúvida, é só me chamar aqui! 💚",
        slot_key: "finalizar_cadastro",
      },
    ],
  },
  {
    id: "captacao_simples",
    name: "Captação simples (3 passos)",
    emoji: "⚡",
    description: "Pitch direto → conta de luz → cadastro. Para listas quentes.",
    steps: [
      {
        step_key: "welcome",
        step_type: "message",
        title: "Pitch direto",
        icon: "msg",
        message_text:
          "Oi, {{nome}}! 😊\n\nSou o *{{representante}}* 🌱\n\nConsigo te dar *até 20% de desconto fixo* na conta de luz — *sem instalar nada*.\n\n📸 Me manda a foto da *última conta* que eu já calculo sua *economia*?",
        slot_key: "welcome",
      },
      {
        step_key: "aguardando_conta",
        step_type: "capture_conta",
        title: "Captar conta",
        icon: "file",
        message_text: "📸 Pode mandar a *foto da conta* aqui mesmo. 💚",
        slot_key: "aguardando_conta",
      },
      {
        step_key: "finalizar_cadastro",
        step_type: "finalizar_cadastro",
        title: "Finalizar",
        icon: "sparkle",
        message_text: "Beleza, {{nome}}! ✅\n\n*Cadastro enviado* com sucesso.\n\n⏳ Em até *24h* eu te aviso aqui no WhatsApp. 💚",
        slot_key: "finalizar_cadastro",
      },
    ],
  },
  {
    id: "conexao_club",
    name: "Conexão Club (indicações)",
    emoji: "🤝",
    description: "Pitch do programa de indicações Conexão Club + dúvidas.",
    steps: [
      {
        step_key: "pitch_conexao_club",
        step_type: "message",
        title: "Pitch Conexão Club",
        icon: "msg",
        message_text:
          "{{nome}}, tenho uma novidade pra você 💰\n\nAlém da sua *economia* todo mês, agora você pode *ganhar cashback* indicando amigos no *Conexão Club*. 🤝\n\nQuer saber *como funciona*? 👇",
        slot_key: "pitch_conexao_club",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "sim", title: "✅ Quero saber" },
          { id: "nao", title: "❌ Agora não" },
        ]}],
      },
      {
        step_key: "duvidas_pos_club",
        step_type: "message",
        title: "Tirar dúvidas",
        icon: "msg",
        message_text: "Ficou alguma dúvida sobre o Conexão Club? Posso te explicar 👇",
        slot_key: "duvidas_pos_club",
      },
    ],
  },
  {
    id: "reengajamento",
    name: "Reengajamento (lead frio)",
    emoji: "🔁",
    description: "Volta com o lead que sumiu — 1 mensagem + CTA forte.",
    steps: [
      {
        step_key: "welcome",
        step_type: "message",
        title: "Reengajamento",
        icon: "msg",
        message_text:
          "Oi {{nome}}, voltei aqui 👋\nAquela economia de até 20% na conta de luz ainda tá de pé. Bora simular agora?",
        slot_key: "welcome",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "simular", title: "📸 Quero simular" },
          { id: "humano", title: "👤 Falar com humano" },
        ]}],
      },
    ],
  },
  {
    id: "pos_venda",
    name: "Pós-venda (cliente novo)",
    emoji: "🎁",
    description: "Mensagem de boas-vindas pós-cadastro + Conexão Club.",
    steps: [
      {
        step_key: "welcome",
        step_type: "message",
        title: "Boas-vindas pós-cadastro",
        icon: "sparkle",
        message_text:
          "{{nome}}, parabéns por entrar pra iGreen! 🎉\nEm até 2 faturas você já vê a economia de até 20%. Qualquer dúvida me chama aqui.",
        slot_key: "welcome",
      },
      {
        step_key: "pitch_conexao_club",
        step_type: "message",
        title: "Convite Conexão Club",
        icon: "msg",
        message_text:
          "E olha só: agora você pode ganhar cashback indicando amigos no Conexão Club 💰\nQuer que eu te mostre?",
        slot_key: "pitch_conexao_club",
        captures: [{ field: "_buttons", enabled: true, value: [
          { id: "sim", title: "✅ Mostrar" },
          { id: "nao", title: "❌ Depois" },
        ]}],
      },
    ],
  },
  {
    id: "confirmacao_pos_ocr",
    name: "Confirmação pós-OCR (dados + email + telefone)",
    emoji: "✅",
    description:
      "Depois do OCR da conta e documento: confirma dados, pede e-mail e confirma telefone.",
    steps: [
      {
        step_key: "confirmar_dados",
        step_type: "message",
        title: "Confirmar dados extraídos",
        icon: "msg",
        message_text:
          "Consegui ler aqui, {{nome}} 👇\n• Nome: {{nome}}\n• CPF: {{cpf}}\n• Valor da conta: R$ {{valor_conta}}\n\nEstá tudo certo?",
        slot_key: "confirmar_dados",
        captures: [
          {
            field: "_buttons",
            enabled: true,
            value: [
              { id: "sim", title: "✅ Sim, está certo" },
              { id: "nao", title: "✏️ Não, editar" },
              { id: "humano", title: "👤 Falar com humano" },
            ],
          },
        ],
      },
      {
        step_key: "pedir_email",
        step_type: "capture_email",
        title: "Pedir e-mail",
        icon: "msg",
        message_text:
          "Show! Agora me passa seu *e-mail* para eu finalizar o cadastro 📧",
        slot_key: "pedir_email",
        captures: [{ field: "email", enabled: true } as any],
      },
      {
        step_key: "confirmar_telefone",
        step_type: "confirm_phone",
        title: "Confirmar telefone",
        icon: "msg",
        message_text:
          "Esse mesmo número *{{telefone}}* é o seu WhatsApp para contato?",
        slot_key: "confirmar_telefone",
        captures: [
          {
            field: "_buttons",
            enabled: true,
            value: [
              { id: "sim", title: "✅ Sim, é esse" },
              { id: "editar", title: "✏️ Quero editar" },
            ],
          },
        ],
      },
    ],
  },
];

