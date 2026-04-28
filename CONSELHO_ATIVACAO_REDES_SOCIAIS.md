# CONSELHO — Ativação em Todas as Redes Sociais
**Data**: 3 de abril de 2026, 23:45 BRT
**Participantes**: 3 Especialistas (Architect, Strategist, Operator)
**Objetivo**: Debater e votar ativação global + relatórios + memória evolutiva
**Formato**: 3 rodadas de debate, votação ao final

---

## CONTEXTO EXECUTIVO

**Requisitos do Usuário**:
- ✅ Ativar Social Dispatcher em TODAS as redes (FB, IG, TikTok, X, LinkedIn, etc)
- ✅ Relatórios diários, semanais (profundos) e mensais (com planos de ação)
- ✅ Memória evolutiva + aprendizado contínuo do agente
- ✅ Pesquisa e agregação de ferramentas ao GitHub
- ✅ 3 rodadas de debate e conselho

**Baseline**:
- Social Dispatcher v1.0: Segurança hardened (6.5/10 → 8.5/10 com Conselho)
- WordPress PiraNOT: Mobile fix validated ✅
- Network: 700k seguidores distribuídos em múltiplas plataformas
- Stack: Hono, BullMQ, PostgreSQL, Redis, TypeScript

---

## 🎯 RODADA 1: ANÁLISE DE FERRAMENTAS & VOTAÇÃO

### ESPECIALISTA 1: ARQUITETO TÉCNICO
**Função**: Avaliar stack técnico, integrações, infraestrutura

#### Análise de Ferramentas Pesquisadas

**TIER 1 — Unified APIs (Orquestração Social)**
```
┌─────────────────┬────────────────┬──────────────┬─────────┐
│ Ferramenta      │ Plataformas    │ Tipo         │ Custo   │
├─────────────────┼────────────────┼──────────────┼─────────┤
│ Late            │ 8+ platforms   │ Unified API  │ $50/m   │
│ Upload-Post     │ 10+ platforms  │ Unified API  │ $30/m   │
│ Post for Me     │ 9+ platforms   │ Unified API  │ $10/m   │
│ Hootsuite       │ 12+ platforms  │ Management   │ $99/m   │
│ Agorapulse      │ 15+ platforms  │ Management   │ $99/m   │
└─────────────────┴────────────────┴──────────────┴─────────┘

✅ RECOMENDAÇÃO ARQUITETO:
   - PRINCIPAL: Late (melhor API stability, 8 plataformas cobertas)
   - FALLBACK: Upload-Post (mais plataformas, 10+)
   - Para admin UI: Agorapulse (dashboard visual)

   RACIONAL: Social Dispatcher já temos — usar Unified API para
   abstração de plataformas é multiplica eficiência. Agorapulse
   como UI secondary para redação (não programadores).
```

**TIER 2 — Workflow Orchestration (Agendamento Inteligente)**
```
┌────────────────┬────────────────┬──────────────┬──────────┐
│ Ferramenta     │ Linguagens     │ Tipo         │ Custo    │
├────────────────┼────────────────┼──────────────┼──────────┤
│ Temporal       │ TS/Python/Go   │ Durable Exec │ $0 (OSS) │
│ Prefect        │ Python         │ Orchestration│ $0 (OSS) │
│ Airflow        │ Python         │ Orchestration│ $0 (OSS) │
│ AWS Step Fn    │ JSON           │ Serverless   │ $$$      │
└────────────────┴────────────────┴──────────────┴──────────┘

✅ RECOMENDAÇÃO ARQUITETO:
   INTEGRAÇÃO: Temporal + BullMQ (atual)

   RACIONAL: Temporal é Netflix/Stripe/Datadog grade.
   Handles durable execution, retry logic, long-running
   workflows. BullMQ fica como task queue local; Temporal
   como coordinator de workflows complexos (repriorização,
   breaking news, timing optimization).
```

**TIER 3 — Vector DB (Memória Evolutiva)**
```
┌────────────────┬─────────────────┬──────────────┬──────────┐
│ Ferramenta     │ Características │ Tipo         │ Custo    │
├────────────────┼─────────────────┼──────────────┼──────────┤
│ Pinecone       │ Serverless      │ Vector DB    │ $0-$1k/m │
│ Weaviate       │ Open-source     │ Vector DB    │ $0 (OSS) │
│ Milvus         │ Open-source     │ Vector DB    │ $0 (OSS) │
│ Qdrant         │ Open-source     │ Vector DB    │ $0 (OSS) │
│ ChromaDB       │ Lightweight     │ Vector DB    │ $0 (OSS) │
└────────────────┴─────────────────┴──────────────┴──────────┘

✅ RECOMENDAÇÃO ARQUITETO:
   STACK:
   - LOCAL: Weaviate (Docker, 4GB RAM, ~200k embeddings)
   - CLOUD (opcional): Pinecone (scale horizontal)

   RACIONAL: Weaviate é production-ready, suporta multitenancy,
   GraphQL + REST APIs. Perfect para embeddings de posts,
   engagement patterns, timing data. Escalabilidade via sharding.
```

**TIER 4 — Email/Reporting (Relatórios Diários/Semanais/Mensais)**
```
┌────────────────┬──────────────────┬──────────────┬──────────┐
│ Ferramenta     │ Features         │ Tipo         │ Custo    │
├────────────────┼──────────────────┼──────────────┼──────────┤
│ DashThis       │ Email schedules  │ SaaS         │ $99/m    │
│ Whatagraph     │ Automated reports│ SaaS         │ $99/m    │
│ Looker Studio  │ Free BI tool     │ SaaS (free)  │ $0       │
│ Superset       │ Open-source BI   │ Self-hosted  │ $0 (OSS) │
│ Metabase       │ Lightweight BI   │ Self-hosted  │ $0 (OSS) │
└────────────────┴──────────────────┴──────────────┴──────────┘

✅ RECOMENDAÇÃO ARQUITETO:
   STACK (Simples + Poderoso):
   - EMAIL AUTOMATION: Nodemailer + custom templates
   - BI DASHBOARD: Superset ou Metabase (self-hosted)
   - FALLBACK UI: Looker Studio (free, integra Google Analytics)

   RACIONAL: Não gastar com SaaS. Custom email templates
   robustos em HTML + PostgreSQL queries. BI open-source
   permite customização total. Avoid vendor lock-in.
```

