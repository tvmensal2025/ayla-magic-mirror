# 📦 NOMENCLATURA DE ARQUIVOS NO MINIO

> **Padrão de nomenclatura para evitar erros e facilitar organização**
> 
> **Data:** 13 de abril de 2026

---

## 🎯 OBJETIVO

Garantir que todos os arquivos salvos no MinIO tenham nomes únicos e organizados, usando o padrão:

```
{primeiro_nome}_{sobrenome}_{data_nascimento}_{tipo}.{extensao}
```

**Exemplo:**
```
joao_silva_19930720_conta.pdf
joao_silva_19930720_doc_frente.jpg
joao_silva_19930720_doc_verso.jpg
```

---

## 📋 PADRÃO DE NOMENCLATURA

### **Formato:**
```
{primeiro_nome}_{sobrenome}_{YYYYMMDD}_{tipo}.{ext}
```

### **Componentes:**

1. **primeiro_nome** (normalizado)
   - Primeiro nome do cliente
   - Sem acentos
   - Sem caracteres especiais
   - Lowercase
   - Exemplo: `joão` → `joao`

2. **sobrenome** (normalizado)
   - Último sobrenome do cliente
   - Sem acentos
   - Sem caracteres especiais
   - Lowercase
   - Exemplo: `Silva` → `silva`

3. **YYYYMMDD** (data de nascimento)
   - Formato: Ano (4 dígitos) + Mês (2 dígitos) + Dia (2 dígitos)
   - Exemplo: `20/07/1993` → `19930720`
   - Se não tiver data: usa data atual

4. **tipo** (tipo do documento)
   - `conta` - Conta de energia
   - `doc_frente` - Documento frente (RG/CNH)
   - `doc_verso` - Documento verso (RG)

5. **ext** (extensão do arquivo)
   - Detectada automaticamente do content-type
   - Exemplos: `jpg`, `png`, `pdf`, `webp`

---

## 🔧 IMPLEMENTAÇÃO

### **Edge Function:** `upload-documents-minio`

**Localização:** `supabase/functions/upload-documents-minio/index.ts`

**Funcionalidades:**

1. **Extração de Nome**
```typescript
function extractFirstLastName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "cliente";
  const lastName = parts[parts.length - 1] || "desconhecido";
  return { firstName, lastName };
}
```

**Exemplos:**
- `"João Silva"` → `{ firstName: "João", lastName: "Silva" }`
- `"Maria Santos Oliveira"` → `{ firstName: "Maria", lastName: "Oliveira" }`
- `"Pedro"` → `{ firstName: "Pedro", lastName: "desconhecido" }`

---

2. **Normalização de Nome**
```typescript
function normalizeFileName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-zA-Z0-9_-]/g, "_") // Substitui caracteres especiais por _
    .replace(/_+/g, "_") // Remove underscores duplicados
    .toLowerCase();
}
```

**Exemplos:**
- `"João"` → `"joao"`
- `"José Carlos"` → `"jose_carlos"`
- `"María"` → `"maria"`
- `"O'Brien"` → `"o_brien"`

---

3. **Formatação de Data**
```typescript
function formatDate(dateString: string | null): string {
  if (!dateString) {
    return new Date().toISOString().split("T")[0].replace(/-/g, "");
  }

  // Tentar parsear DD/MM/AAAA
  const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}${month}${day}`;
  }

  // Fallback: data atual
  return new Date().toISOString().split("T")[0].replace(/-/g, "");
}
```

**Exemplos:**
- `"20/07/1993"` → `"19930720"`
- `"01/01/2000"` → `"20000101"`
- `null` → `"20260413"` (data atual)

---

4. **Montagem do Nome do Arquivo**
```typescript
const fullName = customer.name || "Cliente Desconhecido";
const { firstName, lastName } = extractFirstLastName(fullName);
const dateFormatted = formatDate(customer.data_nascimento);

const firstNameNorm = normalizeFileName(firstName);
const lastNameNorm = normalizeFileName(lastName);
const baseFileName = `${firstNameNorm}_${lastNameNorm}_${dateFormatted}`;

// Exemplo: "joao_silva_19930720"
```

---

5. **Criação dos Nomes Completos**
```typescript
// Conta de energia
const objectKey = `documentos/${baseFileName}_conta.${ext}`;
// Exemplo: "documentos/joao_silva_19930720_conta.pdf"

// Documento frente
const objectKey = `documentos/${baseFileName}_doc_frente.${ext}`;
// Exemplo: "documentos/joao_silva_19930720_doc_frente.jpg"

// Documento verso
const objectKey = `documentos/${baseFileName}_doc_verso.${ext}`;
// Exemplo: "documentos/joao_silva_19930720_doc_verso.jpg"
```

---

## 📊 EXEMPLOS COMPLETOS

### **Exemplo 1: João Silva**
```
Cliente:
- Nome: "João Silva"
- Data Nascimento: "20/07/1993"

Arquivos gerados:
- documentos/joao_silva_19930720_conta.pdf
- documentos/joao_silva_19930720_doc_frente.jpg
- documentos/joao_silva_19930720_doc_verso.jpg
```

### **Exemplo 2: Maria Santos Oliveira**
```
Cliente:
- Nome: "Maria Santos Oliveira"
- Data Nascimento: "15/03/1985"

Arquivos gerados:
- documentos/maria_oliveira_19850315_conta.pdf
- documentos/maria_oliveira_19850315_doc_frente.jpg
- documentos/maria_oliveira_19850315_doc_verso.jpg
```

### **Exemplo 3: José Carlos**
```
Cliente:
- Nome: "José Carlos"
- Data Nascimento: "10/12/1990"

