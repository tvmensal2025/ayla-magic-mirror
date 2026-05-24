# 🚀 Início Rápido - Porta 8080

## ⚡ Instalação Automática (RECOMENDADO)

```bash
bash setup.sh
```

O script vai:
1. ✅ Detectar qual gerenciador de pacotes você tem
2. 📦 Instalar todas as dependências
3. 🔍 Verificar se a porta 8080 está configurada
4. 📋 Mostrar os próximos passos

---

## 📝 Instalação Manual

### 1️⃣ Instalar Bun (se não tiver):

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc
```

### 2️⃣ Instalar dependências:

```bash
bun install
```

### 3️⃣ Rodar o projeto:

```bash
bun run dev
```

### 4️⃣ Acessar:

```
http://localhost:8080
```

---

## 🎯 Porta Configurada

O projeto já está configurado para rodar na **porta 8080**!

Veja em `vite.config.ts`:
```typescript
server: {
  host: "0.0.0.0",
  port: 8080,  // ✅
}
```

---

## 📦 Comandos Disponíveis

```bash
bun run dev      # Desenvolvimento (porta 8080)
bun run build    # Build para produção
bun run preview  # Preview da build
bun run test     # Rodar testes
```

---

## 🔧 Alternativas ao Bun

### Com npm:
```bash
npm install
npm run dev
```

### Com yarn:
```bash
yarn install
yarn dev
```

### Com pnpm:
```bash
pnpm install
pnpm dev
```

---

## ✅ Checklist

- [ ] Gerenciador de pacotes instalado (Bun, npm, yarn ou pnpm)
- [ ] Dependências instaladas (`bun install` ou `npm install`)
- [ ] Projeto rodando (`bun run dev` ou `npm run dev`)
- [ ] Acessível em http://localhost:8080

---

## 📚 Documentação Adicional

- **INSTALAR_DEPENDENCIAS.md** - Guia detalhado de instalação
- **RESUMO_MIGRACAO.md** - Resumo da migração Evolution API
- **PROXIMOS_PASSOS.md** - Próximos passos da migração
- **comandos-debug.sh** - Comandos úteis para debug

---

## 🐛 Problemas Comuns

### "command not found: bun"
```bash
source ~/.zshrc
# ou feche e abra um novo terminal
```

### Porta 8080 já está em uso
```bash
lsof -ti:8080 | xargs kill -9
```

### Erro de permissão
```bash
sudo chown -R $(whoami) ~/.bun
# ou use npm/yarn ao invés de bun
```

---

## 🎉 Pronto!

Depois de instalar as dependências, você terá:
- ✅ Projeto rodando na porta 8080
- ✅ Hot reload funcionando
- ✅ Todas as dependências instaladas
- ✅ Pronto para desenvolvimento!
