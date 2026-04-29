# Social Dispatcher v2.0 — Documentação Completa

> Última atualização: 2026-04-28  
> Status: FUNCIONANDO em produção (direto via `npx tsx`)  
> GitHub: [github.com/admpiranot-star/social-dispatcher](https://github.com/admpiranot-star/social-dispatcher)  
> Commits: 8 (até `70b82b0`)

---

## 📋 Visão Geral

O Social Dispatcher é o sistema de distribuição automática de conteúdo jornalístico do PiraNOT. Ele pega os artigos publicados no WordPress (piranot.com.br), seleciona os melhores, e distribui para as páginas de Facebook com timing otimizado por ML.

### Para que existe
A PiraNOT teve que cortar 70% da equipe após a pandemia. O dispatcher substitui o trabalho manual de postar em 13+ páginas de Facebook, 60+ artigos/dia, 24/7, sem humano.

### Modelo de negócio
- CPM vendido: R$ 15,00 (vendas diretas locais)
- Blocos por página: 3-5 (média 4)
- Faturamento atual: R$ 28K-40K/mês
- Pico pré-pandemia: R$ 180K/mês (só Google, nicho BBB)
- A meta é voltar ao pico com distribuição automatizada + SEO

---

## 🏗 Arquitetura

```
WordPress REST API (piranot.com.br/wp-json/wp/v2/posts)
         │
         ▼
   Content Curator ──> Seleciona 60 artigos/dia
         │                (prioridade, dedup, categorias)
         ▼
     Dispatcher ──> Roteia para páginas certas
         │              (max 3 páginas/artigo, anti-shadowban)
         ▼
   BullMQ Queues ──> facebook, instagram
         │
         ▼
   Facebook Worker ──> Posta via Graph API v21.0
         │                  (com url-check, retry, feedback)
         ▼
   Engagement Reciler ──> Mede reactions/comments/shares
         │                      (a cada 30min por página)
         ▼
   Bayesian Optimizer ──> Aprende melhor hora/categoria
         │                       (Thompson Sampling, Beta dist.)
         ▼
   Ramp-Up Engine ──> Acorda páginas dormentes gradualmente
         │                  (dormant → warming → active → saturated)
         ▼
   Dashboard (futuro) ──> Métricas para tomada de decisão
```

---

## 📁 Estrutura de Arquivos (14.134 LOC)

### Núcleo (crítico — não mexer sem teste)
| Arquivo | LOC | Função |
|---------|-----|--------|
| `src/dispatcher/index.ts` | 671 | Coração: curadoria → roteamento → enqueue |
| `src/config/pages.ts` | 803 | Config das 17 páginas, categorias, tokens |
| `src/workers/facebook.worker.ts` | ~250 | Posta no Facebook via Graph API |
| `src/daemon/scheduler.ts` | 438 | Daemon 24/7 com 6 ciclos |
| `src/ml/content-curator.ts` | 387 | Busca e filtra artigos do WordPress |
| `src/ml/bayesian-optimizer.ts` | 388 | Thompson Sampling para timing |
| `src/engagement/engagement-reciler.ts` | 384 | MEDIR → APRENDER loop |
| `src/revival/ramp-up.ts` | 463 | Ramp-up de páginas dormentes |

### Infraestrutura
| Arquivo | Função |
|---------|--------|
| `src/server.ts` | Hono API server (port 3302) |
| `src/main.ts` | Entry point |
| `src/db/client.ts` | PostgreSQL connection pool |
| `src/queue/bullmq-setup.ts` | BullMQ queues + workers |
| `src/config.ts` | Variáveis de ambiente |

### API Routes
| Rota | Função |
|------|--------|
| `GET /api/health` | Health check (DB, Redis, Meta, queues) |
| `GET /api/queues` | Queue stats |
| `POST /api/dispatch` | Disparar artigo manual |
| `GET /api/analytics/*` | Métricas |
| `POST /api/webhooks/meta` | Webhook do Facebook |

### Módulos desativados (prontos para conectar)
- `src/workers/whatsapp.worker.ts` — WhatsApp (desativado)
- `src/workers/twitter.worker.ts` — Twitter/X (desativado)
- `src/workers/linkedin.worker.ts` — LinkedIn (desativado)
- `src/workers/tiktok.worker.ts` — TikTok (desativado)
- `src/workers/instagram.worker.ts` — Instagram (worker existe, mas sem token válido)

---

## ⚙️ 6 Ciclos do Daemon

| Ciclo | Intervalo | Função |
|-------|-----------|--------|
| Article Fetch | 10 min | Busca novos artigos do WP, curadoria, dispatch |
| ML Update | 1 hora | Recalcula padrões de timing |
| Engagement Reciler | 30 min | Busca reactions/comments/shares, alimenta Bayesian |
| Bias Audit | 6 horas | Verifica viés de categoria/página |
| Health Check | 5 min | DB, Redis, Meta API, workers |
| Daily Report | 24 horas | Relatório completo |

---

## 📊 Páginas de Facebook (17 total, 13 ativas)

### Tier 1 — Ativas (engagement alto)
| Página | ID | Seguidores | Fase Ramp-Up |
|--------|-----|-----------|-------------|
| PIRA NOT | 198240126857753 | 208.6K | **DESATIVADA no dispatcher** (postagem manual) |
| JCardoso | 557057011352925 | 156.2K | active (15/dia) |
| Guia PIRA NOT | 253853868089537 | 35K | active (15/dia) |
| Policial | 358434294259640 | 12K | active (15/dia) |
| Empregos SP | 775191289166599 | 9.5K | active (15/dia) |
| Campinas | 151625298364783 | 8.5K | warming (5/dia) |
| Porjuca | 462227500775885 | 800 | warming (5/dia) |

### Tier 2 — Aquecendo
| Página | Token Status |
|--------|-------------|
| Jr Cardoso | ⚠️ EXPIRADO |
| Indaiatuba | ⚠️ EXPIRADO |
| Sumaré | ⚠️ EXPIRADO |
| Sorocaba | ⚠️ EXPIRADO |
| Limeira | ⚠️ EXPIRADO (usa token PIRA NOT como fallback) |
| Rio Claro | ⚠️ EXPIRADO |
| Receitas | ⚠️ SEM TOKEN |

### Tier 3 — Desativadas
| Página | Status |
|--------|--------|
| PIRA NOT (208K) | Desativada no dispatcher — postagem manual |
| Instagram (todas) | Worker existe, sem token válido |
| WhatsApp | Desativado |
| Twitter/X | Desativado |
| TikTok | Desativado |

---

## 🛡 Anti-Shadowban

Facebook detecta "coordinated inauthentic behavior" quando:
- Mesmo link em 10+ páginas simultaneamente
- Mensagens idênticas em várias páginas
- Postagens em rajada sem intervalo

### Medidas implementadas
1. **Max 3 páginas por artigo** (10 para breaking news) — `routeArticle()`
2. **Fisher-Yates shuffle** — ordem de distribuição aleatória
3. **Variação de mensagem** — cada página recebe emoji diferente, summary 70%, hashtags 80%, tamanho variável
4. **Ramp-up gradual** — páginas dormentes começam com 1 post/dia sem links
5. **Min interval** — 15-60 minutos entre posts na mesma página
6. **Daily counter Redis** — TTL até meia-noite, reseta automaticamente

---

## 🧠 Machine Learning

### Bayesian Optimizer (Thompson Sampling)
- Para cada combinação (pageId, category, hour), mantém Beta(α, β)
- α = sucesso (engagement alto), β = fracasso (engagement baixo)
- Amostra da distribuição → escolhe hora com melhor expected reward
- 10% de exploração (random) para não travar em ótimo local
- Persistido em PostgreSQL (`bayesian_state`) + Redis cache
- **126 estados ativos** em 12 páginas

### Engagement Reciler (MEDIR → APRENDER)
- A cada 30min: busca reactions/comments/shares de 25 posts por página
- A cada 1h: busca followers/impressions de cada página
- Calcula engagement rate = (reactions + comments + shares) / reach estimado
- Alimenta Bayesian: `update(pageId, category, hour, reward)`
- **1.842 registros** de post_metrics coletados
- Dados disponíveis para Nexus Publisher (ML futuro de geração de conteúdo)

### Ramp-Up Engine
- Fases: dormant (1/dia, sem links, 3h) → warming (5/dia, links piranot, 1h) → active (15/dia, todos links, 30min) → saturated (30/dia, todos links, 15min)
- Classificação por followers: 10K+ = active, 2K+ = warming, <500 = dormant
- Evolução automática: 15+ posts/mês → saturated, 5K+ followers → active
- Contadores diários em Redis `rampup:daily:{pageId}` com TTL até meia-noite

---

## 🗄 Banco de Dados

### PostgreSQL (127.0.0.1:15432, db: nexus_publisher)

| Tabela | Função | Registros |
|--------|--------|-----------|
| `posts` | Artigos rastreados | 159 (44 published, 45 failed, 55 pending) |
| `post_metrics` | Reactions/comments/shares por post | 1.842 |
| `page_metrics` | Followers/impressions por página | 14 |
| `ramp_up_state` | Fase e contadores do ramp-up | 5 páginas |
| `bayesian_state` | Estados do Thompson Sampling | 126 |
| `engagement_events` | Eventos de engagement do webhook | (via webhook) |
| `job_logs` | Log de execução de jobs | 288 failed + n |

### Redis (127.0.0.1:6379, password: URL-encoded)

| Key Pattern | Função |
|-------------|--------|
| `rampup:daily:{pageId}` | Contador de posts hoje (TTL até meia-noite) |
| `bull:social-facebook:*` | Queue BullMQ |
| `bayesian:{key}` | Cache do Bayesian (fallback) |

---

## 🔐 Variáveis de Ambiente (.env.social)

```bash
# CRÍTICAS
REDIS_URL=redis://default:***@127.0.0.1:6379
DATABASE_URL=postgresql://nexus:***@127.0.0.1:15432/nexus_publisher
FB_APP_ID=***
FB_APP_SECRET=***

# TOKENS POR PÁGINA (13 variáveis)
FB_TOKEN_PIRANOT=***     ← FUNCIONANDO
FB_TOKEN_JCARDOSO=***    ← FUNCIONANDO
FB_TOKEN_GUIA=***        ← EXPIRADO
FB_TOKEN_CAMPINAS=***   ← EXPIRADO
FB_TOKEN_JUNIOR=***      ← EXPIRADO
# ... (11 de 13 expirados)

# SMTP (offline — reports são logados, não enviados)
SMTP_HOST=***  SMTP_USER=***  SMTP_PASS=***
```

---

## 🐛 Bugs Conhecidos e Corrigidos (audit 2026-04-28)

### Corrigidos nesta sessão
| Bug | Gravidade | Correção |
|-----|-----------|----------|
| `page_metrics` INSERT SQL malformado (`ON CONFLICT DO NOTHING` seguido de `SET`) | P1 | Reescrito como INSERT simples |
| `post_metrics` INSERT SQL malformado (mesmo bug) | P1 | Já corrigido antes |
| Health check sempre FAILED (`workersRunning` = false) | P2 | Fail-open: `workersRunning = true` se workers iniciaram |
| `catch(() => {})` silenciando erros críticos | P2 | Adicionado logger.warn/debug em 3 locais |

### Pendentes
| Bug | Gravidade | Solução |
|-----|-----------|---------|
| 11/13 page tokens EXPIRADOS | P0 | Regenerar no Meta for Developers (30min manual) |
| 45 posts Failed (links 404) | P2 | Worker já faz url-check antes, mas artigos velhos no DB |
| Queue stats retorna `undefined` | P3 | getQueueStats() não retorna waiting/active corretamente |
| SMTP offline | P4 | Reports são logados mas não enviados por email |

---

## 📈 Métricas Reais (coletadas 2026-04-28)

### Facebook Reach (PIRA NOT, 208K seguidores)
- **2.792.000** impressões únicas em 28 dias
- **99.714** pessoas/dia (média)
- Pico diário: **85.949** (23/04)
- Engagement médio por post: **216** interações
- Top post: **903** interações

### Engagement por tipo de notícia
| Tipo | Média/post |
|------|-----------|
| URGENTE (🚨) | 319 |
| GERAL | 223 |
| ACIDENTE | 130 |
| PRISÃO/CRIME | 13 |

### Melhores horários
| Hora | Engagement médio |
|------|-----------------|
| 16h | 271.6 |
| 12h | 225.3 |
| 17h | 216.8 |
| 00h | 215.7 |
| 21h | 192.3 |

---

## 🚀 Próximos Passos (roadmap)

### Prioridade 0 — Estabilidade (agora)
- [ ] **Regenerar 11 page tokens** no Meta for Developers
- [ ] **Docker 24/7** — reconstruir containers com código atual
- [ ] **PM2** — process manager para restart automático
- [ ] **Monitoramento** — alertar se processo morrer

### Prioridade 1 — Convergência (1-2 semanas)
- [ ] **Instagram integration** — ativar worker, gerar tokens IG
- [ ] **Facebook Groups** — API de groups para distribuição
- [ ] **WhatsApp Channels** — conectar com WhatsApp Business API
- [ ] **Limpar posts failed** — DELETE FROM posts WHERE status='failed'

### Prioridade 2 — Escala (1-3 meses)
- [ ] **Twitter/X** — ativar worker (já existe código)
- [ ] **TikTok** — ativar worker (já existe código)
- [ ] **Canais de transmissão** — integração com broadcast channels
- [ ] **Expansão nacional** — novas páginas para outras cidades
- [ ] **Grafana dashboard** — Prometheus + metrics

### Prioridade 3 — Inteligência (2-6 meses)
- [ ] **Nexus Publisher** — usar dados de engagement para gerar conteúdo
  - Dados coletados: 1.842 post_metrics, padrões por tipo/hora/página
  - Colunas disponíveis para ML: page_id, category, hour, engagement_rate, reactions, shares
  - Insights salvos em `/tmp/nexus_publisher_insights.json`
- [ ] **A/B testing** — testar variações de mensagem (já existe tabela `ab_tests`)
- [ ] **Sentiment analysis** — classificar comentários automaticamente
- [ ] **Auto-curation** — Bayesian decide quais artigos publicar (não só quando)

### Prioridade 4 — Monetização avançada (3-12 meses)
- [ ] **Facebook → Google SEO loop** — cada clique melhora ranking orgânico
- [ ] **Ad insertion** — inserir tracking UTM para medir conversão Facebook → site
- [ ] **Revenue dashboard** — CTR × CPM × pageviews por canal
- [ ] **Dynamic pricing** — ajustar CPM por horário/página baseado em engagement

---

## 🔧 Comandos Úteis

```bash
# Iniciar dispatcher
cd /home/admpiranot/migration/phase3a/social-dispatcher
npx tsx src/main.ts &

# Health check
curl http://localhost:3302/api/health

# Ver fila
curl http://localhost:3302/api/queues

# Redis manual
redis-cli -h 127.0.0.1 -p 6379 -a "$(python3 -c 'from urllib.parse import unquote; print(unquote("NKWvQpxSzs7I7kgLgYHHGfN6%2BLifMi5j"))')" KEYS "rampup:*"

# Postar manualmente na PIRA NOT (208K)
source .env.social
curl -X POST "https://graph.facebook.com/v21.0/198240126857753/feed" \
  -d "message=🚨 Título da notícia" \
  -d "link=https://piranot.com.br/..." \
  -d "access_token=$FB_TOKEN_PIRANOT"

# Agendar post na PIRA NOT (timestamp Unix)
curl -X POST "https://graph.facebook.com/v21.0/198240126857753/feed" \
  -d "message=🚨 Título" -d "link=..." \
  -d "published=false" \
  -d "scheduled_publish_time=$(date -d '08:30' +%s)" \
  -d "access_token=$FB_TOKEN_PIRANOT"

# Ver engagement dos posts
PGPASSWORD=nexus_password psql -h 127.0.0.1 -p 15432 -U nexus -d nexus_publisher -c \
  "SELECT page_name, AVG(engagement_rate), SUM(reactions) FROM post_metrics GROUP BY page_name ORDER BY 2 DESC;"
```

---

## ⚠️ Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|-------------|-----------|
| Facebook muda API/v21.0 descontinuado | Média | Graph API é estável, mas monitorar changelog |
| Tokens expiram (90 dias page tokens) | Alta | Regenerar a cada 60 dias, automatizar |
| Shadowban por posting pattern | Baixa | Anti-shadowban implementado (max 3, variação, spacing) |
| Redis/PostgreSQL cai | Baixa | Docker restart policy, health check, fail-open |
| Processo morre (OOM, unhandled) | Média | PM2 ou Docker restart, monitoring |

---

## 📝 Notas para o Desenvolvedor

1. **PIRA NOT (208K) é postada MANUALMENTE** — não habilitar no dispatcher sem autorização
2. **Tokens expirados** — 11 páginas precisam de token regenerado no Meta for Developers
3. **O sistema é fail-open** — se ramp-up falha, post é permitido. Se Bayesian falha, usa default. Não bloquear produção por feature secundária.
4. **Engagement data é ouro** — cada métrica coletada alimenta o Nexus Publisher no futuro
5. **Os canais fora do Facebook (WhatsApp, IG, Twitter, TikTok, grupos)** são o próximo passo lógico — a arquitetura já suporta via workers separados
6. **O gargalo NÃO é conteúdo** (60+ artigos/dia do WP) — é DISTRIBUIÇÃO
7. **Facebook → Google** é o loop de ouro: cliques do FB = sinais de qualidade pro Google = mais tráfego orgânico = mais receita

---

*Documento gerado automaticamente pelo PiraNOT AI Agent — 2026-04-28*