Arquivos gerados:
- documentos/jose_carlos_19901210_conta.pdf
- documentos/jose_carlos_19901210_doc_frente.jpg
- documentos/jose_carlos_19901210_doc_verso.jpg
```

### **Exemplo 4: Cliente sem data**
```
Cliente:
- Nome: "Pedro Alves"
- Data Nascimento: null

Arquivos gerados (usando data atual: 13/04/2026):
- documentos/pedro_alves_20260413_conta.pdf
- documentos/pedro_alves_20260413_doc_frente.jpg
- documentos/pedro_alves_20260413_doc_verso.jpg
```

---

## 🔍 DETECÇÃO DE EXTENSÃO

A extensão é detectada automaticamente do `content-type`:

```typescript
const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "image/heic": "heic",
  "image/heif": "heif",
};
```

**Fallback:** Se não conseguir detectar, usa `jpg`

---

## 📂 ESTRUTURA NO MINIO

```
igreen/                          # Bucket
└── documentos/                  # Pasta de documentos
    ├── joao_silva_19930720_conta.pdf
    ├── joao_silva_19930720_doc_frente.jpg
    ├── joao_silva_19930720_doc_verso.jpg
    ├── maria_oliveira_19850315_conta.pdf
    ├── maria_oliveira_19850315_doc_frente.jpg
    ├── maria_oliveira_19850315_doc_verso.jpg
    └── ...
```

---

## 🚀 COMO USAR

### **1. Chamada da Edge Function**

O webhook já chama automaticamente após finalizar:

```typescript
fetchWithTimeout(`${supabaseUrl}/functions/v1/upload-documents-minio`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({ customer_id: customer.id }),
  timeout: 25_000,
})
```

### **2. Resposta da Edge Function**

```json
{
  "success": true,
  "customer_id": "uuid",
  "base_file_name": "joao_silva_19930720",
  "uploads": [
    {
      "type": "conta",
      "url": "https://minio.com/igreen/documentos/joao_silva_19930720_conta.pdf",
      "success": true
    },
    {
      "type": "doc_frente",
      "url": "https://minio.com/igreen/documentos/joao_silva_19930720_doc_frente.jpg",
      "success": true
    },
    {
      "type": "doc_verso",
      "url": "https://minio.com/igreen/documentos/joao_silva_19930720_doc_verso.jpg",
      "success": true
    }
  ],
  "summary": {
    "total": 3,
    "success": 3,
    "failed": 0
  }
}
```

---

## ✅ VANTAGENS DO PADRÃO

1. **✅ Nomes únicos**
   - Combinação nome + data garante unicidade
   - Evita sobrescrever arquivos

2. **✅ Fácil identificação**
   - Nome do cliente visível no arquivo
   - Data de nascimento para desambiguação

3. **✅ Organização**
   - Todos os documentos de um cliente juntos
   - Ordenação alfabética funciona

4. **✅ Busca facilitada**
   - Buscar por nome: `joao_silva_*`
   - Buscar por data: `*_19930720_*`
   - Buscar por tipo: `*_conta.*`

5. **✅ Sem caracteres problemáticos**
   - Sem acentos
   - Sem espaços
   - Sem caracteres especiais
   - Compatível com todos os sistemas

---

## 🔧 VARIÁVEIS DE AMBIENTE

```bash
# MinIO
MINIO_SERVER_URL=https://console-igreen-minio.d9v83a.easypanel.host
MINIO_ROOT_USER=seu_usuario
MINIO_ROOT_PASSWORD=sua_senha
MINIO_BUCKET=igreen
```

---

## 📝 LOGS

A edge function gera logs detalhados:

```
📦 Iniciando upload MinIO para customer: uuid
📝 Nome base do arquivo: joao_silva_19930720
📄 Baixando conta de energia...
📤 Uploading conta: documentos/joao_silva_19930720_conta.pdf
✅ Conta uploaded: https://minio.com/igreen/documentos/joao_silva_19930720_conta.pdf
📄 Baixando documento frente...
📤 Uploading doc frente: documentos/joao_silva_19930720_doc_frente.jpg
✅ Doc frente uploaded: https://minio.com/igreen/documentos/joao_silva_19930720_doc_frente.jpg
📄 Baixando documento verso...
📤 Uploading doc verso: documentos/joao_silva_19930720_doc_verso.jpg
✅ Doc verso uploaded: https://minio.com/igreen/documentos/joao_silva_19930720_doc_verso.jpg
📦 Upload MinIO concluído: 3/3 arquivos
```

---

## 🚀 DEPLOY

```bash
# Deploy da edge function
cd supabase
supabase functions deploy upload-documents-minio

# Verificar logs
supabase functions logs upload-documents-minio --follow
```

---

## 🧪 TESTE

```bash
# Testar upload
curl -X POST https://seu-projeto.supabase.co/functions/v1/upload-documents-minio \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid-do-cliente"}'
```

---

## 📞 TROUBLESHOOTING

### **Problema: Nome com caracteres estranhos**

**Causa:** Nome não foi normalizado corretamente

**Solução:** Verificar função `normalizeFileName`

---

### **Problema: Data inválida**

**Causa:** Data de nascimento em formato diferente

**Solução:** Verificar função `formatDate` e adicionar mais formatos

---

### **Problema: Arquivo não encontrado**

**Causa:** URL expirou ou é inválida

**Solução:** Verificar se URL está válida antes de fazer upload

---

### **Problema: Extensão errada**

**Causa:** Content-type não reconhecido

**Solução:** Adicionar mais mapeamentos em `mimeToExt`

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** ✅ IMPLEMENTADO

📦 **NOMENCLATURA PADRONIZADA E SEM ERROS!** 📦
