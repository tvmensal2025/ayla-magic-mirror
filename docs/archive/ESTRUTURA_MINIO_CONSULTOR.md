# 📁 ESTRUTURA MINIO POR CONSULTOR

> **Organização de arquivos no MinIO separados por consultor**
> 
> **Data:** 13 de abril de 2026  
> **Status:** ✅ IMPLEMENTADO

---

## 🎯 OBJETIVO

Garantir que cada consultor tenha sua própria pasta no MinIO, com arquivos organizados por cliente.

**Estrutura:**
```
documentos/{consultor_id}/{nome}_{sobrenome}_{data}_{tipo}.{ext}
```

---

## 📁 ESTRUTURA COMPLETA

```
bucket: igreen/
└── documentos/
    ├── 124170/                                    # Consultor 1
    │   ├── joao_silva_19930720_conta.pdf
    │   ├── joao_silva_19930720_doc_frente.jpg
    │   ├── joao_silva_19930720_doc_verso.jpg
    │   ├── maria_santos_19850315_conta.pdf
    │   ├── maria_santos_19850315_doc_frente.jpg
    │   └── maria_santos_19850315_doc_verso.jpg
    │
    ├── 124171/                                    # Consultor 2
    │   ├── pedro_oliveira_19920510_conta.pdf
    │   ├── pedro_oliveira_19920510_doc_frente.jpg
    │   ├── pedro_oliveira_19920510_doc_verso.jpg
    │   ├── ana_costa_19880225_conta.pdf
    │   └── ana_costa_19880225_doc_frente.jpg
    │
    └── 124172/                                    # Consultor 3
        ├── carlos_souza_19950815_conta.pdf
        ├── carlos_souza_19950815_doc_frente.jpg
        └── carlos_souza_19950815_doc_verso.jpg
```

---

## 📋 PADRÃO DE NOMENCLATURA

### **Formato Completo:**
```
documentos/{consultor_id}/{nome}_{sobrenome}_{YYYYMMDD}_{tipo}.{ext}
```

### **Componentes:**

1. **consultor_id**
   - ID do consultor no iGreen
   - Exemplo: `124170`, `124171`, `124172`
   - Obtido de: `consultants.igreen_id`

2. **nome**
   - Primeiro nome do cliente (normalizado)
   - Sem acentos, lowercase
   - Exemplo: `joao`, `maria`, `pedro`

3. **sobrenome**
   - Último sobrenome do cliente (normalizado)
   - Sem acentos, lowercase
   - Exemplo: `silva`, `santos`, `oliveira`

4. **YYYYMMDD**
   - Data de nascimento
   - Formato: Ano + Mês + Dia
   - Exemplo: `19930720` (20/07/1993)

5. **tipo**
   - `conta` - Conta de energia
   - `doc_frente` - Documento frente
   - `doc_verso` - Documento verso

6. **ext**
   - Extensão do arquivo
   - Exemplos: `pdf`, `jpg`, `png`

---

## 🔧 IMPLEMENTAÇÃO

### **Buscar Dados do Consultor:**

```typescript
// Buscar cliente COM consultor (join)
const { data: customer } = await supabase
  .from("customers")
  .select(`
    *,
    consultants:consultant_id (
      id,
      name,
      igreen_id
    )
  `)
  .eq("id", customer_id)
  .single();

// Extrair dados do consultor
const consultant = customer.consultants as any;
const consultantId = consultant?.igreen_id || consultant?.id || "sem_consultor";
const consultantName = consultant?.name || "Consultor";

console.log(`👤 Consultor: ${consultantName} (ID: ${consultantId})`);
```

### **Criar Pasta do Consultor:**

```typescript
// Pasta do consultor
const folderPath = `documentos/${consultantId}`;

// Nome base do arquivo
const baseFileName = `${firstNameNorm}_${lastNameNorm}_${dateFormatted}`;

// Caminho completo
const objectKey = `${folderPath}/${baseFileName}_conta.pdf`;
// Exemplo: documentos/124170/joao_silva_19930720_conta.pdf
```

---

## 📊 EXEMPLOS COMPLETOS

### **Exemplo 1: Consultor 124170 - João Silva**

**Cliente:**
- Nome: "João Silva"
- Data Nascimento: "20/07/1993"
- Consultor ID: 124170