**TIER 5 — Observability (Monitoramento Realtime)**
```
┌────────────────┬──────────────────┬──────────────┬──────────┐
│ Ferramenta     │ Features         │ Tipo         │ Custo    │
├────────────────┼──────────────────┼──────────────┼──────────┤
│ Grafana        │ Metrics/Logs     │ Self-hosted  │ $0 (OSS) │
│ Datadog        │ Full stack       │ SaaS         │ $$$$     │
│ Sentry         │ Error tracking   │ SaaS         │ $0-99/m  │
│ Prometheus     │ Metrics          │ Self-hosted  │ $0 (OSS) │
└────────────────┴──────────────────┴──────────────┴──────────┘

✅ RECOMENDAÇÃO ARQUITETO:
   STACK (Already running):
   - Sentry (gratuito para errors)
   - Prometheus + Grafana (local metrics)
   - Pino logger (structured logs, já em uso)

   RACIONAL: Zero additional cost. Prometheus scrapes
   /metrics endpoint. Grafana dashboards for social metrics.
```

### ESPECIALISTA 2: ESTRATEGISTA DE NEGÓCIO
**Função**: Avaliar ROI, timing, impacto editorial, planos de ação

#### Análise Estratégica

**OPORTUNIDADE EDITORIAL**:
```
PiraNOT: 700k seguidores em N plataformas
├─ Facebook: ~300k (main account + regionais)
├─ Instagram: ~200k (main + temáticas)
├─ TikTok: ~150k (crescimento viral)
├─ Twitter/X: ~80k (breaking news)
└─ LinkedIn: ~20k (B2B editorial)

PROBLEMA ATUAL:
  ❌ Publicação manual em cada plataforma (horas de trabalho)
  ❌ Timing não-otimizado (perda de alcance 20-40%)
  ❌ Sem análise de engajamento em tempo real
  ❌ Repriorização breaking news = manual/lento

SOLUÇÃO ORCHESTRATOR:
  ✅ 1 clique = distribuição automática em TODAS as redes
  ✅ Timing inteligente (ML prevê melhor janela por plataforma)
  ✅ Reprioritização automática (breaking news sobe na fila)
  ✅ Analytics consolidados (um único dashboard 700k seguidores)
```

**ROI CALCULADO**:
```
INVESTIMENTO:
  ├─ Ferramentas: $0-$200/m (OSS + Sentry gratuito)
  ├─ Infraestrutura: $0 (AWS/Contabo já existe)
  ├─ Desenvolvimento: 80h (4 sprints, 20h/semana)
  └─ TOTAL: ~R$ 8k (equivalente salário dev 1 semana)

RETORNO (6 meses):
  ├─ Tempo economizado: 15h/semana = 60h/mês redação
  ├─ Valor redação: 60h × R$ 200/h = R$ 12k/mês
  ├─ Alcance adicional: +20-30% impressões (timing otimizado)
  ├─ Engagement rate: +15-25% (reprioritização automática)
  ├─ 6 meses: 6 × R$ 12k = R$ 72k economia tempo
  └─ PLUS: Receita ads (+30%) = R$ 15k/mês × 6 = R$ 90k

  ✅ TOTAL ROI: R$ 162k para investimento R$ 8k = 2025% ROI
```

**PLANO DE AÇÃO EDITORIAL**:
```
FASE 1 (Semana 1-2): Teste com 1 plataforma (Instagram)
  ├─ Ativar Social Dispatcher para IG apenas
  ├─ Validar com redação (1-2 posts/dia)
  ├─ Coletar feedback
  └─ Métricas baseline (engagement, reach)

FASE 2 (Semana 3-4): Expansão gradual
  ├─ Adicionar Facebook + TikTok
  ├─ Validar timing optimization
  ├─ Configurar dashboards de engajamento
  └─ Training redação (interface + workflows)

FASE 3 (Semana 5-6): Full activation
  ├─ Twitter/X + LinkedIn
  ├─ Memória evolutiva ligada (agente aprende)
  ├─ Relatórios automáticos iniciados
  └─ Go-live completo

MÉTRICAS SUCESSO:
  ✅ 100% posts publicados em <= 5 min (vs 30min manual)
  ✅ Timing concordância: 80%+ (ML vs human prediction)
  ✅ Engagement rate: +15% (vs baseline)
  ✅ Redação satisfação: >= 4/5 (qualitativo)
```

**ATAQUES & RISCOS**:
```
⚠️ RISCO 1: Publicação acidental em produção
   ├─ Mitigação: Dry-run mode, preview antes de publicar
   ├─ Rollback: Retirar em <= 2 min via API
   └─ Monitoramento: Alert Slack em publicações erradas

⚠️ RISCO 2: Meta API rate limiting
   ├─ Mitigação: Circuit breaker, exponential backoff
   ├─ Fallback: Fila local (Redis) persiste requests
   └─ Threshold: Max 100 posts/dia/plataforma (configurável)

⚠️ RISCO 3: Memória evolutiva enviesa (bias)
   ├─ Mitigação: Auditar recomendações a cada 1h
   ├─ Human override: Redação pode rejeitar sugestões
   └─ Reset semanal: Reiniciar embeddings de bias patterns

⚠️ RISCO 4: Rotação de tokens (expiração Meta)
   ├─ Mitigação: Auto-refresh + alert 7 dias antes
   ├─ Fallback: Manual token update via dashboard
   └─ Monitoring: Daily token validation

⚠️ RISCO 5: Falha de rede → posts perdidos?
   ├─ Mitigação: Temporal durable execution (retry automático)
   ├─ Persistência: Queue em PostgreSQL + Redis
   └─ Recovery: Replay de workflow falho via UI admin
```

### ESPECIALISTA 3: OPERADOR DE SISTEMAS
**Função**: Viabilidade operacional, deployment, monitoramento

#### Análise Operacional

