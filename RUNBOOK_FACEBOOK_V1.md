# SDC Facebook V1 — Runbook Operacional

## 1. Visão Geral
Sistema de distribuição automática do PiraNOT para Facebook e Instagram (via Meta Graph API). O fluxo é baseado em BullMQ (Redis) + Postgres.

## 2. Processos e Portas
- **Serviço PM2:** `social-dispatcher`
- **Porta:** `3302` (HTTP API)
- **Porta Redis:** `6379` (Fila)
- **Porta Postgres:** `15432` (Persistência)

## 3. Diretório Ativo
`/home/admpiranot/nexus-publisher-security/packages/nexus-pipeline/services/social-dispatcher`

## 4. Variáveis Críticas (.env)
- `META_SYSTEM_TOKEN`: Token mestre do System User.
- `FB_TOKEN_PIRANOT`: Token específico da página PiraNOT.
- `DATABASE_URL`: Conexão com o Postgres do ecossistema.

## 5. Tabelas Importantes
- `posts`: Registro mestre do conteúdo a ser distribuído.
- `job_logs`: Trilha de auditoria por canal e por tentativa.
- `queue_state`: Estado atual da fila de agendamento inteligente.

## 6. Comandos de Operação
- **Ver status:** `pm2 show social-dispatcher`
- **Ver logs:** `pm2 logs social-dispatcher`
- **Reiniciar:** `pm2 restart social-dispatcher`
- **Smoke Test:** `./smoke-test-v1.sh`

## 7. Diagnóstico Rápido
- **Status 'pending' eterno:** Redis pode estar fora ou `BullMQ` com erro de conexão.
- **Erro 'Link not accessible':** O dispatcher valida se o link do PiraNOT está online antes de postar. Se o site estiver sob ataque ou offline, o post é abortado.
- **Erro 'external_id' missing:** Foi corrigido no patch de 13/04/2026. Se persistir, cheque permissões do banco.
- **Rate Limit:** Meta permite ~200 posts por janela deslizante. Se atingido, o worker entra em modo `retry` automático.

## 8. Rollback
Em caso de falha crítica no patch de persistência:
1. Reverter arquivos `BaseWorker.ts`, `facebook.worker.ts`, `instagram.worker.ts` via Git.
2. `pm2 restart social-dispatcher`
3. Validar com `smoke-test-v1.sh`.
