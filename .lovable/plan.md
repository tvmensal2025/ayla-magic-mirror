## Problema

Na aba **Captação** (modo normal, Game OFF — que é o caso do print), ao clicar em um lead nada acontece visualmente no celular. Motivo: o `CaptacaoPanel.tsx` (linhas 356–404) renderiza **lista + main + ficha em um único `flex` horizontal** sem breakpoints responsivos. No mobile, a lista ocupa a tela toda e o painel de passos/ficha fica fora da viewport — o `onSelect` dispara, mas o usuário não vê nada.

O modo Game (linhas 220–353) já tem o tratamento mobile correto (lista esconde quando há lead selecionado, header com botão voltar, ficha colapsável). Falta replicar essa lógica no modo normal.

Também: o primeiro lead do print aparece sem nome (só `5511964079473`) — é um caso real do banco, não é bug; só vamos garantir que o telefone fique visível mesmo sem nome (já está, mas posso reforçar).

## O que vai mudar

Apenas `src/components/captacao/CaptacaoPanel.tsx`, no bloco `else` (Game OFF), linhas 356–404:

1. **Mobile (sem lead selecionado):** mostra só a lista de leads ocupando 100% da largura.
2. **Mobile (com lead selecionado):** esconde a lista, mostra o painel de captura com:
   - Header com botão **← Voltar** (volta para a lista)
   - Nome/telefone do lead + botão "Abrir conversa"
   - Grid dos 10 passos (clique para enviar)
   - Toggle **"Ver ficha"** que expande/colapsa o `CaptureLeadCard` (mesma UX do modo Game)
3. **Desktop (md+):** layout idêntico ao atual — lista à esquerda, passos no meio, ficha à direita, todos visíveis simultaneamente.

Sem mexer em lógica de envio, hooks, RLS, banco ou no modo Game. Mudança puramente de layout/CSS responsivo + um `useState` para o toggle da ficha (que já existe: `showAside`).

## Detalhe técnico

```text
<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
  {/* Lista: full-width no mobile sem seleção, escondida com seleção; sidebar fixa no desktop */}
  <div className={`${selectedId ? "hidden md:flex" : "flex"} md:flex flex-col md:w-72 md:shrink-0`}>
    <CaptureLeadList ... />
  </div>

  {/* Main: escondida no mobile sem seleção */}
  <main className={`${!selectedId ? "hidden md:flex" : "flex"} flex-1 flex-col`}>
    {selectedId && (
      <header com ChevronLeft (md:hidden) + nome + Abrir conversa + ChevronDown ficha (md:hidden)>
      <CaptureStepsGrid />
      <div className={`md:hidden ${showAside ? "block" : "hidden"}`}>
        <CaptureLeadCard embedded />
      </div>
    )}
  </main>

  {/* Ficha desktop: sempre visível em md+ */}
  {selectedId && <div className="hidden md:flex"><CaptureLeadCard /></div>}
</div>
```

Resetar `showAside` no `useEffect` que já roda em `[selectedId]` (linha 55) — já está incluído lá.

## Fora de escopo

- Não vou alterar o modo Game (já está OK no mobile).
- Não vou alterar o `CaptureLeadList` nem o `CaptureLeadCard`.
- Não vou mexer no fluxo de envio, captura ou no Portal Worker.