**ARQUITETURA PROPOSTA**:
```
┌─────────────────────────────────────────────────────────────┐
│ SOCIAL ORCHESTRATOR v2.0 (Agentic, com Conselho)          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ INPUT: Editor│────────▶│ Conselho Pattern              │
│  │              │         │ - Architect Technical         │
│  └──────────────┘         │ - Strategist Business         │
│                           │ - Operator Execution          │
│        │                  └──────────────┘                │
│        │                         │                         │
│        ├─────────────────────────┼─────────────────────────┤
│        │                         │                         │
│        ▼                         ▼                         │
│  ┌──────────────────────────────────────┐                │
│  │ SCHEDULING ENGINE                    │                │
│  │ - Temporal (durable workflows)       │                │
│  │ - BullMQ (local task queue)          │                │
│  │ - Redis (state, cache)               │                │
│  │ - PostgreSQL (persistence)           │                │
│  └──────────────────────────────────────┘                │
│        │                                                   │
│        ├──────────────────────────────────────────────────│
│        │                                                   │
│        ▼                                                   │
│  ┌──────────────────────────────────────┐                │
│  │ DISTRIBUTION LAYER                   │                │
│  │ - Late.dev (unified API wrapper)     │                │
│  │ - Platform adapters (FB, IG, TT, X)  │                │
│  │ - Error handling & retry logic       │                │
│  └──────────────────────────────────────┘                │
│        │                                                   │
│        ▼                                                   │
│  ┌──────────────────────────────────────┐                │
│  │ NETWORKS (Destination)               │                │
│  │ FB, IG, TikTok, Twitter, LinkedIn    │                │
│  └──────────────────────────────────────┘                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ LEARNING & MEMORY LAYER                                    │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Vector DB (Weaviate)                                   │ │
│ │ ├─ Post embeddings (conteúdo, timing, categoria)      │ │
│ │ ├─ Engagement patterns (likes, shares, comments)      │ │
│ │ ├─ Timing predictions (melhor hora por categoria)     │ │
│ │ └─ Trend analysis (breaking news detection)           │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ REPORTING & OBSERVABILITY                                  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Email Reports (Nodemailer + templates)                │ │
│ │ ├─ Diário: Publicações do dia + engagement            │ │
│ │ ├─ Semanal: Análise profunda + planos de ação         │ │
│ │ └─ Mensal: Tendências + recomendações ML              │ │
│ │                                                         │ │
│ │ Analytics Dashboard                                    │ │
│ │ ├─ Metabase / Superset (self-hosted BI)               │ │
│ │ ├─ Real-time: Prometheus + Grafana                    │ │
│ │ └─ Error tracking: Sentry                             │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**DEPLOYMENT & INFRAESTRUTURA**:
```
AMBIENTE: Contabo VPS (AMD Ryzen 9, 64GB RAM, 1TB NVMe)

CONTAINERIZAÇÃO:
  ├─ Temporal Server: Docker container (Temporalio)
  ├─ Social Dispatcher: Node.js (PM2 cluster mode)
  ├─ Weaviate: Docker container (vector DB)
  ├─ PostgreSQL: Existing (nexus_publisher DB)
  ├─ Redis: Existing (BullMQ queue)
  └─ Prometheus + Grafana: Docker stack (monitoring)

DEPLOYMENT COMMAND:
  docker-compose up -d temporal weaviate
  cd services/social-dispatcher && npm run build && pm2 restart dispatcher

MONITORING:
  ├─ Uptime: Healthchecks.io (ping /health every 60s)
  ├─ Logs: Pino → Sentry (errors auto-captured)
  ├─ Metrics: Prometheus scrape :3302/metrics every 30s
  ├─ Dashboards: Grafana :3000 (realtime queue, success rates)
  └─ Alerts: Slack notification on failures

BACKUPS:
  ├─ PostgreSQL: Daily snapshots (social_events, queue_state)
  ├─ Vector DB: Weaviate export (weekly)
  ├─ Config: Git (secrets in .env, not committed)
  └─ RTO: Recovery < 15 min (Docker restart + restore)
```

**OPERAÇÕES DIÁRIAS**:
```
MORNING (06:00 BRT):
  ✓ Run /api/health check (all services up?)
  ✓ Review overnight logs (Sentry)
  ✓ Check queue depth (BullMQ dashboard)
  ✓ Validate database size (PostgreSQL)

MIDDAY (14:00 BRT):
  ✓ Monitor engagement patterns (Grafana)
  ✓ Check for broken tokens (Meta API)
  ✓ Review failing publishes (error logs)
  ✓ Confirm memory system running (Weaviate health)

EVENING (22:00 BRT):
  ✓ Generate daily report (email to editor)
  ✓ Backup vector DB (Weaviate export)
  ✓ Check queue for next day (predictions)
  ✓ Review Temporal workflow dashboard

WEEKLY (Sexta 16:00):
  ✓ Deep analysis report (engagement trends, ROI metrics)
  ✓ Review agent recommendations (bias check)
  ✓ Update timing predictions (ML retraining)
  ✓ Team sync (roadmap, issues)

MONTHLY (Último dia 23:00):
  ✓ Comprehensive analytics (all networks consolidated)
  ✓ Action plans (next month improvements)
  ✓ Trend analysis (what worked, what didn't)
  ✓ Resource planning (costs, team, infrastructure)
```

---

## 🗳️ VOTAÇÃO RODADA 1: FERRAMENTAS & ARQUITETURA

### Questão 1: Qual ferramenta para Unified API?
```
OPÇÕES:
  A) Late.dev (Unified API, melhor stability)
  B) Upload-Post (mais plataformas, 10+)
  C) Agorapulse (full management, UI visual)
  D) Nenhuma (build custom com Meta/TikTok/Twitter APIs)

VOTOS:
  ├─ ARQUITETO:     A (Late + Agorapulse secondary) ✅
  ├─ ESTRATEGISTA:  C (UI importante para redação) ⭕
  ├─ OPERADOR:      A (Late mais estável) ✅

  📊 RESULTADO: LATE.DEV + AGORAPULSE INTERFACE
     Raciocínio: Late como backbone (abstração APIs).
     Agorapulse como UI optional (redação não precisa programar).
```

### Questão 2: Vector DB para memória evolutiva?
```
OPÇÕES:
  A) Pinecone (serverless, scale horizontal)
  B) Weaviate (open-source, self-hosted, GraphQL)
  C) Milvus (enterprise-grade, kompleks)
  D) ChromaDB (lightweight, embedded)

VOTOS:
  ├─ ARQUITETO:     B (production-ready, extensível) ✅
  ├─ ESTRATEGISTA:  A (scale = futuro growth) ⭕
  ├─ OPERADOR:      B (zero custo, controle total) ✅

  📊 RESULTADO: WEAVIATE (com opção Pinecone futura)
     Raciocínio: Weaviate self-hosted agora.
     Migração para Pinecone trivial quando scale > 1M embeddings.
```

### Questão 3: Workflow Orchestration?
```
OPÇÕES:
  A) Temporal + BullMQ (enterprise-grade durable execution)
  B) Prefect (Pythonic, modern)
  C) Airflow (industry standard, complexo)
  D) Keep BullMQ only (simpler, já rodando)

