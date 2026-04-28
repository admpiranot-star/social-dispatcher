# REMEDIATION ROADMAP — Social Dispatcher v1.1

**Status**: BLOQUEADO PARA PRODUÇÃO
**Objetivo**: Atingir 7.5+/10 (Production Ready) em 2 sprints
**Estimativa**: 15.5h (P0) + 20h (P1) = 35.5h total

---

## FASE 1: SECURITY PATCH (P0 — 15.5 horas)

### 1️⃣ Revogar Meta Token Hardcoded (1 hora) — IMEDIATO

**Criticidade**: CVSS 10.0 — Todas as contas Meta comprometidas

**Passos**:

```bash
# 1. Ir para Meta App Dashboard
# https://developers.facebook.com/apps/
# Localizar Social Dispatcher App

# 2. Revogar token comprometido
# Settings → System Users → revogar token atual

# 3. Gerar novo token
# Token: <novo_token>
# Scopes: pages_manage_posts, instagram_manage_messages, pages_read_engagement

# 4. Remover do repositório
rm .env.social

# 5. Atualizar .gitignore
echo ".env.social" >> .gitignore
echo ".env.production" >> .gitignore

# 6. Criar .env.social.example (sem secrets)
cat > .env.social.example << 'EOF'
# Meta API
META_SYSTEM_TOKEN=xxxx  # Use AWS Secrets Manager in production
META_API_VERSION=v20.0
ALLOWED_ORIGINS=https://piranot.com.br,https://editor.piranot.com.br

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/social
REDIS_URL=redis://localhost:6379

# API
API_TOKEN=xxxx  # 64-char random hex token
RATE_LIMIT_PER_MIN=100

# Logging
LOG_LEVEL=info
NODE_ENV=production
EOF

# 7. Verificar que não há mais secrets
git diff --cached .env.*
git log --oneline | head -1  # Notar o commit da adição original

# 8. Alertar a segurança
# "Meta token (EAF5iTm...) foi exposto em commit c812a43"
# "Todos os connected Instagram/Facebook accounts estão em risco"
# "Revogar e gerar novo token com limited scope"
```

**Documentar**:
```markdown
## Security Incident Report

**Date**: 2026-04-02
**Incident**: Hardcoded Meta API token in version control
**Severity**: CVSS 10.0 (Critical)
**Impact**: All connected Meta accounts

### Timeline
- 2026-03-30: Token added in commit c812a43 (inadvertent exposure)
- 2026-04-02: Discovered during Jules audit
- 2026-04-02: Token revoked and new token generated

### Remediation
- [x] Token revoked in Meta App Dashboard
- [x] New token generated with limited scope
- [x] Old token removed from repository
- [x] Rotated in secrets manager

### Prevention
- [x] .env files added to .gitignore
- [x] Pre-commit hook to detect secrets (implement in P1)
- [x] Code review checklist updated
```

**Verificação**:
```bash
git log --all --oneline | grep -i token
# Deverá retornar apenas commits de REMOVAL

grep -r "EAF5iTm3IC9UBR" .
# Deverá retornar NADA
```

---

### 2️⃣ Fix SQL Injection em analytics.ts (2 horas) — P0

**Criticidade**: CVSS 9.8 — Database compromise

**Arquivo**: `src/api/analytics.ts` linhas 39, 58, 111, 152, 282

**Padrão vulnerável**:
```typescript
// ANTES
const days = parseInt(c.req.query('days') || '7');
const result = await query(`
  WHERE p.created_at > NOW() - INTERVAL '${days} days'
`);
```

**Solução**:
```typescript
// DEPOIS
// 1. Validate input
const days = z.coerce
  .number()
  .int()
  .min(1)
  .max(365)
  .parse(c.req.query('days') || 7);

// 2. Use parameterized query
const result = await query(
  `SELECT ...
   WHERE p.created_at > NOW() - $1::INTERVAL`,
  [days]  // Parameter binding — safe from injection
);
```

**Aplicar em todos os 5 endpoints**:
1. `GET /analytics/performance` (linha 39)
   ```typescript
   // Change: WHERE p.created_at > NOW() - INTERVAL '${days} days'
   // To: WHERE p.created_at > NOW() - $1::INTERVAL
   // params: [days]
   ```

