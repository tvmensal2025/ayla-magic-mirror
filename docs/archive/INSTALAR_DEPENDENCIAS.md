# 📦 Como Instalar as Dependências

## ⚠️ Problema Detectado

Nenhum gerenciador de pacotes Node.js foi encontrado no seu sistema.

Você precisa instalar um dos seguintes:
- **Bun** (recomendado - mais rápido) ⚡
- **npm** (vem com Node.js)
- **yarn** ou **pnpm**

---

## ✅ Opção 1: Instalar Bun (RECOMENDADO)

O projeto já tem arquivos `bun.lock` e `bun.lockb`, então Bun é a melhor opção.

### No macOS:

```bash
curl -fsSL https://bun.sh/install | bash
```

Depois, recarregue o terminal:
```bash
source ~/.zshrc
```

Verifique a instalação:
```bash
bun --version
```

### Instalar dependências:
```bash
bun install
```

### Rodar o projeto na porta 8080:
```bash
bun run dev
```

---

## ✅ Opção 2: Instalar Node.js + npm

### No macOS com Homebrew:

```bash
brew install node
```

### Ou baixe do site oficial:
https://nodejs.org/

### Instalar dependências:
```bash
npm install
```

### Rodar o projeto na porta 8080:
```bash
npm run dev
```

---

## 🎯 Configuração da Porta

O projeto já está configurado para rodar na porta **8080**!

Veja em `vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,  // ✅ Já configurado!
  },
  // ...
});
```

---

## 📋 Comandos Disponíveis

Após instalar as dependências:

```bash
# Desenvolvimento (porta 8080)
bun run dev
# ou
npm run dev

# Build para produção
bun run build
# ou
npm run build

# Preview da build
bun run preview
# ou
npm run preview

# Testes
bun run test
# ou
npm run test
```

---

## 🚀 Passo a Passo Completo

### 1. Instalar Bun (recomendado):
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc
```

### 2. Instalar dependências:
```bash
bun install
```

### 3. Rodar o projeto:
```bash
bun run dev
```

### 4. Acessar no navegador:
```
http://localhost:8080
```

---

## ✅ Verificação

Após instalar, verifique se tudo está funcionando:

```bash
# Verificar se o gerenciador está instalado
bun --version
# ou
node --version
npm --version

# Verificar se as dependências foram instaladas
ls node_modules

# Rodar o projeto
bun run dev
# ou
npm run dev
```

Você deve ver algo como:
```
VITE v5.4.19  ready in XXX ms

➜  Local:   http://localhost:8080/
➜  Network: http://192.168.x.x:8080/
```

---

## 🐛 Troubleshooting

### Erro: "command not found: bun"
- Recarregue o terminal: `source ~/.zshrc`
- Ou feche e abra um novo terminal

### Erro: "EACCES: permission denied"
- No Linux/Mac: use `sudo` antes do comando
- Ou configure npm para não precisar de sudo

### Porta 8080 já está em uso
- Mate o processo: `lsof -ti:8080 | xargs kill -9`
- Ou mude a porta em `vite.config.ts`

---

## 📝 Resumo

1. ✅ Projeto já configurado para porta 8080
2. ⚠️ Precisa instalar Bun ou Node.js
3. 📦 Depois rodar `bun install` ou `npm install`
4. 🚀 Depois rodar `bun run dev` ou `npm run dev`
5. 🌐 Acessar http://localhost:8080

**Escolha Bun para instalação mais rápida! ⚡**
