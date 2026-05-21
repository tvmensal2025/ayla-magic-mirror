---
name: Lead Name & Gamification
description: Captação ON por padrão em todo lead novo; painel ultra-compacto (36dvh) auto-abre minimizado; trigger BEFORE INSERT força capture_mode=manual; nome pedido via askLeadName.
type: feature
---

**Captação automática**: trigger `customers_default_capture_mode` (BEFORE INSERT) seta `capture_mode='manual'` + `capture_started_at=now()` para todo lead novo, exceto quando já chega com `name` + `cpf` preenchidos. Vale para WhatsApp inbound, Excel import (`igreen_sync`/`sem_celular_`), criação manual.

**Auto-abrir painel**: `ChatView` abre `CaptureSheet` automaticamente quando `capture_mode='manual'` e lead ainda não tem cadastro completo. Usa `sessionStorage["cap-auto-open-{customerId}"]` para não repetir na mesma sessão.

**Painel ultra-compacto**: `CaptureSheet` modo padrão = `h-[36dvh] min-h-[240px]`. Header 1 linha (ícone 5×5 + nome + chip "Nome" + 3 ícones h-5). Footer 1 linha (Enviar tudo + CADASTRAR + Sair, todos h-7 text-[10px]). `TabsList h-6`. `CaptureStepsList`: linhas `py-0.5`, bola `w-5 h-5`, botão envio `w-6 h-6`. Barra de progresso só no `expanded`.

**Nome do lead**: `customers.name_ask_sent_at` controla pedido único de nome. Botão "Nome" chama `askLeadName` (lib `@/lib/whatsapp/send`).

**Envio**: `sendStepWithFeedback` com timeout 20s; `SendSequenceDialog` para disparar fila com delays humanos (2.5-4.5s).