2. `GET /analytics/performance` total query (linha 58)
   ```typescript
   // Same pattern
   ```

3. `GET /analytics/by-category` (linha 111)
   ```typescript
   // Change: WHERE p.created_at > NOW() - INTERVAL '${days} days'
   // To: WHERE p.created_at > NOW() - $1::INTERVAL
   // params: [days]
   ```

4. `GET /analytics/by-platform` (linha 152)
   ```typescript
   // Same pattern
   ```

5. `GET /analytics/export/csv` (linha 282)
   ```typescript
   // Same pattern
   ```

**Checklist**:
```bash
# 1. Before changes
npm test  # Current baseline

# 2. Make changes
# ... edit src/api/analytics.ts

# 3. Validate syntax
npx tsc --noEmit

# 4. Test changes
npm test

# 5. Run SQL injection patterns check
grep -n "INTERVAL '\${" src/api/analytics.ts
# Should return: (no output)

grep -n "INTERVAL \$" src/api/analytics.ts
# Should show all fixed instances

# 6. Commit
git add src/api/analytics.ts
git commit -m "fix(security): Patch SQL injection in analytics endpoints"
```

---

### 3️⃣ Fix XSS em dashboard.html (1 hora) — P0

**Criticidade**: CVSS 8.2 — Session hijacking, data theft

**Arquivo**: `public/dashboard.html` linhas 536-539, 564-567

**Padrão vulnerável**:
```javascript
// ANTES
notif.innerHTML = `${message} <div class="time">${notification.time}</div>`;
```

**Solução**:
```javascript
// DEPOIS
const notif = document.createElement('div');
notif.className = `notification ${type}`;

const msgEl = document.createElement('span');
msgEl.textContent = message;  // textContent is safe — no HTML parsing
notif.appendChild(msgEl);

const timeEl = document.createElement('div');
timeEl.className = 'time';
timeEl.textContent = notification.time;
notif.appendChild(timeEl);

container.appendChild(notif);
```

**Todas as ocorrências**:

```javascript
// Line 536-539 (published notification)
// BEFORE:
notif.innerHTML = `<span class="success">✅ Published!</span> <div class="time">${notification.time}</div>`;

// AFTER:
const notif = document.createElement('div');
notif.className = 'notification success';
const msg = document.createElement('span');
msg.textContent = '✅ Published!';
notif.appendChild(msg);
const time = document.createElement('div');
time.className = 'time';
time.textContent = notification.time;
notif.appendChild(time);

// Line 564-567 (reprioritized notification)
// Same pattern

// Line 493 (any other innerHTML)
// Same pattern
```

**Checklist**:
```bash
# 1. Find all innerHTML usages
grep -n "\.innerHTML" public/dashboard.html

# 2. Replace each with DOM API pattern
# ... edit public/dashboard.html

# 3. Verify no innerHTML remains
grep -n "\.innerHTML" public/dashboard.html
# Should return: (no output)

# 4. Test manually
npm run dev
# Open dashboard in browser
# Send test WebSocket message with <img src=x onerror='alert(1)'>
# Alert should NOT fire

# 5. Commit
git add public/dashboard.html
git commit -m "fix(security): Patch XSS vulnerability in dashboard notifications"
```

---

### 4️⃣ Fix Command Injection em video-processor.ts (1.5 horas) — P0

**Criticidade**: CVSS 9.8 — Remote Code Execution

**Arquivo**: `src/media/video-processor.ts` linhas 34, 85, 129

**Padrão vulnerável**:
```typescript
// ANTES
const command = `ffmpeg -i "${videoPath}" -ss ${timeSeconds} -f image2 -vframes 1 "${framePath}"`;
const output = await execAsync(command);
```

**Solução**:
```typescript
// DEPOIS
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Line 34 (in extractFrame)
const { stdout } = await execFileAsync('ffmpeg', [
  '-i', videoPath,
  '-ss', timeSeconds.toString(),
  '-f', 'image2',
  '-vframes', '1',
  framePath
]);

// Line 85 (in getVideoDuration)
const { stdout: durationStdout } = await execFileAsync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1:noinvalidate=1',
  videoPath
]);

// Line 129 (any other exec usage)
// Same pattern
```

