# 🧠 Profissionalização do Dispatcher — Plano Estratégico

## 1. DIAGNÓSTICO ATUAL

| Camada | Estado | Nota |
|--------|--------|------|
| Enfileiramento (BullMQ + Redis) | ✅ Funcional | 9/10 |
| Routing multi-página (13 páginas) | ✅ Funcional | 8/10 |
| Timing otimizador (ML) | ⚠️ Conectado mas rasoo | 4/10 |
| Sistema de aprendizado (memory) | ⚠️ Coleta dados, não realimenta | 3/10 |
| Métricas de engajamento | ⚠️ Schema existe, vazio | 2/10 |
| Dashboard / monitoramento | ❌ Estático, não serve | 2/10 |
| Execução 24/7 (daemon) | ❌ Precisa de Docker/PM2 | 3/10 |

---

## 2. FERRAMENTAS OPEN SOURCE RELEVANTES (Mapeadas)

### 2.1 Self-hosted Social Schedulers (inspiração, não substituição)
| Ferramenta | Lang | Stars | Diferencial | Serve pra nós? |
|------------|------|-------|-------------|----------------|
| **Postiz** | TS/Next.js | ~10K | IA para gerar posts, agenda unificada | ❌ Overkill — já temos dispatcher |
| **Mixpost** | PHP/Laravel | ~1.5K | Multi-marca, enterprise | ❌ Stack diferente |
| **n8n** | TS | ~45K | Automação visual, webhooks | ✅ Podemos usar para conectar WordPress → Dispatcher |
| **Activepieces** | TS | ~10K | No-code, Graph API fácil | ✅ Alternativa ao n8n |

### 2.2 O que realmente precisamos (não substituir, EVOLUIR)
Nenhuma ferramenta pronta resolve nosso caso específico (13 páginas, conteúdo jornalístico regional, dormant revival). O caminho certo é **evoluir o que já temos**, incorporando componentes open source onde fizer sentido.

---

## 3. PILARES DA PROFISSIONALIZAÇÃO

### Pilar 1: MOTOR DE APRENDIZADO (ML leve, local)

**Estado atual:** O `TimingOptimizer` usa uma query SQL com regressão simples. Funciona mas é frágil.

**Melhoria proposta — 3 fases:**

#### Fase 1: Bayesian Optimization (agora, ~2h)
- Substituir a regressão SQL por Bayesian Optimization
- Biblioteca: `bayesian-optimization` (npm) ou implementação manual
- Input: hora do dia, dia da semana, categoria, página
- Output: score 0-10 de probabilidade de engajamento
- Aprende online: cada post publicado → update do modelo

```
Algoritmo:
1. Para cada (página, categoria), manter distribuição Beta(α, β) por hora
2. α = sucessos (likes+comments+shares) / impressões
3. β = 1 - α
4. Thompson Sampling: sortear da Beta, escolher hora com maior score
5. Exploration bonus: 10% de chance de testar hora aleatória
```

#### Fase 2: Gradient Boosted Trees (mês 2, ~4h)
- Quando tivermos >500 posts com métricas, treinar XGBoost
- Features: hora, dia, categoria, página, tipo de post (link/foto/video)
- Target: engagement_rate
- Biblioteca: `xgboost` (Node.js binding) ou via Python sidecar
- Re-treino semanal automático
- Substitui Thompson Sampling como preditor principal

#### Fase 3: Multi-Armed Bandit em produção (mês 3, ~3h)
- Para cada artigo, testar 2-3 horários candidatos
- Bandit aprende em tempo real qual horário performa melhor
- Auto-balanceia exploration vs exploitation
- Zero configuração manual

### Pilar 2: ALGORITMO DE REVIVAL DE PÁGINAS (Dormant Page Ramp-Up)

Inspirado nas estratégias que o Gemini identificou:

```
ESTADO DA PÁGINA:
  dormant   → 0 posts nos últimos 30 dias
  warming   → 1-2 posts/dia, só conteúdo nativo (fotos/vídeos)
  active    → 3-5 posts/dia, inclui links
  saturated → 5+ posts/dia, timing otimizado

ALGORITMO DE RAMP-UP (por página):
  Semana 1 (dormant→warming):
    - 1 post/dia, apenas foto + legenda curta
    - Horário: 10h ou 15h (seguro)
    - Conteúdo: reciclagem dos top 5 posts históricos
    - Sem links externos (Facebook penaliza)
  
  Semana 2 (warming):
    - 2 posts/dia
    - 1 foto nativa + 1 link (conteúdo local)
    - Começa teste A/B de horários
  
  Semana 3 (warming→active):
    - 3 posts/dia
    - Mix: 1 foto + 1 link + 1 curiosidade/enquete
    - Bandit já começa a otimizar horário
  
  Semana 4+ (active):
    - Thompson Sampling/Bayesian Optimization no controle
    - Frequência: 3-5/dia dependendo do engajamento
    - Monitora "fatigue score" (se engagement_rate cair, reduz frequência)
```

**Regras de segurança (anti-shadowban):**
- Nunca pular de 0 → 10 posts/dia
- Intervalo mínimo entre posts: 2h (semana 1), 1h (semana 2), 30min (semana 3+)
- Se Facebook retornar erro de spam → pausa 24h naquela página
- Monitorar `feedback_score` da Graph API (negative feedback)

### Pilar 3: BOT 24/7 COMO DAEMON

**Arquitetura atual:** PM2 + tsx — frágil, sem health check real.