VOTOS:
  ├─ ARQUITETO:     A (Netflix/Stripe/Datadog grade) ✅
  ├─ ESTRATEGISTA:  D (KISS, reduz complexity) ⭕
  ├─ OPERADOR:      A (retry logic + durability crucial) ✅

  📊 RESULTADO: TEMPORAL + BullMQ (layered approach)
     Raciocínio: BullMQ = task queue (existe).
     Temporal = workflow coordinator (long-running, retries).
     Ambos em harmonia, não conflito.
```

### Questão 4: Email Reports & BI?
```
OPÇÕES:
  A) DashThis/Whatagraph (SaaS, $99+/m)
  B) Looker Studio (free, Google-native)
  C) Custom HTML email + Superset/Metabase (DIY)
  D) HubSpot (all-in-one, $$$)

VOTOS:
  ├─ ARQUITETO:     C (máximo controle, zero lock-in) ✅
  ├─ ESTRATEGISTA:  B (free = budget, Looker integra GA) ⭕
  ├─ OPERADOR:      C (customização total, já temos infra) ✅

  📊 RESULTADO: CUSTOM EMAIL + SUPERSET/METABASE
     Raciocínio: HTML templates via Nodemailer.
     Superset/Metabase self-hosted (BI open-source).
     Looker Studio como fallback (free, external).
```

---

## 🎯 RODADA 2: ARQUITETURA DE IMPLEMENTAÇÃO & VOTAÇÃO

### ESPECIALISTA 1: ARQUITETO TÉCNICO
**Proposta: Staging & Gradual Rollout**

```
ARQUITETURA DE FASES:

FASE ZERO (Semana 1):
  ├─ Setup: Temporal Server em Docker
  ├─ Setup: Weaviate em Docker
  ├─ Setup: Late.dev API key + integração
  └─ Testing: Unit tests para 3 especialistas do Conselho

FASE 1 — Instagram Only (Semana 2):
  ├─ Routes: POST /api/dispatch/instagram (com Conselho voting)
  ├─ Logic: Conselho vota (Architect + Strategist + Operator)
  ├─ Queue: BullMQ → Instagram worker
  ├─ Learning: Embeddings dos posts em Weaviate
  ├─ Testing: 5 posts manuais, validate reach/engagement
  └─ Monitoring: Grafana dashboard para IG metrics

FASE 2 — Facebook + TikTok (Semana 3):
  ├─ Routes: POST /api/dispatch/facebook, /tiktok
  ├─ Conselho: Decision tree refinement
  ├─ Timing: ML predicts best time (Weaviate similarity search)
  ├─ Reporting: Daily email report iniciado
  └─ Metrics: Compare timing prediction vs. actual engagement

FASE 3 — Twitter/X + LinkedIn (Semana 4):
  ├─ Routes: POST /api/dispatch/twitter, /linkedin
  ├─ Unified API: Late.dev wrapper for all 5 platforms
  ├─ Breaking News: Repriorização automática (top of queue)
  ├─ Memory: Conselho aprende patterns (Weaviate updates)
  └─ Reports: Semanal report (profundo) iniciado

FASE 4 — Full Activation + Learning (Semana 5-6):
  ├─ Dashboard: Editor vê fila em tempo real
  ├─ Reprioritization: Manual drag-drop via UI
  ├─ Notifications: Slack alerts (quebras, sucesso)
  ├─ Reports: Mensal report com ML insights
  └─ Learning: Agente refina decisões (vector DB evolui)
```

### ESPECIALISTA 2: ESTRATEGISTA DE NEGÓCIO
**Proposta: Métricas & Planos de Ação**

```
MÉTRICAS DE SUCESSO:

DIÁRIO (Email 08:00):
  ├─ Posts published: N (hoje)
  ├─ Reach total: X impressões
  ├─ Engagement: Y interações (likes, shares, comments)
  ├─ Engagement rate: %
  ├─ Top post: [título, plataforma, engagement]
  └─ Issues: [erros, timeouts, falhas]

SEMANAL (Email segunda 09:00):
  ├─ Posts published: N (semana)
  ├─ Reach total: X impressões
  ├─ Engagement rate: % (vs. objetivo)
  ├─ Top performing categories: [categoria, eng%]
  ├─ Best timing windows: [hora, plataforma, eng%]
  ├─ Trending posts: [título, viral score]
  ├─ Platform breakdown: [FB: X%, IG: Y%, TT: Z%, ...]
  ├─ ML insights: [Conselho recommendations]
  ├─ Plano de ação: [3-5 ajustes recomendados]
  └─ Issues resolved: [Y/N, quais]

MENSAL (Email 1º do mês 10:00):
  ├─ Posts published: N (mês)
  ├─ Reach total: X impressões (vs. previous month)
  ├─ Growth: +Z% (impressões, followers, engagement)
  ├─ Category performance: [ranking categorias]
  ├─ Timing optimization impact: +15% (vs baseline)
  ├─ Conselho learning score: accuracy X% (predictions)
  ├─ Revenue impact: +R$ Y (ads, sponsored content)
  ├─ Trend analysis: [o que funcionou, o que não]
  ├─ Roadmap next month: [3-5 initiatives]
  ├─ Team feedback: [qualitative from redação]
  └─ Budget allocation: [where to invest next]

PLANOS DE AÇÃO (Contínuo):
  Se engagement < baseline:
    ├─ ✓ Review timing predictions (pode estar errado)
    ├─ ✓ Check category bias (Conselho enviesa?)
    ├─ ✓ Manual override: Publish breaking news imediato
    └─ ✓ Retrain embeddings (reset Weaviate bias)

  Se timing accuracy < 70%:
    ├─ ✓ Increase training data (mais histórico)
    ├─ ✓ Adjust similarity threshold (Weaviate tuning)
    ├─ ✓ Manual annotation (redação marca "best times")
    └─ ✓ Fallback strategy (usar horários históricos)

  Se queue backup > 100 posts:
    ├─ ✓ Increase worker threads (parallelizar)
    ├─ ✓ Review repriorização logic (pode estar quebrada)
    ├─ ✓ Check API rate limits (Meta/TT throttling?)
    └─ ✓ Manual flush (admin pode limpar queue)
```

### ESPECIALISTA 3: OPERADOR DE SISTEMAS
**Proposta: SLA & Escalabilidade**

```
SERVICE LEVEL AGREEMENTS (SLA):

