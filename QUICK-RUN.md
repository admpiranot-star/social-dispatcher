# Social Dispatcher — Quick Run

## 1️⃣ Environment Setup

```bash
# Você já tem o token Meta configurado em .env.social
cat .env.social
```

## 2️⃣ Rodar o Servidor (Terminal 1)

```bash
npm run dev
```

Espere ver:
```
[INFO] Starting Social Dispatcher (port 3302)
```

## 3️⃣ Testar a API (Terminal 2)

```bash
chmod +x test-dispatch.sh
./test-dispatch.sh
```

Resposta esperada:
```json
{
  "results": [
    {
      "jobId": "post-001-facebook",
      "postId": "post-001",
      "channel": "facebook",
      "status": "queued",
      "timestamp": "2026-04-02T...",
      "durationMs": 45
    }
  ]
}
```

## 4️⃣ Setup do Banco (quando pronto)

Uma vez que tenha PostgreSQL + Redis rodando:

```bash
# Criar banco e schema
psql -f schema.sql

# Registrar sua conta Facebook
curl -X POST http://localhost:3302/api/accounts \
  -H "Authorization: Bearer change-this-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "facebook",
    "externalId": "YOUR_PAGE_ID",
    "accessToken": "YOUR_PAGE_TOKEN",
    "tokenExpiresAt": "2026-12-31"
  }'
```

## 5️⃣ Próximos Passos

1. **Exportar variações Canva** com cores por categoria
2. **Integrar com Nexus Publisher** (chamar dispatcher após publish)
3. **Configurar webhooks** para receber métricas do Meta

---

**Nota**: Modo Demo (sem banco) mostra como a API funciona. Para produção, configure PostgreSQL + Redis.
