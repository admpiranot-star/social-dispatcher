# Tools Directory

Scripts utilitários e de teste do Social Dispatcher. Estes **NÃO são executados automaticamente** em
produção — são para uso manual durante debugging, setup e validação.

## Scripts

| Script | Propósito | Como usar |
|--------|-----------|-----------|
| `clean-facebook-queue.ts` | Limpa jobs presos na fila do Facebook | `npx ts-node tools/clean-facebook-queue.ts` |
| `extract-layers.ts` | Extrai camadas de configuração para auditoria | `npx ts-node tools/extract-layers.ts` |
| `distribution-strategy.ts.bak` | Backup da estratégia extinta | Somente referência histórica |
| `test-dispatch.sh` | Testa endpoint POST /dispatch | `bash tools/test-dispatch.sh` |
| `test-arte-v4.ts` | Testa integração WordPress→Dispatcher (v4) | `npx ts-node tools/test-arte-v4.ts` |
| `smoke-test-v1.sh` | Smoke test completo (health + dispatch + status) | `bash tools/smoke-test-v1.sh` |