**Checklist**:
```bash
# 1. Add imports
# import { execFile } from 'child_process';
# import { promisify } from 'util';

# 2. Replace exec with execFile for all commands
# ... edit src/media/video-processor.ts

# 3. Test syntax
npx tsc --noEmit

# 4. Verify no exec/execAsync remains
grep -n "execAsync\|exec(" src/media/video-processor.ts
# Should return: (no output)

grep -n "execFile" src/media/video-processor.ts
# Should show all fixed instances

# 5. Test functionality
npm test  # If tests exist for video processing

# 6. Commit
git add src/media/video-processor.ts
git commit -m "fix(security): Patch command injection in video processing"
```

---

### 5️⃣ Fix CORS Misconfiguration (30 min) — P0

**Criticidade**: CVSS 7.5 — CSRF attacks

**Arquivo**: `src/server.ts` line 12

**Padrão vulnerável**:
```typescript
// ANTES
app.use('*', cors());  // Allow ALL origins with credentials
```

**Solução**:
```typescript
// DEPOIS
app.use('*', cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'https://piranot.com.br',
    'https://editor.piranot.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400  // 24 hours
}));
```

**Configurar em .env.social.example**:
```env
ALLOWED_ORIGINS=https://piranot.com.br,https://editor.piranot.com.br,http://localhost:3000
```

**Checklist**:
```bash
# 1. Update src/server.ts
# ... edit file

# 2. Update .env examples
# ... edit .env.social.example

# 3. Test syntax
npx tsc --noEmit

# 4. Verify CORS header
npm run dev &
curl -H "Origin: http://evil.com" -v http://localhost:3000/health
# Should NOT have Access-Control-Allow-Origin header

curl -H "Origin: https://piranot.com.br" -v http://localhost:3000/health
# Should have Access-Control-Allow-Origin: https://piranot.com.br

# 5. Commit
git add src/server.ts .env.social.example
git commit -m "fix(security): Configure CORS with explicit allowed origins"
```

---

### 6️⃣ Generate Strong API_TOKEN (30 min) — P0

**Criticidade**: CVSS 9.0 — Unauthorized API access

**Arquivo**: `.env.production`

**Padrão vulnerável**:
```env
API_TOKEN=change-this-very-long-secure-token-in-production
```

**Solução**:

```bash
# 1. Generate 64-char random token (32 bytes hex)
API_TOKEN=$(openssl rand -hex 32)
echo "Generated token: $API_TOKEN"

# 2. Store in AWS Secrets Manager / HashiCorp Vault
# DO NOT put in code or .env files in repo

# 3. Update .env.production (without the actual token)
cat > .env.production << 'EOF'
# API Security
API_TOKEN=xxxx  # Loaded from AWS Secrets Manager at runtime
API_RATE_LIMIT=100

# Database
DATABASE_URL=xxxx  # From secrets manager

# Meta API
META_SYSTEM_TOKEN=xxxx  # From secrets manager

# Logging
LOG_LEVEL=info
NODE_ENV=production
EOF

# 4. Create env loader that reads from AWS Secrets Manager
# src/lib/load-secrets.ts
cat > src/lib/load-secrets.ts << 'EOF'
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export async function loadSecrets() {
  const client = new SecretsManagerClient({ region: 'us-east-1' });

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: process.env.NODE_ENV === 'production'
          ? 'prod/social-dispatcher'
          : 'dev/social-dispatcher',
      })
    );

    return JSON.parse(response.SecretString || '{}');
  } catch (error) {
    console.error('Failed to load secrets from AWS Secrets Manager');
    throw error;
  }
}
EOF

# 5. Update config.ts to use secrets loader
# At top of src/config.ts:
# const secrets = await loadSecrets();
# config.API_TOKEN = secrets.API_TOKEN || process.env.API_TOKEN;

# 6. Don't commit actual tokens
git add .gitignore
echo "**/secrets.json" >> .gitignore
echo "src/lib/load-secrets.ts" >> .gitignore  # if hardcoding sensitive data

git commit -m "fix(security): Use AWS Secrets Manager for API tokens"
```

