#!/bin/bash

# Script de instalação automática para o projeto
# Execute com: bash setup.sh

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Setup do Projeto - Porta 8080         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Verificar se algum gerenciador de pacotes está instalado
check_package_manager() {
    if command -v bun &> /dev/null; then
        echo "bun"
        return 0
    elif command -v npm &> /dev/null; then
        echo "npm"
        return 0
    elif command -v yarn &> /dev/null; then
        echo "yarn"
        return 0
    elif command -v pnpm &> /dev/null; then
        echo "pnpm"
        return 0
    else
        echo "none"
        return 1
    fi
}

PM=$(check_package_manager)

if [ "$PM" = "none" ]; then
    echo -e "${RED}❌ Nenhum gerenciador de pacotes encontrado!${NC}"
    echo ""
    echo -e "${YELLOW}Você precisa instalar um gerenciador de pacotes primeiro.${NC}"
    echo ""
    echo -e "${BLUE}Opção 1: Instalar Bun (RECOMENDADO - mais rápido)${NC}"
    echo "curl -fsSL https://bun.sh/install | bash"
    echo ""
    echo -e "${BLUE}Opção 2: Instalar Node.js + npm${NC}"
    echo "brew install node"
    echo ""
    echo -e "${YELLOW}Depois de instalar, execute este script novamente:${NC}"
    echo "bash setup.sh"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Gerenciador de pacotes encontrado: ${PM}${NC}"
echo ""

# Verificar se node_modules existe
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Pasta node_modules já existe${NC}"
    read -p "Deseja reinstalar as dependências? (s/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo -e "${BLUE}🗑️  Removendo node_modules...${NC}"
        rm -rf node_modules
    else
        echo -e "${GREEN}✅ Mantendo dependências existentes${NC}"
        echo ""
        echo -e "${BLUE}Para rodar o projeto na porta 8080:${NC}"
        echo "$PM run dev"
        exit 0
    fi
fi

# Instalar dependências
echo -e "${BLUE}📦 Instalando dependências...${NC}"
echo ""

case $PM in
    bun)
        bun install
        ;;
    npm)
        npm install
        ;;
    yarn)
        yarn install
        ;;
    pnpm)
        pnpm install
        ;;
esac

echo ""
echo -e "${GREEN}✅ Dependências instaladas com sucesso!${NC}"
echo ""

# Verificar configuração da porta
echo -e "${BLUE}🔍 Verificando configuração da porta...${NC}"
if grep -q "port: 8080" vite.config.ts; then
    echo -e "${GREEN}✅ Porta 8080 configurada corretamente!${NC}"
else
    echo -e "${YELLOW}⚠️  Porta não está configurada como 8080${NC}"
fi
echo ""

# Mostrar próximos passos
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Setup Concluído!                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Próximos passos:${NC}"
echo ""
echo -e "${YELLOW}1. Rodar o projeto:${NC}"
echo "   $PM run dev"
echo ""
echo -e "${YELLOW}2. Acessar no navegador:${NC}"
echo "   http://localhost:8080"
echo ""
echo -e "${YELLOW}3. Outros comandos úteis:${NC}"
echo "   $PM run build       # Build para produção"
echo "   $PM run preview     # Preview da build"
echo "   $PM run test        # Rodar testes"
echo ""
echo -e "${BLUE}🔗 Documentação:${NC}"
echo "   - INSTALAR_DEPENDENCIAS.md"
echo "   - RESUMO_MIGRACAO.md"
echo "   - PROXIMOS_PASSOS.md"
echo ""
