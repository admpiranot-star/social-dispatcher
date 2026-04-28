# Social Dispatcher — Contexto Persistente
# Atualizado: 2026-04-03T07:12:00-03:00
# Este arquivo preserva contexto crítico entre sessões de agente

## Status Geral
- **Serviço**: social-dispatcher v1.0.0, PM2 process #9, porta 3302
- **Status**: ONLINE, SOCIAL_DISPATCH_ENABLED=true
- **Build**: Limpo (tsc sem erros)
- **Workers ativos**: facebook, instagram

## Infraestrutura
- **PostgreSQL**: postgresql://nexus:nexus123@localhost:5432/nexus_publisher
- **Redis**: redis://localhost:6379
- **SMTP**: dispatcher@piranot.com.br (Mailcow, porta 587, STARTTLS, TLS rejectUnauthorized:false)
- **SMTP Password**: "D1sp@tch3r#PiraN0T!2026" (DEVE ficar entre aspas no .env por causa do #)

## Meta/Facebook API
- **Token Type**: SYSTEM_USER (nunca expira, expires_at: 0)
- **App**: NEXUS (26566736799599573)
- **System User**: NEXUS-BOT (122107015689025172)
- **26 permissões** incluindo pages_manage_posts, instagram_content_publish
- **API Version**: v19.0
- **Total de páginas**: 17 Facebook, 2 Instagram

## Páginas Principais (com tokens individuais em config/pages.ts)
| Página | ID | Followers | IG? |
|--------|----|-----------|-----|
| PIRA NOT | 198240126857753 | 208k | @piranot (150k) |
| JCardoso | 557057011352925 | 156k | - |
| Guia PIRA NOT | 253853868089537 | 35k | @bastidorespiranot (1.9k) |

## Instagram Arte Generator (IMPLEMENTADO 2026-04-03)
- **Tech stack**: Satori + @resvg/resvg-js + Sharp
- **Arquivo principal**: src/media/satori-art-generator.ts (701 linhas)
- **Fontes**: Oswald-Bold.ttf (títulos), DejaVuSans-Bold.ttf (textos), DejaVuSans.ttf (regular)
- **Assets**: services/social-dispatcher/assets/
- **Output temporário**: /tmp/piranot-artes/
- **Publicação web**: /opt/web/piranot/volumes/wp_data/wp-content/uploads/artes/
- **URL pública**: https://piranot.com.br/wp-content/uploads/artes/{filename}
- **Performance**: ~700-800ms por arte (incluindo download de imagem + render)
- **Dimensões**: Feed 1080x1350, Story 1080x1920

### Layout da Arte (replica Canva)
1. Foto de fundo (featured image do artigo) com crop cover + attention
2. Gradiente escuro no terço inferior (0→0→0.5→0.85 opacity)
3. Caixa de título colorida (cor por categoria) com texto branco bold uppercase
4. Barra "LEIA EM: WWW.PIRANOT.COM"
5. Rodapé escuro com logos JC PIRANOT JORNAL + EJUCA

### Cores por Categoria
- politics/economy/sports/other: #1e50b4 (azul)
- police/policial: #cc0000 (vermelho)
- technology: #4b0082 (roxo)
- entertainment: #c71585 (magenta)
- lotteries: #b8860b (ouro escuro)

### Fluxo de Integração
```
Artigo publicado no WP
  → NP social-dispatch.ts envia payload para Social Dispatcher API
    → Dispatcher roteia para páginas (routeArticle)
      → Facebook: enfileira com tipo 'link' (FB gera OG preview)
      → Instagram: SEMPRE enfileira (removido check de imageUrl)
        → Instagram Worker:
          1. Extrai title+category do job data
          2. Gera arte com satoriArtGenerator.generateAndPublish()
          3. Arte publicada em WP uploads → URL pública
          4. Cria container IG com image_url = URL pública
          5. Publica container
```

### Alterações Feitas (2026-04-03)
1. **Novo arquivo**: src/media/satori-art-generator.ts
2. **Instagram worker**: Substituiu canva-generator-simple por satori-art-generator
3. **Dispatcher**: Removeu gate `payload.imageUrl` para IG — agora sempre enfileira
4. **Dispatcher**: Adicionou articleTitle + articleCategory ao job data do IG
5. **Dependências**: satori, @resvg/resvg-js, @types/react adicionados

## Intervalos de Postagem
- **Mínimo geral**: 30 minutos entre posts na mesma página
- **Breaking news**: 60-180 minutos dependendo da tier
- **IG delay**: +3-5 min após FB (evita FB+IG simultâneo)

## Bugs Corrigidos (histórico completo)
1. dotenv # comment truncation → aspas no SMTP_PASS
2. DATABASE_URL → nexus:nexus123 (não nexus_publisher:nexus_pass_123)
3. REDIS_URL → porta 6379 (não 6380)
4. TLS Mailcow self-signed → rejectUnauthorized: false
5. BullMQ → maxRetriesPerRequest: null
6. Porta 3302 conflito → kill orphan, PM2 exclusivo
7. META_APP_SECRET removido → System User não precisa
8. queue_state $2 parameter → split subquery
9. Workers não rodando → dynamic import em server.ts
10. BaseWorker Redis → maxRetriesPerRequest: null
11. Auth header → Authorization: Bearer (não X-API-Token)
12. Instagram arte bug → raw photo ao invés de arte branded (CORRIGIDO com Satori)

## Nexus Publisher Integration Points
- **social-dispatch.ts**: Envia payload com Authorization: Bearer
- **scheduler.ts**: 3 paths de publicação (A: draft promote, B: sensitive draft, C: direct publish)
- **wordpress.ts uploadImageToWP()**: AINDA descarta source_url do WP REST API (pendente de fix)

## Próximos Passos
1. [ ] Fix uploadImageToWP() para capturar source_url do WP REST API
2. [ ] Cleanup automático de artes antigas (/tmp + WP uploads/artes)
3. [ ] TikTok, Twitter/X, LinkedIn workers (Sprint 2-3)
4. [ ] WhatsApp worker (Sprint 2)
5. [ ] Dashboard UI (Sprint 4)

## API Token (produção)
- Token: cnfLF2sE8ZFUqZuGG81cxo9Z9JCtPDrMerwpybrz0D+pkuk4rLe3pJm4u2GIJwSj

## Commits no main (20+ commits)
- Formato: tipo(escopo): descricao
- Push: origin/main