**Proposta:**

```
┌─────────────────────────────────────────────┐
│                 DOCKER COMPOSE                │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Redis   │  │PostgreSQL│  │  Prometheus│  │
│  │ (fila)   │  │ (dados)  │  │ (métricas) │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │             │              │         │
│  ┌────┴─────────────┴──────────────┴──────┐  │
│  │           API Server (Hono)            │  │
│  │    POST /dispatch → enfileira jobs     │  │
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────┴───────────────────┐  │
│  │         Worker (BullMQ consumer)       │  │
│  │  • Consome fila facebook/instagram     │  │
│  │  • Rate limiting per-page              │  │
│  │  • Publica via Graph API               │  │
│  │  • Coleta métricas → PostgreSQL        │  │
│  │  • Alimenta modelo ML                  │  │
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────┴───────────────────┐  │
│  │         Scheduler (cron interno)       │  │
│  │  • A cada 15min: verifica WP novos     │  │
│  │  • A cada 1h: atualiza modelo ML       │  │
│  │  • A cada 6h: relatório de saúde       │  │
│  │  • A cada 24h: email digest            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │         Grafana Dashboard               │  │
│  │  • Posts/dia por página                 │  │
│  │  • Engagement rate em tempo real        │  │
│  │  • Ramp-up progresso                    │  │
│  │  • Alertas (spam, erro, shadowban)      │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Pilar 4: MÉTRICAS E OBSERVABILIDADE

**Métricas principais (Prometheus + Grafana):**
| Métrica | Descrição | Alerta se |
|---------|-----------|-----------|
| `posts_published_total{page,category}` | Posts publicados | — |
| `posts_failed_total{page,error_type}` | Falhas por tipo | >5% |
| `engagement_rate{page,category,hour}` | Taxa de engajamento | <0.5% |
| `queue_depth{channel}` | Jobs na fila | >100 |
| `ramp_up_phase{page}` | Fase atual (dormant/warming/active) | — |
| `api_latency_ms{endpoint}` | Latência da Graph API | >5000ms |
| `rate_limit_remaining{page}` | Rate limit restante | <10 |

### Pilar 5: CONEXÃO WORDPRESS → DISPATCHER (n8n)

Usar **n8n** (já rodando no servidor!) para:
1. Webhook: WordPress publica artigo → dispara n8n
2. n8n extrai: título, link, categoria, imagem destacada
3. Mapeia categoria WP → categoria dispatcher
4. POST /api/dispatch → enfileira
5. n8n registra no log

**Vantagem do n8n:** Interface visual, já instalado, zero código novo.

---

## 4. ROADMAP DE IMPLEMENTAÇÃO

| Sprint | Duração | Entregas |
|--------|---------|----------|
| **Sprint 1** | 3 dias | Bayesian Optimization no TimingOptimizer, ramp-up config por página, Docker Compose produção |
| **Sprint 2** | 2 dias | Conexão WordPress → n8n → Dispatcher, dashboard Grafana básico |
| **Sprint 3** | 5 dias | Coleta de métricas reais (2 semanas de posts), treinar XGBoost |
| **Sprint 4** | 2 dias | Multi-Armed Bandit, auto-retrain semanal, relatórios email |

---

## 5. CÓDIGO — BAYESIAN OPTIMIZATION (exemplo)

```typescript
// src/lib/bayesian-timing.ts
interface BetaDistribution {
  alpha: number; // sucessos
  beta: number;  // falhas
}

class BayesianTimingOptimizer {
  private posteriors: Map<string, BetaDistribution[]> = new Map();
  // key: "pageId:category", value: array[24 horas]

  // Thompson Sampling: escolhe melhor hora
  sampleBestHour(pageId: string, category: string): number {
    const dists = this.getDistributions(pageId, category);
    let bestHour = 0;
    let bestScore = -Infinity;

    for (let hour = 0; hour < 24; hour++) {
      const d = dists[hour];
      // Amostra da distribuição Beta
      const sample = this.sampleBeta(d.alpha, d.beta);
      if (sample > bestScore) {
        bestScore = sample;
        bestHour = hour;
      }
    }
    return bestHour;
  }

  // Atualiza crenças após observar resultado
  update(pageId: string, category: string, hour: number, engagementRate: number) {
    const dists = this.getDistributions(pageId, category);
    const d = dists[hour];
    // engagementRate 0-1 → tratamos como Bernoulli trial
    d.alpha += engagementRate * 10; // peso
    d.beta += (1 - engagementRate) * 10;
  }

  private sampleBeta(alpha: number, beta: number): number {
    // Marsaglia-Tsang algorithm for Gamma sampling
    // Simplificado: usar biblioteca jstat ou random-gamma
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }
}
```

---

## 6. CONCLUSÃO

**Não precisamos de ferramenta externa.** Nosso sistema já é superior a qualquer scheduler open-source para o caso específico (multi-página, conteúdo jornalístico, ML integrado). O que falta:

1. ✅ **Dispatcher + BullMQ** ← já temos
2. ⚠️ **ML real** (Bayesian → XGBoost) ← 3-5 dias de implementação
3. ⚠️ **Ramp-up automático** ← 2 dias
4. ⚠️ **n8n WordPress → Dispatcher** ← 1 dia
5. ✅ **Docker/Prometheus/Grafana** ← 1 dia (infra existe)

**Tempo total estimado: 2 semanas para MVP profissional.**