**Checklist**:
```bash
# 1. Generate and store token
openssl rand -hex 32 > /tmp/api_token.txt

# 2. Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name prod/social-dispatcher \
  --secret-string '{"API_TOKEN":"...", "META_SYSTEM_TOKEN":"..."}'

# 3. Verify no plaintext in code
grep -r "change-this-very-long" .
# Should return: (no output)

# 4. Test secrets loader
npm test

# 5. Commit
git add src/config.ts .env.production
git commit -m "fix(security): Load API tokens from AWS Secrets Manager"
```

---

### 7️⃣ Fix npm Audit Vulnerabilities (1 hora) — P0

**Criticidade**: CVSS 5.3 — Development SSRF

**Vulnerabilidades**:
- `esbuild <=0.24.2`: SSRF in development server
- `vitest`: Depends on vulnerable esbuild
- `vite-node`: Depends on vulnerable esbuild

**Solução**:

```bash
# 1. Update package-lock.json
npm audit fix --force

# 2. If npm audit fix doesn't resolve, manual update
npm install --save-dev vitest@latest esbuild@latest

# 3. Re-run audit
npm audit

# 4. Verify no critical vulnerabilities remain
npm audit json | jq '.metadata.vulnerabilities | select(.critical > 0)'
# Should return: (no output)

# 5. Run tests to ensure compatibility
npm test

# 6. Commit
git add package.json package-lock.json
git commit -m "fix(security): Update vulnerable dependencies (esbuild, vitest)"
```

**Checklist**:
```bash
# Before
npm audit --json | jq '.metadata.vulnerabilities.critical'
# Should show: 1 or more

# After
npm audit --json | jq '.metadata.vulnerabilities'
# Should show: { critical: 0, high: 0 }

npm test
# All tests passing
```

---

### 8️⃣ Implement Input Validation (Zod) (4 horas) — P0

**Criticidade**: HIGH — Defense in depth

**Arquivos afetados**:
- `src/api/routes.ts` (POST /dispatch)
- `src/api/queue-admin.ts` (POST /queue/reprioritize, POST /queue/analyze)
- `src/api/analytics.ts` (GET query parameters)

**Solução**:

```typescript
// src/types/validation.ts
import { z } from 'zod';

export const DispatchSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title too long'),
  link: z.string()
    .url('Invalid URL'),
  channels: z.array(
    z.enum(['facebook', 'instagram', 'whatsapp', 'tiktok', 'twitter', 'linkedin'])
  ).min(1, 'At least one channel required'),
  priority: z.number()
    .int('Priority must be integer')
    .min(1, 'Priority minimum 1')
    .max(10, 'Priority maximum 10')
    .optional()
    .default(5),
  category: z.enum([
    'politics', 'economy', 'sports', 'technology', 'entertainment', 'lotteries', 'other'
  ]).optional().default('other'),
  summary: z.string().max(1000).optional().default(''),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  metadata: z.object({
    sourceId: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmSource: z.string().optional(),
  }).optional(),
});

export type DispatchPayload = z.infer<typeof DispatchSchema>;

export const ReprioritizeSchema = z.object({
  postId: z.string().uuid('Invalid UUID'),
  newPosition: z.number().int().min(0),
  reason: z.string().min(1).max(500),
});

export const AnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(7),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});
```

**Atualizar routes**:

```typescript
// src/api/routes.ts
import { DispatchSchema, type DispatchPayload } from '../types/validation';

apiRoutes.post('/dispatch', async (c) => {
  try {
    const body = await c.req.json();

    // Validate with Zod — throws ZodError if invalid
    const payload: DispatchPayload = DispatchSchema.parse(body);

    // Rest of logic uses validated payload
    const results = await dispatcher.dispatch(payload);
    return c.json({ success: true, data: results }, 202);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({
        error: 'Validation failed',
        details: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      }, 400);
    }
    logger.error({ error: err.message }, 'Dispatch error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

**Checklist**:
```bash
# 1. Create validation schemas
# ... create src/types/validation.ts

# 2. Update all routes
# ... edit src/api/routes.ts
# ... edit src/api/queue-admin.ts
# ... edit src/api/analytics.ts

# 3. Test validation
npm test

# 4. Manual test with invalid input
curl -X POST http://localhost:3000/dispatch \
  -H "Content-Type: application/json" \
  -d '{"title": "", "link": "not-a-url"}'
# Should return 400 with error details

# 5. Test with valid input
curl -X POST http://localhost:3000/dispatch \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "link": "https://example.com", "channels": ["facebook"]}'
# Should return 202

