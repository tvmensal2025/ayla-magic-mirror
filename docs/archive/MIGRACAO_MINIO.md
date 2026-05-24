# 📦 Migração MinIO - Servidor de Mídia

## 🎯 Resumo da Mudança

O servidor MinIO foi migrado para um novo endereço.

### Servidor Antigo:
```
https://igreen-minio.b099mi.easypanel.host
```

### Novo Servidor:
```
https://igreen-minio.d9v63q.easypanel.host
```

### Console de Administração:
```
https://console-igreen-minio.d9v63q.easypanel.host/browser
```

---

## 🔐 Credenciais

```bash
MINIO_SERVER_URL=https://igreen-minio.d9v63q.easypanel.host
MINIO_ROOT_USER=testando200
MINIO_ROOT_PASSWORD=200300400500600
```

---

## ✅ O que foi Atualizado

### Arquivos Modificados:

1. **src/components/ReferralSection.tsx**
   - Vídeo de indicações

2. **src/components/ClubSection.tsx**
   - Vídeos do iGreen Club (2 vídeos)

3. **src/components/licenciada/LicWhySection.tsx**
   - Vídeo casa sustentável

4. **src/components/licenciada/LicHeroSection.tsx**
   - Vídeo licenciada iGreen Energy

5. **src/components/HeroSection.tsx**
   - Vídeo principal Green Energy

6. **src/components/HowItWorksSection.tsx**
   - Vídeo como funciona

7. **src/components/NewsSection.tsx**
   - Base URL para vídeos de notícias (6 vídeos)

8. **src/pages/CRMLandingPage.tsx**
   - Vídeo de venda do CRM

---

## 📊 Total de Atualizações

- **Arquivos modificados**: 8
- **URLs atualizadas**: 11
- **Vídeos afetados**: 11+

---

## 🔧 Configuração do Supabase Storage

A Edge Function `upload-media` usa **Supabase Storage** para uploads de mídia do WhatsApp, não MinIO diretamente.

**Bucket:** `whatsapp-media`

**Tipos permitidos:**
- Imagens: JPEG, PNG, WebP, GIF
- Áudio: MP3, OGG, M4A, WAV, WebM
- Vídeo: MP4, WebM
- Documentos: PDF, DOC, DOCX, XLS, XLSX

**Tamanho máximo:** 100 MB

---

## 🧪 Como Testar

### 1. Testar Vídeos no Site:

Acesse o site e verifique se os vídeos carregam:
- Página inicial (Hero)
- Seção "Como Funciona"
- Seção "iGreen Club"
- Seção "Indicações"
- Página Licenciada
- Página CRM

### 2. Testar Upload de Mídia:

No painel WhatsApp:
1. Tente enviar uma imagem
2. Tente enviar um vídeo
3. Tente enviar um documento
4. Tente enviar um áudio

---

## 🐛 Troubleshooting

### Vídeos não carregam
**Causa:** MinIO não está acessível ou arquivos não foram migrados
**Solução:** 
1. Verifique se o servidor MinIO está online
2. Verifique se os arquivos existem no novo servidor
3. Teste a URL diretamente no navegador

### Erro ao fazer upload
**Causa:** Supabase Storage não configurado
**Solução:**
1. Verifique se o bucket `whatsapp-media` existe
2. Verifique as permissões do bucket
3. Verifique os logs da Edge Function `upload-media`

---

## 📝 Notas Importantes

1. **Vídeos hardcoded**: Os vídeos das páginas estão com URLs hardcoded apontando para o MinIO
2. **Uploads dinâmicos**: Uploads de mídia do WhatsApp usam Supabase Storage
3. **Migração de arquivos**: Certifique-se de que todos os arquivos foram copiados do servidor antigo para o novo

---

## 🔗 Links Úteis

- **Console MinIO**: https://console-igreen-minio.d9v63q.easypanel.host/browser
- **Servidor MinIO**: https://igreen-minio.d9v63q.easypanel.host
- **Supabase Storage**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/storage/buckets

---

## ✅ Status

- ✅ URLs atualizadas no código
- ✅ Credenciais documentadas
- ⏳ Testar vídeos no site
- ⏳ Verificar se arquivos foram migrados

**Próximo passo:** Teste os vídeos no site para garantir que estão carregando! 🚀