Availability:
  ├─ Target: 99.5% (43 minutos downtime/mês máx)
  ├─ Monitored: Heartbeat /health endpoint
  ├─ Alert: Slack imediato se > 2 min downtime
  └─ Escalation: Page on-call engineer

Publishing Latency:
  ├─ Target: Post entra → publicado <= 5 min (95% percentile)
  ├─ P50: 1-2 min (fast path)
  ├─ P99: <= 10 min (slow path com retries)
  └─ Monitoring: Prometheus histogram metrics

Queue Depth:
  ├─ Target: <= 50 posts na fila (normal)
  ├─ Warning: > 100 posts (possible bottleneck)
  ├─ Critical: > 500 posts (escalate, manual intervention)
  └─ Scaling: Auto-scale workers if depth > 200

Conselho Decision Latency:
  ├─ Target: Votação completa <= 2 segundos
  ├─ Architect: < 500ms (check technical constraints)
  ├─ Strategist: < 500ms (ML lookup + scoring)
  ├─ Operator: < 500ms (resource availability check)
  └─ Timeout: If > 5s, fallback to default decision

Memory Evolution:
  ├─ Embeddings: Update Weaviate every publish (realtime)
  ├─ Patterns: Recompute trends every 6 hours
  ├─ Bias check: Audit decision recommendations hourly
  ├─ Cleanup: Reset embeddings if accuracy < 60%
  └─ Capacity: 200k embeddings (Weaviate), scale to 1M on Pinecone

API Rate Limits (Meta/TikTok/Twitter):
  ├─ Instagram: 100 publishes/day (monitored)
  ├─ Facebook: 100 publishes/day
  ├─ TikTok: 50 publishes/day (conservative)
  ├─ Twitter: 300 posts/3 hours (Twitter API limit)
  ├─ LinkedIn: 10 publishes/day (conservative)
  └─ Circuit breaker: Halt if > 80% quota used

Recovery & Rollback:
  ├─ Failed publish: Auto-retry 3x (exp. backoff)
  ├─ Persistent failure: Move to dead-letter queue
  ├─ Manual review: Email to editor (review + republish)
  ├─ Rollback post: DELETE /api/dispatch/{postId} (remove from nets)
  └─ Temporal replay: Rerua workflow if needed (durable execution)

Scaling Strategy (Future):
  ├─ 0-100 posts/dia: Current stack OK (1x Temporal, 1x IG worker)
  ├─ 100-500 posts/dia: Add TikTok/FB/Twitter workers (scale horizontally)
  ├─ 500-1k posts/dia: Multi-node Temporal cluster
  ├─ > 1k posts/dia: Microservices (separate service per platform)
  └─ Vector DB: Migrate to Pinecone (serverless scale)
```

---

## 🗳️ VOTAÇÃO RODADA 2: IMPLEMENTAÇÃO & OPERAÇÃO

### Questão 1: Velocidade de rollout?
```
OPÇÕES:
  A) Agressivo (Fase 0-4 em 3 semanas, full activation rápido)
  B) Conservador (Fase 0-4 em 6 semanas, validar cada passo)
  C) Misto (2 semanas Instagram, depois scale)
  D) Paralelo (todas plataformas simultaneamente)

VOTOS:
  ├─ ARQUITETO:     C (validação antes de scale) ✅
  ├─ ESTRATEGISTA:  B (risco > velocidade) ✅
  ├─ OPERADOR:      C (operacional prudência) ✅

  📊 RESULTADO: MISTO (2 semanas IG, 4 semanas total)
     Raciocínio: 2 weeks IG testing.
     Fase 2-4 paralelas (2 semanas para 5 plataformas).
     Total: 4 semanas, controlled rollout.
```

### Questão 2: Conselho voting tempo máximo?
```
OPÇÕES:
  A) 500ms (super rápido, pode errr)
  B) 2s (equilibrio velocidade/qualidade)
  C) 5s (muito tempo, fila vai back up)
  D) Async (não bloqueie publish, vote em background)

VOTOS:
  ├─ ARQUITETO:     B (reasonable timeout) ✅
  ├─ ESTRATEGISTA:  A (speed critical, redação quer rápido) ⭕
  ├─ OPERADOR:      B (reliability first) ✅

  📊 RESULTADO: 2 SEGUNDOS + FALLBACK ASYNC
     Raciocínio: 2s normal SLA.
     Se > 2s, fallback a default decision (não bloqueie).
     Async Conselho vote acontece em background.
```

### Questão 3: Email reports frequência?
```
OPÇÕES:
  A) Diário 08:00 BRT (lightweight summary)
  B) Diário 18:00 (end-of-day summary)
  C) Semanal apenas (segunda 09:00 + mensal)
  D) As-needed (triggered, não scheduled)

VOTOS:
  ├─ ARQUITETO:     A (fácil implementar) ✅
  ├─ ESTRATEGISTA:  A (redação quer diário) ✅
  ├─ OPERADOR:      A (low overhead) ✅

  📊 RESULTADO: DIÁRIO 08:00 + SEMANAL 09:00 + MENSAL 1º
     Raciocínio: Diário curto (< 100 linhas).
     Semanal profundo (análise trends + ML).
     Mensal executivo (ROI, roadmap).
```

---

## 🎯 RODADA 3: EXECUÇÃO & VOTAÇÃO FINAL

### ESPECIALISTA 1: ARQUITETO TÉCNICO
**Proposta: Task Breakdown & Código**

```
SPRINT 0 (Semana 1 — Setup):
  Story 1: Setup Temporal Server (4h)
    ├─ Docker compose: temporal + temporalite
    ├─ Test connection from Node.js
    ├─ Setup default namespace
    └─ Deploy to Contabo (PM2 managed)

  Story 2: Setup Weaviate + Embeddings (6h)
    ├─ Docker: Weaviate instance
    ├─ Schema: Post, Engagement, TimingPattern classes
    ├─ Embeddings: OpenAI text-embedding-3-small
    ├─ Test: Insert 100 sample vectors, search
    └─ Monitoring: Weaviate dashboard

  Story 3: Late.dev Integration (4h)
    ├─ NPM package: late-sdk
    ├─ Config: API keys (FB, IG, TT, X, LI)
    ├─ Wrapper: UnifiedSocialAPI class
    ├─ Tests: Mock publish to each platform
    └─ Error handling: Circuit breaker

  Story 4: Conselho Pattern Implementation (6h)
    ├─ Class: CouncilOrchestrator
    ├─ Specialist 1: Architect (technical constraints)
    ├─ Specialist 2: Strategist (business impact)
    ├─ Specialist 3: Operator (operational feasibility)
    ├─ Voting: Quorum-based decision (2/3 agreement)
    └─ Tests: Unit tests for each specialist

