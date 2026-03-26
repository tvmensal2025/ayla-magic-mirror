

## Plano: Sistema Multi-Tenant de Landing Pages com Supabase

### Resumo
Transformar a landing page atual em um sistema multi-tenant onde cada consultor iGreen tem sua própria página personalizada via URL `/:licenca`, com painel admin para edição de dados, usando Supabase para banco de dados, autenticação e storage.

### 1. Banco de Dados — Migration SQL

Criar tabela `consultants`:

```sql
CREATE TABLE public.consultants (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  license text UNIQUE NOT NULL,
  phone text NOT NULL,
  cadastro_url text NOT NULL,
  photo_url text,
  igreen_id text,
  created_at timestamptz DEFAULT now()
);

-- RLS: leitura pública, edição pelo próprio consultor
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.consultants FOR SELECT USING (true);
CREATE POLICY "Owner update" ON public.consultants FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Owner insert" ON public.consultants FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
```

Criar bucket `consultant-photos` (público) para upload de fotos.

### 2. Rotas (App.tsx)

```text
/:licenca      → Landing page pública do consultor
/auth          → Login / Cadastro
/admin         → Painel de edição (protegido)
/              → Redireciona para /auth ou mostra página padrão
```

### 3. Página `/auth` — Login e Cadastro
- Formulário de email/senha usando `supabase.auth.signUp` e `signInWithPassword`
- Após login, redireciona para `/admin`

### 4. Página `/admin` — Painel do Consultor
- Protegida por autenticação (redireciona para `/auth` se não logado)
- Formulário para editar: nome, licença (slug), telefone, URL de cadastro, ID iGreen
- Upload de foto via Supabase Storage (`consultant-photos`)
- Ao salvar, faz upsert na tabela `consultants`
- Mostra preview do link público: `igreen.institutodossonhos.com.br/{licenca}`

### 5. Refatoração dos Componentes
- `HeroSection` e `ConsultantSection` passam a receber props com dados do consultor (`name`, `phone`, `cadastro_url`, `photo_url`, `igreen_id`)
- Os links de WhatsApp e cadastro são gerados dinamicamente a partir dos dados do consultor

### 6. Rota `/:licenca` — Landing Page Dinâmica
- Nova página `ConsultantPage.tsx` que:
  - Lê o parâmetro `licenca` da URL
  - Busca dados do consultor no Supabase (`SELECT * FROM consultants WHERE license = :licenca`)
  - Renderiza todas as seções existentes passando os dados como props
  - Mostra 404 se consultor não encontrado

### Arquivos a criar/editar

| Ação | Arquivo |
|------|---------|
| Criar | `src/pages/Auth.tsx` |
| Criar | `src/pages/Admin.tsx` |
| Criar | `src/pages/ConsultantPage.tsx` |
| Editar | `src/App.tsx` (novas rotas) |
| Editar | `src/components/HeroSection.tsx` (receber props) |
| Editar | `src/components/ConsultantSection.tsx` (receber props) |
| Migration | Tabela `consultants` + RLS |
| Storage | Bucket `consultant-photos` |

### Detalhes Técnicos

- **Auth**: Supabase Auth com email/senha, listener `onAuthStateChange`
- **Storage**: Bucket público `consultant-photos`, upload via `supabase.storage.from('consultant-photos').upload()`
- **Tipo do consultor**: Interface TypeScript `Consultant` com todos os campos
- **Hook customizado**: `useConsultant(license)` para buscar dados do consultor
- **Proteção de rota**: Componente `ProtectedRoute` que verifica sessão antes de renderizar `/admin`

