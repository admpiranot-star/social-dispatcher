# Canva Integration - Auto-generate Instagram Arts

## 🎨 O que é?

Social Dispatcher integra automaticamente com Canva para **gerar artes Instagram** quando você não envia uma imagem.

**Fluxo**:
1. Você envia um post sem imagem para Instagram
2. Canva Generator gera arte automaticamente (1080x1350px)
3. Arte é postada no Instagram

---

## 🔧 Setup Canva

### 1. Criar Conta Canva Pro

- Ir em https://www.canva.com/
- Criar conta ou login
- Fazer upgrade para **Canva Pro** (necessário para API)

### 2. Gerar Canva API Key

1. Ir em: https://www.canva.com/developers/
2. Criar um novo projeto/aplicação
3. Gerar **API Key** (Bearer token)
4. Copiar e salvar em `.env`

### 3. Configurar Environment

Adicione ao `.env.social`:

```env
# Canva API Configuration
CANVA_API_KEY=pk-1234567890abcdef...
CANVA_BRAND_ID=your_brand_id_optional
```

Ou use variável de env:

```bash
export CANVA_API_KEY="pk-1234567890abcdef..."
```

### 4. Criar Templates no Canva

**Importante**: Canva exige templates pré-criados como base.

Para cada categoria de notícia, crie um template:
1. https://www.canva.com/templates/ (busque "Instagram Post")
2. Customize com cores/branding PiraNOT
3. Salvar como template privado
4. Obter o **Template ID**
5. Adicionar IDs em `canva-generator.ts`

**Exemplo de Templates**:
- `DAB_politics_template_001` - Política (azul escuro)
- `DAB_economy_template_001` - Economia (verde)
- `DAB_sports_template_001` - Esportes (vermelho)
- `DAB_tech_template_001` - Tecnologia (roxo)
- `DAB_entertainment_template_001` - Entretenimento (rosa)
- `DAB_lotteries_template_001` - Loterias (dourado)

---

## 🚀 Como Usar

### Método 1: Com Imagem (Recomendado)

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Grande Descoberta em Tech",
    "link": "https://piranot.com.br/tech-123",
    "channels": ["instagram"],
    "imageUrl": "https://piranot.com.br/images/tech-banner.jpg",
    "metadata": {"utmCampaign": "tech"}
  }'
```

### Método 2: Sem Imagem (Canva Gera)

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Grande Descoberta em Tech",
    "link": "https://piranot.com.br/tech-123",
    "summary": "Cientistas descobrem algo revolucionário...",
    "category": "technology",
    "channels": ["instagram"],
    "metadata": {"utmCampaign": "tech"}
  }'
```

**Output**:
- Canva gera arte 1080x1350px
- Adiciona título + resumo
- Adiciona imagem (se enviada)
- Coloca watermark "piranot.com.br"
- Posta no Instagram automaticamente

---

## 🎭 Customização

### Alterar Dimensões

Em `canva-generator.ts`:

```typescript
const dimensions = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  reel: { width: 1080, height: 1920 },  // Adicionar
};
```

### Alterar Watermark

```typescript
// Linha ~60 em canva-generator.ts
await this.addText(design.designId, {
  text: 'seu-watermark-aqui',  // ← Mudar
  fontSize: 20,
  position: { x: 40, y: dimensions.height - 80 },
  opacity: 0.7,
});
```

### Adicionar Logo PiraNOT

```typescript
// Adicione após addText do watermark
await this.addImage(design.designId, {
  imageUrl: 'https://piranot.com.br/logo.png',
  position: { x: dimensions.width - 100, y: 20 },
  width: 80,
  height: 80,
});
```

### Customizar Cores por Categoria

```typescript
private getColorByCategory(category: string): string {
  const colors: Record<string, string> = {
    politics: '#1a3a52',     // Azul escuro
    economy: '#2d5016',      // Verde
    sports: '#8b0000',       // Vermelho escuro
    technology: '#4b0082',   // Roxo
    entertainment: '#c71585',// Magenta
    lotteries: '#ffd700',    // Ouro
  };
  return colors[category] || '#000000';
}
```

---

## 📊 Monitorar Geração

Ver logs em tempo real:

```bash
# Terminal com servidor rodando (npm run dev)
# Procure por:

# Sucesso:
"Instagram art generated successfully"
"Instagram post published"

# Erro:
"Canva art generation failed"
```

Ou verificar status:

```bash
curl http://localhost:3302/api/status/post-uuid
```

---

## 🔌 API Canva Reference

**Endpoints usados**:
- `POST /designs` - Criar novo design
- `PATCH /designs/{id}` - Adicionar elementos (texto, imagem)
- `POST /designs/{id}/export` - Exportar para PNG/JPG

**Docs**: https://www.canva.com/developers/docs/

---

## ⚙️ Fallback (Se Canva Falhar)

Se Canva não está configurado ou falha:
- Sistema continua funcionando
- Posts Instagram saem sem imagem (só texto)
- Log aviso: `"Canva art generation failed - continuing without image"`

Para ter imagem, envie `imageUrl` no payload.

---

## 🎓 Exemplos Completos

### Política com Imagem

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Novo Decreto Presidencial Assinado",
    "link": "https://piranot.com.br/politica-decreto-001",
    "summary": "Presidente assinou novo decreto impactando setor...",
    "category": "politics",
    "priority": 9,
    "channels": ["instagram"],
    "imageUrl": "https://piranot.com.br/images/decreto.jpg",
    "metadata": {
      "sourceId": "article_001",
      "utmCampaign": "decreto-2026"
    }
  }'
```

### Tecnologia sem Imagem (Canva Gera)

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "IA Revoluciona Medicina com Nova Descoberta",
    "link": "https://piranot.com.br/tech-ai-medicina",
    "summary": "Pesquisadores usando IA descobrem novo tratamento...",
    "category": "technology",
    "priority": 10,
    "channels": ["instagram"],
    "metadata": {
      "sourceId": "article_002",
      "utmCampaign": "tech-breakthrough"
    }
  }'
```

**Resultado**: Canva gera arte automática com:
- Cor violeta (tech)
- Título em grande
- Resumo em menor
- Watermark piranot.com.br

---

## 🐛 Troubleshooting

### "Canva API key not configured"
```bash
# Verificar variável
echo $CANVA_API_KEY

# Se vazio:
export CANVA_API_KEY="pk-..."
```

### "Canva art generation failed"
- Verificar se `CANVA_API_KEY` é válido
- Verificar permissões no Canva App
- Verificar se templates existem no Canva
- Ver logs: `npm run dev` (Terminal 1)

### Arte demora para gerar
- Canva API leva 3-5s para gerar
- Normal para primeira requisição
- Cache em Redis aproveita designs reutilizáveis

---

## 📈 Próximos Passos

1. ✅ Configurar `CANVA_API_KEY`
2. ⏭️ Criar templates no Canva (uma por categoria)
3. ⏭️ Testar com POST sem imageUrl
4. ⏭️ Monitorar logs
5. ⏭️ Customizar templates conforme feedback

---

**Pronto para gerar artes Instagram automaticamente!** 🎨