SPRINT 1 (Semana 2 — Instagram):
  Story 5: Instagram Worker (6h)
    ├─ BullMQ: Instagram job queue
    ├─ Worker: Process publish jobs
    ├─ Late.dev: Publish via unified API
    ├─ Retry: 3x exponential backoff
    └─ Tests: E2E publish test (mock)

  Story 6: Instagram Analytics (4h)
    ├─ Webhook: POST /webhooks/instagram (engagement events)
    ├─ Aggregator: Process likes, comments, shares
    ├─ Vector: Store embeddings in Weaviate
    ├─ Dashboard: Grafana IG metrics
    └─ Tests: Mock webhook from Meta

  Story 7: Daily Email Report (4h)
    ├─ Template: HTML email (posts, engagement, issues)
    ├─ Nodemailer: Send to redacao@piranot
    ├─ Scheduling: 08:00 BRT daily (node-cron)
    ├─ Data: Query PostgreSQL aggregations
    └─ Tests: Email rendering, send test

SPRINT 2 (Semana 3 — Facebook + TikTok):
  Story 8: Facebook Worker (4h)
    ├─ Same pattern as Instagram
    ├─ Platform-specific: Graph API quirks
    └─ Tests: Mock publish

  Story 9: TikTok Worker (4h)
    ├─ Same pattern
    ├─ Platform-specific: TikTok API rate limits (conservative)
    └─ Tests: Mock publish

  Story 10: Timing Optimization (6h)
    ├─ ML: Vector similarity search (Weaviate)
    ├─ Feature: "Find similar post timing"
    ├─ Logic: Compare engagement patterns → predict best time
    ├─ Fallback: Historical hourly averages
    └─ Tests: Timing accuracy vs. actual

SPRINT 3 (Semana 4 — Twitter/X + LinkedIn):
  Story 11: Twitter Worker (4h)
    ├─ v2 API integration
    ├─ Rate limits: 300 posts/3h
    └─ Tests: Mock publish

  Story 12: LinkedIn Worker (4h)
    ├─ Organic posting (no ads)
    ├─ Rate limits: 10/day conservative
    └─ Tests: Mock publish

  Story 13: Weekly Deep Report (6h)
    ├─ Template: Engagement trends, category breakdown
    ├─ ML insights: Conselho recommendations
    ├─ Action items: 3-5 suggests for next week
    ├─ Scheduling: Monday 09:00 BRT
    └─ Tests: Report generation

SPRINT 4 (Semana 5-6 — Full Integration + Learning):
  Story 14: Dashboard UI (8h)
    ├─ Queue visualization (realtime)
    ├─ Reprioritize button (drag-drop)
    ├─ Slack notifications (alerts)
    ├─ WebSocket: Live updates
    └─ Tests: E2E dashboard tests

  Story 15: Monthly Executive Report (4h)
    ├─ Template: ROI, growth, trends, roadmap
    ├─ Scheduling: 1º do mês 10:00 BRT
    ├─ Data: 30-day aggregations
    └─ Tests: Report generation

  Story 16: Conselho Learning (6h)
    ├─ Update embeddings (realtime, post-publish)
    ├─ Recompute patterns (6h intervals)
    ├─ Bias audit (hourly check)
    ├─ Reset mechanism (accuracy < 60%)
    └─ Tests: Memory evolution

  Story 17: Production Hardening (6h)
    ├─ Error handling: Comprehensive catch blocks
    ├─ Logging: Structured Pino logs
    ├─ Monitoring: Prometheus metrics
    ├─ Sentry: Error tracking
    └─ Tests: Chaos engineering (failure scenarios)

TOTAL: ~80h (4 weeks @ 20h/week)
```

### ESPECIALISTA 2: ESTRATEGISTA DE NEGÓCIO
**Proposta: Go-Live & Success Criteria**

```
GO-LIVE GATES:

GATE 1 (End of Sprint 0 — IG Ready):
  ├─ Temporal running ✅
  ├─ Weaviate populated ✅
  ├─ Late.dev integrated ✅
  ├─ Conselho voting works ✅
  └─ Decision: PROCEED to Sprint 1

GATE 2 (End of Sprint 1 — IG Validation):
  ├─ 10+ real IG posts published ✅
  ├─ Engagement tracking working ✅
  ├─ Daily email sent 3/5 days ✅
  ├─ No critical errors ✅
  ├─ Redação feedback >= 4/5 ✅
  └─ Decision: PROCEED to Sprint 2 (FB + TT)

GATE 3 (End of Sprint 2 — Multi-Platform):
  ├─ 30+ posts (IG + FB + TT) published ✅
  ├─ Timing optimization accuracy >= 65% ✅
  ├─ Weekly report generated ✅
  ├─ Queue depth stable (< 50 avg) ✅
  └─ Decision: PROCEED to Sprint 3 (X + LI)

GATE 4 (End of Sprint 3 — 5 Platform Activation):
  ├─ 50+ posts across 5 platforms ✅
  ├─ Conselho voting accuracy >= 70% ✅
  ├─ Breaking news repriorization working ✅
  ├─ Memory system learning (embeddings updated) ✅
  └─ Decision: PROCEED to Sprint 4 (Full activation)

GATE 5 (End of Sprint 4 — Production Launch):
  ├─ Dashboard operational ✅
  ├─ Monthly report generated ✅
  ├─ All plataforms stable ✅
  ├─ Team trained (redacao + ops) ✅
  ├─ 99.5% SLA met for 1 week ✅
  └─ Decision: FULL GO-LIVE ✅

SUCCESS CRITERIA (1º month):
  ✅ 0 critical incidents (security, data loss)
  ✅ >= 95% publish success rate
  ✅ >= 70% Conselho voting accuracy
  ✅ Time saved: >= 60h/month (redacao)
  ✅ Reach increase: >= 15% (vs manual baseline)
  ✅ Engagement rate: >= 10% increase
  ✅ Team satisfaction: >= 4/5 (qualitative)

RISKS & CONTINGENCIES:

Risk: Late.dev API downtime
  └─ Contingency: Fallback to direct Meta/Twitter APIs (6h implementation)

Risk: Meta token rotation (tokens expire)
  └─ Contingency: Auto-refresh + manual update UI

