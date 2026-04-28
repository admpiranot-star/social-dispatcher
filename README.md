# 🚀 Social Dispatcher — Sistema Inteligente de Distribuição Social

**Agente inteligente para distribuição em múltiplas redes sociais com scheduling dinâmico e IA.**

![Status](https://img.shields.io/badge/status-development-yellow)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.0-blue)

## 📋 O Que Foi Entregue (NBC Level)

### ✅ **5 Fases Completas**

**FASE 1** — Fundação (BD + Descoberta de Rede)
**FASE 2** — Inteligência (Conselho de 3 Especialistas)
**FASE 3** — Artes (Video → Publicação Multi-Plataforma)
**FASE 4** — Dashboard em Tempo Real (WebSocket)
**FASE 5** — IA + Analytics (ML-based Timing Optimizer)

---

## 🔐 ⚠️ STATUS PRÉ-PRODUÇÃO

### Vulnerabilidades Críticas Identificadas

```
AUDITORIA: 6 CRÍTICOS + 4 ALTOS
Score: 2/10 — ❌ NÃO PRONTO PARA PRODUÇÃO

CRÍTICOS (Parar imediatamente):
  ❌ SQL Injection em analytics.ts
  ❌ XSS em dashboard.html
  ❌ OS Command Injection em video-processor.ts
  ❌ CORS Aberto (allows any origin)
  ❌ Hardcoded Meta Token em .env.social
  ❌ Weak API_TOKEN em .env.production
```

**Veja SECURITY.md para plano detalhado de remediação (24-32 horas)**

---

## 🚀 Arquitetura

```
Nexus Publisher
      ↓
  Dispatcher (Agente Inteligente)
      ↓
  BullMQ Queue (6 plataformas)
      ↓
  Meta API | TikTok | Twitter | LinkedIn
```

---

## 📊 Auditorias Realizadas

1. **Arquitetura**: 6.5/10 — Type-safety a melhorar
2. **Segurança**: 2/10 — 6 críticos encontrados
3. **Testes**: <5% — Cobertura insuficiente

---

**Desenvolvido por Claude — PiraNOT Social Dispatcher v1.0-PRE**