# 6. Commit
git add src/types/validation.ts src/api/routes.ts src/api/queue-admin.ts src/api/analytics.ts
git commit -m "fix(security): Add Zod validation schemas to all API endpoints"
```

---

### 9️⃣ Add Auth Middleware (2 horas) — P0

**Criticidade**: HIGH — Prevent unauthorized admin access

**Arquivo**: `src/api/queue-admin.ts`

**Implementação**:

```typescript
// src/api/middleware/auth.ts
import { Hono } from 'hono';
import { logger } from '../lib/logger';

export function createAuthMiddleware(requiredRole?: 'admin' | 'editor') {
  return async (c, next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    // Validate token against config.API_TOKEN
    const validToken = process.env.API_TOKEN || 'dev-token-change-in-production';
    if (token !== validToken) {
      logger.warn({ token: token.substring(0, 10) }, 'Invalid API token');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Optional: Check role
    if (requiredRole) {
      const userRole = c.req.header('X-User-Role') || 'editor';
      if (userRole !== requiredRole) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    await next();
  };
}
```

**Aplicar ao queue-admin.ts**:

```typescript
// src/api/queue-admin.ts
import { createAuthMiddleware } from '../api/middleware/auth';

const authMiddleware = createAuthMiddleware('admin');

// Protect all admin routes
queueAdminRouter.use('/queue/*', authMiddleware);

queueAdminRouter.post('/queue/reprioritize', async (c) => {
  // Now protected — requires valid token
  // ...
});

queueAdminRouter.get('/queue', async (c) => {
  // Now protected
  // ...
});
```

**Checklist**:
```bash
# 1. Create auth middleware
# ... create src/api/middleware/auth.ts

# 2. Update queue-admin.ts
# ... edit src/api/queue-admin.ts

# 3. Test without token
curl http://localhost:3000/queue/reprioritize
# Should return 401

# 4. Test with valid token
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:3000/queue/reprioritize
# Should work (or return 400 for missing body, but not 401)

# 5. Test with invalid token
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:3000/queue/reprioritize
# Should return 401

# 6. Commit
git add src/api/middleware/auth.ts src/api/queue-admin.ts
git commit -m "fix(security): Add authentication middleware to admin endpoints"
```

---

### 🔟 Memory Leak Cleanup (2 horas) — P0

**Criticidade**: MEDIUM — Production stability

**Arquivo**: `src/dashboard/realtime-server.ts`

**Problemas**:
1. `setInterval` sem cleanup no stop()
2. WebSocket clients sem timeout de inatividade
3. Event listeners não removidos

**Solução**:

```typescript
// src/dashboard/realtime-server.ts
export class RealtimeServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { lastActivity: number }> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private static readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000;  // 5 minutes

  start(port: number = 3001): void {
    try {
      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws: WebSocket) => {
        logger.info({}, '📡 Dashboard: novo cliente conectado');
        this.clients.set(ws, { lastActivity: Date.now() });

        // Send initial state
        this.sendInitialState(ws);

        // Handle messages
        ws.on('message', (data: any) => {
          try {
            const message = JSON.parse(data.toString());
            // Update activity timestamp
            const clientData = this.clients.get(ws);
            if (clientData) {
              clientData.lastActivity = Date.now();
            }
            this.handleClientMessage(ws, message);
          } catch (err: any) {
            logger.warn({ error: err.message }, 'Erro ao parsear mensagem do cliente');
          }
        });

        // Handle disconnect
        ws.on('close', () => {
          logger.info({}, '📡 Dashboard: cliente desconectado');
          this.clients.delete(ws);
        });

        ws.on('error', (err: any) => {
          logger.error({ error: err.message }, 'WebSocket erro');
          this.clients.delete(ws);
        });
      });

      // Broadcast updates every 5 seconds
      this.updateInterval = setInterval(() => {
        this.broadcastQueueUpdates();
      }, 5000);

      // Clean up inactive clients every minute
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        const toDelete: WebSocket[] = [];

        for (const [ws, data] of this.clients) {
          if (now - data.lastActivity > RealtimeServer.INACTIVITY_TIMEOUT) {
            logger.info({ inactiveFor: now - data.lastActivity }, 'Closing inactive WebSocket');
            ws.close(1000, 'Inactivity timeout');
            toDelete.push(ws);
          }
        }

        toDelete.forEach(ws => this.clients.delete(ws));
      }, 60000);

      logger.info({ port }, '✅ Dashboard WebSocket server iniciado');
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao iniciar WebSocket server');
      throw err;
    }
  }

  stop(): void {
    logger.info({}, '🛑 Stopping WebSocket server...');

    // Clear intervals
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all client connections
    for (const [ws] of this.clients) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Error closing client connection');
      }
    }

    this.clients.clear();

    // Close server
    if (this.wss) {
      this.wss.close(() => {
        logger.info({}, '✅ Dashboard WebSocket server stopped');
      });
      this.wss = null;
    }
  }

  async gracefulShutdown(): Promise<void> {
    logger.info({}, '🔄 Graceful shutdown initiated');

    // Notify all clients before closing
    for (const [ws] of this.clients) {
      try {
        ws.send(JSON.stringify({
          type: 'server_shutdown',
          message: 'Server is shutting down. Please reconnect shortly.',
          timestamp: new Date().toISOString(),
        }));
      } catch (err: any) {
        // Client might already be closed
      }
    }

    // Wait a bit for messages to be sent
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Then stop
    this.stop();
  }
}