Risk: Conselho voting too slow (> 2s)
  └─ Contingency: Async fallback, default decision logic

Risk: Weaviate embeddings diverge (poor quality)
  └─ Contingency: Reset embeddings, retrain on historical data

Risk: Queue backlog (> 500 posts)
  └─ Contingency: Scale workers horizontally, manual flush

Risk: Redacao reluctance (not adopting)
  └─ Contingency: Hands-on training, dashboard customization

CONTINGENCY BUDGET: 10h (week 5-6) for crisis resolution
```

### ESPECIALISTA 3: OPERADOR DE SISTEMAS
**Proposta: Ops Runbook & Support**

```
OPERATIONAL RUNBOOK:

Daily Checks (Checklist):
  06:00 BRT:
    ├─ [ ] docker ps | grep -E "temporal|weaviate|postgres|redis"
    ├─ [ ] curl -s http://localhost:3302/health | jq
    ├─ [ ] pm2 status dispatcher
    ├─ [ ] Review Sentry errors (overnight)
    └─ Action: If any FAIL → escalate, restore from backup

  14:00 BRT:
    ├─ [ ] Queue depth: SELECT COUNT(*) FROM queue_state WHERE status='pending'
    ├─ [ ] Weaviate health: curl -s http://localhost:8080/v1/.well-known
    ├─ [ ] Token freshness: SELECT MAX(updated_at) FROM social_tokens
    ├─ [ ] Review Grafana (memory, CPU, disk)
    └─ Action: If queue > 100 → review reprioritization

  22:00 BRT:
    ├─ [ ] Generate daily report (email send test)
    ├─ [ ] Backup Weaviate: docker exec weaviate /bin/backup
    ├─ [ ] Check PostgreSQL size: SELECT pg_size_pretty(pg_database_size(...))
    ├─ [ ] Review next-day schedule (any breaking news?)
    └─ Action: Notify team if issues

Weekly Maintenance (Fridays):
  ├─ Temporal workflow dashboard: Review success/failure rates
  ├─ Weaviate: Export embeddings (backup)
  ├─ PostgreSQL: Full backup + verify restore
  ├─ Update dependencies: npm audit, docker image updates
  ├─ Review Sentry errors (weekly report)
  └─ Team sync: Discuss roadmap, incidents

Monthly Reviews (1st of month):
  ├─ Capacity planning: Infra usage trends
  ├─ Cost analysis: Late.dev, Sentry, emails
  ├─ Security audit: Tokens, API keys, access logs
  ├─ Archive old data: Clean up > 90 days old posts
  └─ Roadmap: Next month improvements

TROUBLESHOOTING GUIDE:

Problem: Posts not publishing
  1. Check queue: SELECT * FROM queue_state WHERE status='pending'
  2. Check worker: pm2 logs dispatcher | tail -50
  3. Check API: curl -X POST /api/dispatch/instagram (test)
  4. Check tokens: Validate Meta API token freshness
  5. Resolution: Manually retry job, check for circuit breaker

Problem: Conselho voting too slow (> 2s)
  1. Check Weaviate: curl http://localhost:8080/v1/.well-known
  2. Check query time: Review Prometheus query latency
  3. Check CPU/memory: docker stats
  4. Resolution: Restart Weaviate, tune similarity threshold

Problem: Queue backlog (> 500 posts)
  1. Scale workers: pm2 scale dispatcher +2
  2. Check rate limits: Confirm Meta/TT not throttling
  3. Check network: Test connectivity to Late.dev
  4. Manual flush: DELETE oldest 100 posts from queue (salvage)
  5. Notify team: Schedule extended downtime if needed

Problem: Weaviate memory usage high (> 80%)
  1. Check embeddings count: Weaviate API
  2. Cleanup old: Remove embeddings > 180 days
  3. Export & reset: Backup, delete all, reimport
  4. Upgrade: Increase Docker RAM allocation

Problem: Email report not sent
  1. Check Nodemailer: Test SMTP connection
  2. Check mailcow: Verify account active
  3. Check logs: Pino logs for email send error
  4. Manual send: Trigger email endpoint via curl
  5. Fallback: Send via Slack instead

SUPPORT MATRIX:

Tier 1 (Redacao):
  ├─ Can use: Dashboard (publish, reprioritize)
  ├─ Cannot modify: Timing thresholds, Conselho logic
  └─ Escalation: Ops if queue stuck or publish fails

Tier 2 (Ops/Tech Lead):
  ├─ Can use: All Tier 1 + monitoring, restart services
  ├─ Cannot modify: Conselho voting logic, API integrations
  └─ Escalation: Arch if Temporal/Weaviate issues

Tier 3 (Architect):
  ├─ Can modify: Everything
  ├─ Responsible for: Code changes, schema updates, rollouts
  └─ Escalation: Not applicable (final authority)

ON-CALL ROTATION (Weekly):
  ├─ Weekdays (09-17): Ops team (paged on error)
  ├─ Evenings (17-22): Senior ops (on-call, paged)
  ├─ Nights (22-06): Answering machine, page only critical
  └─ Weekends: Rotation (1 person on call, paged on CRIT)
```

---

## 🗳️ VOTAÇÃO RODADA 3: EXECUÇÃO FINAL

### Questão 1: Timeline final (4 sprints, 6 weeks)?
```
OPÇÕES:
  A) 4 sprints em 4 semanas (accelerated, high risk)
  B) 4 sprints em 6 semanas (conservative, recommended)
  C) 4 sprints em 8 semanas (very conservative, slow)
  D) Incremental (Sprint 0-1 agora, 2-4 depois)

VOTOS:
  ├─ ARQUITETO:     B (6 weeks, testing buffer) ✅
  ├─ ESTRATEGISTA:  B (user feedback between sprints) ✅
  ├─ OPERADOR:      B (ops readiness, no crunch) ✅

  📊 RESULTADO: 6 SEMANAS (4 sprints)
     Raciocínio: Realista, com buffer.
     Sprint 0-1: 2 semanas (setup + IG validation).
     Sprint 2-4: 4 semanas (scale 5 plataformas + learning).
     Total: 6 semanas (mid-maio para go-live).
```

### Questão 2: Memória evolutiva agressividade?
```
OPÇÕES:
  A) Agressiva (Agente aprende rápido, pode ter bias)
  B) Moderada (Aprende, mas com audits horários)
  C) Conservadora (Apenas registra, humano decide)
  D) Adaptativa (Ajusta agressividade baseado em accuracy)

