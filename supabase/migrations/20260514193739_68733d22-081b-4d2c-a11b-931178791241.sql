
-- Garante unicidade do título para upsert idempotente
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_sections_title_key
  ON public.ai_knowledge_sections (title);

INSERT INTO public.ai_knowledge_sections (title, content, position, is_active)
VALUES (
  'FAQ — Perguntas Frequentes do Cliente',
  $faq$
# FAQ — Perguntas Frequentes do Cliente

Estas são as respostas oficiais que a IA DEVE usar quando o cliente perguntar sobre qualquer um dos temas abaixo. Responda de forma curta, humana e direta, usando exatamente o conteúdo destas respostas (pode adaptar levemente o tom, mas nunca invente informação).

## Como funciona / energia continua igual

**Vou continuar recebendo energia normalmente?**
Sim. A energia continua chegando normalmente pela distribuidora da sua região.

**Vai mudar alguma coisa na minha casa?**
Não. Não precisa trocar relógio, fio ou instalar placa solar.

**Preciso instalar energia solar?**
Não. Você utiliza energia solar por assinatura, sem obra e sem instalação.

**Quem entrega a energia?**
A própria distribuidora da sua cidade continua entregando a energia normalmente.

**A CPFL (ou minha distribuidora) vai deixar de existir para mim?**
Não. A distribuidora continua responsável pela entrega da energia e manutenção da rede.

**Preciso mudar de companhia elétrica?**
Não.

**A energia muda de qualidade?**
Não. A energia continua exatamente a mesma.

**Meu consumo muda?**
Não. Você continua usando energia normalmente.

**A iGreen é energia solar?**
Sim. O sistema utiliza créditos de energia provenientes de fazendas solares.

**O que é energia por assinatura?**
É um modelo onde você utiliza créditos de energia solar sem precisar instalar placas solares.

**É legalizado?**
Sim. O modelo segue a regulamentação da Lei 14.300.

## Pagamento e boleto

**Como funciona o pagamento?**
O pagamento é feito através de um boleto único disponível dentro do aplicativo da iGreen.

**Vou pagar duas contas?**
Não. O pagamento fica centralizado no aplicativo da iGreen.

**O boleto chega onde?**
O boleto fica disponível no aplicativo da iGreen.

**O que vem no boleto?**
No boleto constam os quilowatts compensados da energia e as informações da cobrança.

**Ainda vou pagar iluminação pública?**
Sim. As taxas obrigatórias continuam existindo normalmente.

**Posso pagar pelo celular?**
Sim.

**Preciso imprimir boleto?**
Não necessariamente. Tudo pode ser feito digitalmente.

**Posso emitir boleto pelo aplicativo?**
Sim.

## Aplicativo iGreen e Clube de Benefícios

**Posso acessar tudo pelo celular?**
Sim. Tudo é acompanhado pelo aplicativo da iGreen.

**O aplicativo é gratuito?**
Sim. O cliente recebe acesso ao aplicativo após o cadastro.

**O que tem dentro do aplicativo?**
Você acompanha: economia, faturas, benefícios, descontos e suporte.

**O aplicativo tem desconto em farmácia?**
Sim. O iGreen Club possui descontos em farmácias parceiras.

**Quantos estabelecimentos possuem desconto?**
São mais de 30 mil estabelecimentos parceiros.

**Tem desconto em cinema e restaurantes?**
Sim. O clube possui parceiros em diversas categorias.

**Posso usar os descontos do clube antes da economia começar?**
Sim. Após 10 dias de cadastro aprovado você já pode usar os descontos do clube de benefícios.

**Vale a pena para quem gasta pouca energia?**
Sim, porque temos um clube de benefícios que ajuda muito quem gasta com farmácias e cinemas — são mais de 30 mil estabelecimentos com desconto.

**O aplicativo funciona no Android e iPhone?**
Sim.

**Tem suporte pelo aplicativo?**
Sim.

**É difícil usar o aplicativo?**
Não. O aplicativo foi feito para ser simples e prático.

**O aplicativo é seguro?**
Sim. O acesso é feito pelo login do cliente.

**Posso acessar de qualquer lugar?**
Sim. Basta ter internet no celular.

**O aplicativo mostra minha economia?**
Sim.

**Vou conseguir acompanhar minha economia?**
Sim. Tudo fica disponível no aplicativo.

**Posso acompanhar tudo online?**
Sim. O aplicativo centraliza todas as informações.

**Posso acompanhar tudo em tempo real?**
O aplicativo mostra as informações e atualizações do cliente.

## Cancelamento, fidelidade e cadastro

**Tem fidelidade?**
Não.

**Posso cancelar depois?**
Sim. O cancelamento pode ser solicitado e não tem custo.

**Preciso investir dinheiro?**
Não precisa, o cadastro é gratuito.

**Preciso sair de casa para fazer o cadastro?**
Não. Tudo pode ser feito online — é rápido.

**Posso indicar amigos?**
Sim, e tem cashback.

## Economia, prazo e ativação

**Vou economizar mesmo usando a energia normalmente?**
Sim. Você continua usando energia normalmente no dia a dia.

**Quanto posso economizar?**
A economia varia conforme consumo, região e distribuidora — de 8% a 20%.

**Quando começa a economia?**
Normalmente após o prazo de ativação da distribuidora — de 60 a 90 dias.

**Demora muito para ativar?**
O prazo pode variar conforme análise e aprovação da distribuidora — normalmente de 60 a 90 dias.

**O desconto aparece na primeira conta?**
Existe um prazo de ativação antes da compensação começar. Mas você vai receber todas as informações no celular.

## Casa, apartamento, empresa

**Funciona para empresa?**
Sim. Residências e empresas podem participar.

**Funciona para casa alugada?**
Sim, a conta de energia tem que estar no seu nome.

**Funciona para apartamento?**
Sim, normalmente.

## Suporte, distribuidora e segurança

**A energia pode cair por causa da iGreen?**
Não. O fornecimento continua sendo feito pela distribuidora normalmente.

**Se faltar energia quem resolve?**
A distribuidora da sua região continua responsável pelo atendimento técnico.

**Vou continuar recebendo atendimento da distribuidora?**
Sim. A distribuidora continua responsável pela rede elétrica.

**Tem manutenção?**
Não. Você não precisa fazer manutenção porque não existe instalação na sua casa.

**Precisa fazer vistoria na minha casa?**
Não, a energia vem da distribuidora normalmente.

**Tem risco de danificar aparelhos?**
Não. Nada muda na estrutura elétrica da residência.

**O atendimento é online?**
Sim.

**Preciso ir até um escritório?**
Não necessariamente.
$faq$,
  999,
  true
)
ON CONFLICT (title) DO UPDATE
SET content = EXCLUDED.content,
    is_active = true,
    updated_at = now();