**Arquivos:**
```
documentos/124170/joao_silva_19930720_conta.pdf
documentos/124170/joao_silva_19930720_doc_frente.jpg
documentos/124170/joao_silva_19930720_doc_verso.jpg
```

---

### **Exemplo 2: Consultor 124171 - Maria Santos**

**Cliente:**
- Nome: "Maria Santos Oliveira"
- Data Nascimento: "15/03/1985"
- Consultor ID: 124171

**Arquivos:**
```
documentos/124171/maria_oliveira_19850315_conta.pdf
documentos/124171/maria_oliveira_19850315_doc_frente.jpg
documentos/124171/maria_oliveira_19850315_doc_verso.jpg
```

---

### **Exemplo 3: Múltiplos Clientes do Mesmo Consultor**

**Consultor 124170:**

**Cliente 1 - João Silva:**
```
documentos/124170/joao_silva_19930720_conta.pdf
documentos/124170/joao_silva_19930720_doc_frente.jpg
documentos/124170/joao_silva_19930720_doc_verso.jpg
```

**Cliente 2 - Maria Santos:**
```
documentos/124170/maria_santos_19850315_conta.pdf
documentos/124170/maria_santos_19850315_doc_frente.jpg
documentos/124170/maria_santos_19850315_doc_verso.jpg
```

**Cliente 3 - Pedro Oliveira:**
```
documentos/124170/pedro_oliveira_19920510_conta.pdf
documentos/124170/pedro_oliveira_19920510_doc_frente.jpg
documentos/124170/pedro_oliveira_19920510_doc_verso.jpg
```

---

## ✅ VANTAGENS DA ESTRUTURA

### **1. Isolamento por Consultor** ✅
- Cada consultor tem sua pasta
- Fácil identificar documentos de cada consultor
- Facilita auditoria e compliance

### **2. Organização** ✅
- Estrutura hierárquica clara
- Fácil navegar no MinIO
- Fácil fazer backup por consultor

### **3. Segurança** ✅
- Possível aplicar permissões por pasta
- Cada consultor acessa apenas seus documentos
- Logs separados por consultor

### **4. Escalabilidade** ✅
- Suporta milhares de consultores
- Suporta milhares de clientes por consultor
- Performance não degrada

### **5. Busca Facilitada** ✅
- Buscar todos os documentos de um consultor: `documentos/124170/*`
- Buscar cliente específico: `documentos/124170/joao_silva_*`
- Buscar por tipo: `documentos/124170/*_conta.*`

---

## 🔍 CONSULTAS ÚTEIS

### **Listar todos os documentos de um consultor:**
```
Pasta: documentos/124170/
```

### **Buscar cliente específico:**
```
Padrão: documentos/124170/joao_silva_*
```

### **Buscar por tipo de documento:**
```
Padrão: documentos/124170/*_conta.*
```

### **Buscar por data:**
```
Padrão: documentos/124170/*_19930720_*
```

---

## 📝 LOGS

```
📦 Iniciando upload MinIO para customer: uuid
👤 Consultor: João Consultor (ID: 124170)
📝 Consultor: 124170
📝 Nome base do arquivo: joao_silva_19930720
📄 Baixando conta de energia...
📤 Uploading conta: documentos/124170/joao_silva_19930720_conta.pdf
✅ Conta uploaded: https://minio.com/igreen/documentos/124170/joao_silva_19930720_conta.pdf
📄 Baixando documento frente...
📤 Uploading doc frente: documentos/124170/joao_silva_19930720_doc_frente.jpg
✅ Doc frente uploaded: https://minio.com/igreen/documentos/124170/joao_silva_19930720_doc_frente.jpg
📄 Baixando documento verso...
📤 Uploading doc verso: documentos/124170/joao_silva_19930720_doc_verso.jpg
✅ Doc verso uploaded: https://minio.com/igreen/documentos/124170/joao_silva_19930720_doc_verso.jpg
📦 Upload MinIO concluído: 3/3 arquivos
```

---

## 🚀 RESPOSTA DA API