VOTOS:
  ├─ ARQUITETO:     D (smart adaptation) ✅
  ├─ ESTRATEGISTA:  B (confiança + safety) ✅
  ├─ OPERADOR:      B (ops stability) ✅

  📊 RESULTADO: MODERADA COM ADAPTAÇÃO
     Raciocínio: Start moderado (audit 1h).
     Se accuracy > 75%, increase agressividade.
     Se accuracy < 60%, reset embeddings.
     Always human override (redacao pode rejeitar).
```

### Questão 3: Escalonamento de falhas (break glass)?
```
OPÇÕES:
  A) Automático total (agente resolve, ops notificado)
  B) Semi-automático (agente tenta, ops approve)
  C) Manual (ops decide tudo)
  D) Hybrid (automático para minor, manual para critical)

VOTOS:
  ├─ ARQUITETO:     D (smart escalation) ✅
  ├─ ESTRATEGISTA:  B (business continuity) ✅
  ├─ OPERADOR:      D (operational safety) ✅

  📊 RESULTADO: HYBRID (automático minor, manual critical)
     Raciocínio:
     - Minor (retry, queue reorder): Automático
     - Major (delete posts, reset system): Manual ops approval
     - Critical (API tokens, security): Manual arch approval
```

### Questão 4: Lançamento oficial?
```
OPÇÕES:
  A) 7 de maio (após 6 sprints, full celebration)
  B) 14 de maio (com 1 semana estabilidade extra)
  C) 1º de junho (maior buffer, mais stable)
  D) Contínuo (soft launch agora, hard launch depois)

VOTOS:
  ├─ ARQUITETO:     D (soft launch agora, scale gradual) ✅
  ├─ ESTRATEGISTA:  A (7 mai, redacao quer logo) ✅
  ├─ OPERADOR:      D (ops prefere stability, soft launch) ✅

  📊 RESULTADO: HYBRID LAUNCH STRATEGY
     Raciocínio:
     - Soft launch: Sprint 1 (IG) — 2 de maio
     - Hard launch (5 plat): Sprint 4 — 7 de maio
     - Official celebration: 7 de maio
     - Continue learning: Maio inteiro (tuning)
```

---

## ✅ RESUMO EXECUTIVO — DECISÕES FINAIS DO CONSELHO

### ARQUITETURA APROVADA:
```
✅ Late.dev (Unified API) + Agorapulse (UI dashboard)
✅ Temporal (workflow orchestration) + BullMQ (task queue)
✅ Weaviate (vector DB para memória evolutiva)
✅ Custom email reports + Superset/Metabase (BI self-hosted)
✅ Grafana + Prometheus (monitoramento realtime)
✅ Sentry (error tracking)
```

### TIMELINE APROVADA:
```
✅ Sprint 0 (Semana 1): Setup infra + Conselho
✅ Sprint 1 (Semana 2): Instagram soft-launch
✅ Sprint 2 (Semana 3): Facebook + TikTok
✅ Sprint 3 (Semana 4): Twitter/X + LinkedIn
✅ Sprint 4 (Semana 5-6): Dashboard + Learning + hard launch

📅 GO-LIVE OFICIAL: 7 de maio de 2026
```

### RELATÓRIOS APROVADOS:
```
✅ Diário (08:00 BRT): Publicações + engagement + issues
✅ Semanal (seg 09:00): Análise trends + planos ação + ML insights
✅ Mensal (1º 10:00): ROI + roadmap + crescimento
```

### MEMÓRIA EVOLUTIVA APROVADA:
```
✅ Weaviate embeddings (200k capacity, escala para 1M)
✅ Moderada + adaptativa (audit 1h, adjust based on accuracy)
✅ Human override sempre disponível (redacao pode rejeitar)
✅ Reset mechanism (se accuracy < 60%)
```

### CONSELHO PATTERN APROVADO:
```
✅ 3 especialistas votam em paralelo
✅ SLA: 2 segundos para decisão
✅ Fallback: Async vote + default decision
✅ Audit: Bias check hourly, pattern review 6h
```

### PRÓXIMAS AÇÕES IMEDIATAS:
```
1️⃣ Hoje (3 de abril, 23:45): Conselho aprova proposta
2️⃣ Amanhã (4 de abril): Criar GitHub project (kanban)
3️⃣ Amanhã: Iniciar Sprint 0 (infraestrutura)
4️⃣ 9 de abril: Sprint 0 completo, IG ready
5️⃣ 10 de abril: Soft-launch Instagram (Sprint 1)
6️⃣ 2 de maio: Instagram validado, scale to 5 plataformas
7️⃣ 7 de maio: HARD LAUNCH (todas plataformas, official)
```

---

## 📊 MÉTRICAS ESPERADAS (APÓS 1 MÊS)

```
PUBLICAÇÕES:
  └─ 100-200 posts (dia × 30 dias) = 3,000-6,000 posts distribuídos

ALCANCE (Impressões):
  └─ +20-30% vs. baseline (timing otimizado + repriorização automática)

ENGAJAMENTO:
  └─ +15-25% engagement rate (automatização + timing)

MEMÓRIA EVOLUTIVA:
  └─ Conselho accuracy: 70-80% (timing predictions)
  └─ Embeddings: 50k-100k (aprendizado)

TEMPO ECONOMIZADO:
  └─ Redação: 60h/mês × R$ 200/h = R$ 12k/mês
  └─ Ops: 20h/mês setup/monitoring

REVENUE IMPACT:
  └─ CPM increase: +30% (mais reach, melhor timing)
  └─ Sponsored content: +15% (demand)

SLA MET:
  └─ Availability: 99.5%
  └─ Publish latency: P95 < 5 min
  └─ Conselho latency: P95 < 2s
```

---

## 🎙️ ASSINADO PELO CONSELHO

**Arquiteto Técnico**: ✅ Aprovado
**Estrategista de Negócio**: ✅ Aprovado
**Operador de Sistemas**: ✅ Aprovado

**Data**: 3 de abril de 2026, 23:55 BRT
**Status**: 🟢 CONSELHO UNANIMIDADE — EXECUTAR

---

## PRÓXIMO PASSO:
```
👉 Criar GitHub project (kanban board)
👉 Iniciar Sprint 0 imediatamente (infraestrutura)
👉 Convoque time redação para kick-off (4 de abril, 10:00)
```

**Projeto APROVADO para execução. Vamos lançar Social Orchestrator v2.0.** 🚀

