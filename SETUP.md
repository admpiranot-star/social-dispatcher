# Setup Seguro - Social Dispatcher

## ⚠️ SEGURANÇA PRIMEIRO

Você gerou um **System User Token** do Meta. Este token é SENSÍVEL:

✅ **SEGURO**:
- Salvar em `.env.production` (não commitado)
- Usar em variáveis de ambiente
- Rotacionar a cada 3 meses
- Usar com HTTPS apenas

❌ **NUNCA FAZER**:
- Commitá-lo em git
- Logar em console.log
- Compartilhar em chats/emails
- Usar em URLs

---

## Setup Passo a Passo

### 1. Configurar Token Seguramente

**Opção A: Variável de Ambiente (Recomendado)**

```bash
# Adicionar ao seu ~/.bashrc ou ~/docker-compose.env
export META_SYSTEM_USER_TOKEN="EAF5iTm3IC9UBRApTKTEzvgRWXFlKV6l0aaZBZCvHIcjU4ArypCR7hmkZAYtxZAGiZC7UIH2pd3QaDpY0Jxo4rPvCrvZA2o9nccoXMYi4LCZCcNdIFDLwNEsaXLgJGC1pbeeqdHKgZA8944OjZBCEQ3BAn992ZCWa7c5wp9hFLaNHaHunSKt4aw9ssb3olBfsX1rvvsZBwZDZD"

# Verificar
echo $META_SYSTEM_USER_TOKEN
```

**Opção B: Docker Secrets (Production)**

```bash
# Criar secret
echo "EAF5iTm3IC9UBRApTKTEzvgRWXFlKV6l0aaZBZCvHIcjU4ArypCR7hmkZAYtxZAGiZC7UIH2pd3QaDpY0Jxo4rPvCrvZA2o9nccoXMYi4LCZCcNdIFDLwNEsaXLgJGC1pbeeqdHKgZA8944OjZBCEQ3BAn992ZCWa7c5wp9hFLaNHaHunSKt4aw9ssb3olBfsX1rvvsZBwZDZD" | docker secret create meta_token -
```

### 2. Descobrir Credenciais Meta Adicionais Necessárias

De https://developers.facebook.com/apps/ você precisa obter:

```env
# 1. Meta App ID (em Settings → Basic)
META_APP_ID=123456789

# 2. Meta App Secret (em Settings → Basic)
META_APP_SECRET=abcdef1234567890abcdef1234567890

# 3. Facebook Page ID & Token
# Ir em: Messenger → Get Started → Token Generation
# Gerar token para sua página
FB_PAGE_ID=1234567890
FB_PAGE_TOKEN=abcdefghijklmnop...

# 4. Instagram Business Account ID & Token
# Ir em: Instagram Basic Display → Token Generation
IG_BUSINESS_ACCOUNT_ID=1234567890
IG_BUSINESS_ACCOUNT_TOKEN=abcdefghijklmnop...

# 5. WhatsApp Business Phone Number ID
# Ir em: WhatsApp → Phone Numbers
WA_PHONE_NUMBER_ID=123456789012345
WA_BUSINESS_ACCOUNT_ID=abcdef...
```

### 3. Preencher .env.production

```bash
# Copiar template
cp .env.social .env.production

# Editar com suas credenciais
nano .env.production

# NUNCA fazer git add .env.production
echo ".env.production" >> .gitignore
```

### 4. Validar Token

```bash
# Testar se token é válido
curl -X GET "https://graph.facebook.com/v19.0/me?fields=id,name&access_token=EAF5iTm3IC9UBRApTKTEzvgRWXFlKV6l0aaZBZCvHIcjU4ArypCR7hmkZAYtxZAGiZC7UIH2pd3QaDpY0Jxo4rPvCrvZA2o9nccoXMYi4LCZCcNdIFDLwNEsaXLgJGC1pbeeqdHKgZA8944OjZBCEQ3BAn992ZCWa7c5wp9hFLaNHaHunSKt4aw9ssb3olBfsX1rvvsZBwZDZD"

# Resposta esperada:
# {"id":"...", "name":"..."}
```

### 5. Rodar Social Dispatcher

```bash
# Terminal 1: Database
docker-compose -f docker-compose.override.yml up

# Terminal 2: Servidor (com env vars)
export META_SYSTEM_USER_TOKEN="seu-token-aqui"
npm run dev

# Terminal 3: Workers
npm run worker:dev
```

---

## Testando Integração

```bash
# 1. Enviar post para Facebook
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teste PiraNOT",
    "link": "https://piranot.com.br",
    "summary": "Post de teste",
    "category": "technology",
    "priority": 8,
    "channels": ["facebook"],
    "metadata": {
      "sourceId": "article_001",
      "utmCampaign": "test"
    }
  }'

# 2. Verificar status
curl http://localhost:3302/api/status/uuid-retornado

# 3. Ver métricas
curl http://localhost:3302/api/metrics
```

---

## Rotação de Token (Importante!)

Meta recomenda rotacionar tokens a cada **90 dias**:

1. Gerar novo token em https://developers.facebook.com/
2. Atualizar variável `META_SYSTEM_USER_TOKEN`
3. Testar com novo token
4. Deletar token antigo no Meta Developers
5. Documentar data de rotação

---

## Troubleshooting

### Token Inválido
```
Error: "Invalid OAuth access token"
```
**Solução**: Token expirou ou foi revogado. Gerar novo em Meta Developers.

### Rate Limit Hit
```
Error: "(#17) User request limit exceeded"
```
**Solução**: Aguardar 60s. Meta limita a 120 req/min.

### Wrong Credentials
```
Error: "Missing required parameter"
```
**Solução**: Verificar se `META_APP_ID` e `META_APP_SECRET` estão corretos.

---

## Integração com Nexus Publisher

No `src/pipeline/orchestrator.ts` do Nexus:

```typescript
import axios from 'axios';

export async function publishToSocial(article: Article) {
  const socialToken = process.env.SOCIAL_DISPATCHER_TOKEN || 'dev-token';
  
  try {
    const response = await axios.post(
      'http://localhost:3302/api/dispatch',
      {
        title: article.title,
        link: `https://piranot.com.br/${article.slug}`,
        summary: article.excerpt,
        category: article.category,
        imageUrl: article.featuredImage,
        channels: ['facebook', 'instagram', 'whatsapp'],
        metadata: {
          sourceId: article.id,
          utmCampaign: 'piranot-' + article.category
        }
      },
      {
        headers: { Authorization: `Bearer ${socialToken}` }
      }
    );

    logger.info({ jobId: response.data.data[0].jobId }, 'Article queued for social distribution');
    return response.data;
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to queue article for social');
    throw err;
  }
}
```

---

## Status Final

✅ Token validado
✅ Social Dispatcher pronto
✅ Setup documentado
✅ Segurança configurada

**Próximo**: Testar primeiro post!