```json
{
  "success": true,
  "customer_id": "uuid-do-cliente",
  "consultant_id": "124170",
  "consultant_name": "João Consultor",
  "base_file_name": "joao_silva_19930720",
  "folder_path": "documentos/124170",
  "uploads": [
    {
      "type": "conta",
      "url": "https://minio.com/igreen/documentos/124170/joao_silva_19930720_conta.pdf",
      "success": true
    },
    {
      "type": "doc_frente",
      "url": "https://minio.com/igreen/documentos/124170/joao_silva_19930720_doc_frente.jpg",
      "success": true
    },
    {
      "type": "doc_verso",
      "url": "https://minio.com/igreen/documentos/124170/joao_silva_19930720_doc_verso.jpg",
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

## 🎯 REGRAS IMPORTANTES

### **1. Cada Cliente Pertence a UM Consultor** ✅
- Relacionamento: `customers.consultant_id → consultants.id`
- Cliente não pode ter múltiplos consultores
- Consultor pode ter múltiplos clientes

### **2. ID do Consultor é Único** ✅
- `consultants.igreen_id` é único
- Usado como nome da pasta
- Não muda ao longo do tempo

### **3. Arquivos São Únicos por Cliente** ✅
- Combinação: consultor + nome + data
- Garante unicidade
- Evita sobrescrever arquivos

### **4. Pasta Criada Automaticamente** ✅
- MinIO cria pasta automaticamente no upload
- Não precisa criar pasta manualmente
- Estrutura hierárquica mantida

---

## 🔧 DEPLOY

```bash
# Deploy da edge function atualizada
cd supabase
supabase functions deploy upload-documents-minio

# Verificar logs
# Dashboard: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/upload-documents-minio/logs
```

---

## 🧪 TESTE

### **Teste 1: Upload de Cliente**

```bash
# Testar upload
curl -X POST https://seu-projeto.supabase.co/functions/v1/upload-documents-minio \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type": "application/json" \
  -d '{"customer_id":"uuid-do-cliente"}'
```

**Verificar:**
1. Logs mostram ID do consultor
2. Arquivos criados na pasta correta
3. Nomenclatura correta

---

### **Teste 2: Verificar no MinIO**

1. Acessar: https://console-igreen-minio.d9v83a.easypanel.host
2. Navegar: bucket `igreen` → pasta `documentos`
3. Verificar pastas dos consultores: `124170/`, `124171/`, etc.
4. Verificar arquivos dentro de cada pasta

---

## 📊 ESTATÍSTICAS

### **Por Consultor:**
```sql
-- Ver quantos clientes cada consultor tem
SELECT 
  c.igreen_id,
  c.name as consultor_name,
  COUNT(cu.id) as total_clientes
FROM consultants c
LEFT JOIN customers cu ON cu.consultant_id = c.id
GROUP BY c.id, c.igreen_id, c.name
ORDER BY total_clientes DESC;
```

### **Por Cliente:**
```sql
-- Ver documentos de um cliente específico
SELECT 
  cu.name as cliente_name,
  c.igreen_id as consultor_id,
  c.name as consultor_name,
  cu.electricity_bill_photo_url,
  cu.document_front_url,
  cu.document_back_url
FROM customers cu
JOIN consultants c ON c.id = cu.consultant_id
WHERE cu.id = 'uuid-do-cliente';
```

---

## ✅ CHECKLIST

### **Implementação** ✅
- [x] Buscar consultor no banco
- [x] Extrair `igreen_id` do consultor
- [x] Criar pasta por consultor
- [x] Salvar arquivos na pasta correta
- [x] Logs detalhados
- [x] Resposta com dados do consultor

### **Testes** 🔴 PENDENTE
- [ ] Testar upload de cliente
- [ ] Verificar pasta criada no MinIO
- [ ] Verificar nomenclatura dos arquivos
- [ ] Testar múltiplos clientes do mesmo consultor
- [ ] Testar múltiplos consultores

---

## 🎉 RESUMO

**Estrutura implementada:**
```
documentos/{consultor_id}/{nome}_{sobrenome}_{data}_{tipo}.{ext}
```

**Exemplo real:**
```
documentos/124170/joao_silva_19930720_conta.pdf
```

**Vantagens:**
- ✅ Isolamento por consultor
- ✅ Organização hierárquica
- ✅ Fácil busca e auditoria
- ✅ Escalável
- ✅ Seguro

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** ✅ IMPLEMENTADO - PRONTO PARA DEPLOY

📁 **ESTRUTURA POR CONSULTOR IMPLEMENTADA!** 📁

