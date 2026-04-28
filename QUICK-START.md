# Quick Start - Social Dispatcher v2

## 📋 Pré-requisitos Verificados

- ✅ Node.js 20+
- ✅ Docker + Docker Compose
- ✅ PostgreSQL (compartilhado Nexus)
- ✅ Redis (compartilhado Nexus)
- ✅ Meta System User Token gerado

---

## 🚀 Passos para Rodar (5 minutos)

### 1️⃣ Configurar Token Meta

```bash
# Adicionar ao seu ~/.bashrc (ou ~/.zshrc)
export META_SYSTEM_USER_TOKEN="EAF5iTm3IC9UBRApTKTEzvgRWXFlKV6l0aaZBZCvHIcjU4ArypCR7hmkZAYtxZAGiZC7UIH2pd3QaDpY0Jxo4rPvCrvZA2o9nccoXMYi4LCZCcNdIFDLwNEsaXLgJGC1pbeeqdHKgZA8944OjZBCEQ3BAn992ZCWa7c5wp9hFLaNHaHunSKt4aw9ssb3olBfsX1rvvsZBwZDZD"

# Recarregar shell
source ~/.bashrc  # ou source ~/.zshrc
```

### 2️⃣ Instalar Dependências

```bash
cd /home/admpiranot/nexus-publisher/services/social-dispatcher
npm install
```

### 3️⃣ Configurar Database (Primeira Vez)

```bash
# Copiar schema para Nexus Publisher DB
psql -h localhost -U nexus_publisher -d nexus_publisher < src/db/schema.sql

# Usar senha: nexus_pass_123
```

### 4️⃣ Rodar Localmente (3 Terminais)

**Terminal 1 - Servidor API:**
```bash
cd /home/admpiranot/nexus-publisher/services/social-dispatcher
npm run dev
# Output: 🚀 Social Dispatcher running on port 3302
```

**Terminal 2 - Workers:**
```bash
cd /home/admpiranot/nexus-publisher/services/social-dispatcher
npm run worker:dev
# Output: Starting Social Dispatcher workers...
```

**Terminal 3 - Testes:**
```bash
# Testar endpoint
curl http://localhost:3302/api/health

# Esperado: 
# {"status":"ok","timestamp":"2026-04-02T..."}
```

---

## 🧪 Teste Completo (3 Canais)

```bash
# POST um artigo para distribuição
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PiraNOT - Primeiro Post Social",
    "link": "https://piranot.com.br/teste",
    "summary": "Testando Social Dispatcher v2",
    "category": "technology",
    "priority": 9,
    "channels": ["facebook", "instagram", "whatsapp"],
    "imageUrl": "https://piranot.com.br/images/logo.png",
    "metadata": {
      "sourceId": "test_001",
      "utmCampaign": "first-test"
    }
  }'

# Resposta esperada (202 Accepted):
# {
#   "success": true,
#   "data": [
#     {
#       "jobId": "...",
#       "postId": "uuid",
#       "channel": "facebook",
#       "status": "queued",
#       "timestamp": "2026-04-02T..."
#     },
#     ...
#   ]
# }

# Verificar status
curl http://localhost:3302/api/status/uuid-retornado
```

---

## 🔗 Integração com Nexus Publisher

**Arquivo**: `/home/admpiranot/nexus-publisher/src/pipeline/orchestrator.ts`

Depois que um artigo é publicado no WordPress, adicione:

```typescript
// Após PUBLISH_AS_DRAFT = false
if (config.PRODUCTION_PUBLISH_ENABLED) {
  // ... código existente ...

  // NOVO: Distribuir para redes sociais
  try {
    await axios.post('http://localhost:3302/api/dispatch', {
      title: processedArticle.title,
      link: wordpressPublishResult.link,
      summary: processedArticle.summary,
      category: processedArticle.category,
      imageUrl: processedArticle.featuredImageUrl,
      channels: ['facebook', 'instagram', 'whatsapp'],
      priority: processedArticle.priority || 5,
      metadata: {
        sourceId: processedArticle.id,
        utmCampaign: `piranot-${processedArticle.category}`
      }
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.SOCIAL_DISPATCHER_TOKEN || 'dev-token-change-in-production'}`
      }
    });

    logger.info({ articleId: processedArticle.id }, 'Article queued for social distribution');
  } catch (err: any) {
    logger.warn({ articleId: processedArticle.id, error: err.message }, 'Failed to queue social distribution');
    // Não falha o pipeline - só loga
  }
}
```

---

## 📊 Monitorar Execução

```bash
# Ver logs em tempo real (Terminal 1 - API)
# Logs estruturados em JSON aparecem aqui

# Ver filas BullMQ
curl http://localhost:3302/api/metrics

# Ver status de um post
curl http://localhost:3302/api/status/post-uuid

# Ver logs do worker (Terminal 2)
# Workers processam jobs aqui
```

---

## 🐛 Troubleshooting

### "Cannot find module 'hono'"
```bash
cd /home/admpiranot/nexus-publisher/services/social-dispatcher
npm install
```

### "Connection refused - Database"
```bash
# Verificar se PostgreSQL está rodando
psql -h localhost -U nexus_publisher -d nexus_publisher -c "SELECT 1"
# Se falhar, iniciar: docker exec -it piranot-db pg_isready
```

### "Redis connection refused"
```bash
# Verificar Redis
redis-cli -h localhost -p 6379 ping
# Esperado: PONG
```

### "Invalid token"
```bash
# Verificar variável
echo $META_SYSTEM_USER_TOKEN
# Deve começar com "EAF5..."

# Se vazio, recarregar shell:
source ~/.bashrc
```

---

## 📈 Próximos Passos

1. ✅ **Agora**: Rodar `npm install` + `npm run dev`
2. ⏭️ **Depois**: Testar com `curl` command acima
3. ⏭️ **Depois**: Integrar com Nexus Publisher
4. ⏭️ **Depois**: Deploy em produção (ajustar .env.production)
5. ⏭️ **Depois**: Monitorar métricas + logs

---

## 🚀 Deploy em Produção

```bash
# 1. Build image
docker build -t piranot-social-dispatcher .

# 2. Run container
docker run -d \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e META_SYSTEM_USER_TOKEN=$META_SYSTEM_USER_TOKEN \
  -p 3302:3302 \
  piranot-social-dispatcher

# 3. Usar em Nexus Publisher com: http://social-dispatcher:3302/api/dispatch
```

---

**Status**: ✅ Pronto para usar!

Próximo comando:
```bash
cd /home/admpiranot/nexus-publisher/services/social-dispatcher && npm install
```