// In main.ts / server.ts
process.on('SIGTERM', async () => {
  logger.info({}, '📢 SIGTERM received, graceful shutdown...');
  await realtimeServer.gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({}, '📢 SIGINT received, graceful shutdown...');
  await realtimeServer.gracefulShutdown();
  process.exit(0);
});
```

**Checklist**:
```bash
# 1. Update realtime-server.ts
# ... edit src/dashboard/realtime-server.ts

# 2. Add signal handlers to main.ts/server.ts
# ... edit src/server.ts or src/main.ts

# 3. Test syntax
npx tsc --noEmit

# 4. Test with monitoring
# Start server with monitoring
npm run dev &
PID=$!

# Open multiple WebSocket connections
# Let them idle > 5 min
# Verify they're closed in logs

# Kill with SIGTERM
kill -TERM $PID
# Verify graceful shutdown in logs

# 5. Commit
git add src/dashboard/realtime-server.ts src/server.ts
git commit -m "fix(stability): Add inactivity timeout and graceful shutdown to WebSocket server"
```

---

## Pré-requisitos para P0 Completo

```bash
# 1. Ensure clean git working directory
git status  # Should be clean

# 2. Create feature branch
git checkout -b fix/p0-security-patch

# 3. Make all P0 changes (in order)
# ... follow each section above

# 4. Final validation
npx tsc --noEmit          # TypeScript compiles
npm test                  # Tests pass
npm audit                 # No critical vulnerabilities
grep -r "EAF5iTm3IC9UBR" .  # No hardcoded secrets
grep -n "\.innerHTML" public/  # No XSS patterns
grep -n "INTERVAL '\${" src/api/  # No SQL injection

# 5. Create detailed PR
git push origin fix/p0-security-patch
# Open PR with checklist:
# - [ ] All P0 items implemented
# - [ ] TypeScript strict mode passes
# - [ ] npm audit: 0 critical
# - [ ] Tests passing (60%+ coverage for P0 items)
# - [ ] Code review approved
# - [ ] Security review approved
```

---

## Success Criteria

After P0 completion:

| Metric | Before | After | ✅ |
|--------|--------|-------|-----|
| Security Score | 2/10 | 6.5/10 | ✅ |
| Critical Vulns | 6 | 0 | ✅ |
| High Vulns | 4 | 1 | ✅ |
| CVSS Max | 10.0 | 6.5 | ✅ |
| npm Audit | 5 vulns | 0 | ✅ |
| Test Coverage | <5% | 20%+ | ✅ |
| Overall Score | 4.5/10 | 5.5/10 | ✅ |

---

## Timeline

- **P0 Start**: 2026-04-02
- **Estimated Completion**: 2026-04-07 (5 business days)
- **P0 Verification**: 2026-04-08
- **Deploy v1.1 Security Patch**: 2026-04-08

---

**Próxima Fase**: Após P0 aprovação, prosseguir com P1 (Error Handling, Type Safety, Logging — 20 horas)
