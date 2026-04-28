# Artes Instagram - Versão Simples (Só Links!)

## ✨ Forma Mais Fácil: Passe o Link da Arte

**Você NÃO precisa de Canva API!** Basta passar o URL da imagem.

---

## 🚀 Opção 1: Com Imagem (RECOMENDADO)

Envie a URL da arte:

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Grande Notícia de Tech",
    "link": "https://piranot.com.br/noticia",
    "summary": "Resumo da notícia",
    "category": "technology",
    "channels": ["instagram"],
    "imageUrl": "https://piranot.com.br/artes/tech-1080x1350.jpg",
    "metadata": {"utmCampaign": "tech-news"}
  }'
```

✅ **Resultado**: Post Instagram com arte que você escolheu!

---

## 🎨 Opção 2: Sem Imagem (Usa Template Automático)

Se não enviar `imageUrl`, Sistema usa template por categoria:

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Grande Notícia de Tech",
    "link": "https://piranot.com.br/noticia",
    "summary": "Resumo da notícia",
    "category": "technology",
    "channels": ["instagram"],
    "metadata": {"utmCampaign": "tech-news"}
  }'
```

✅ **Resultado**: Post Instagram com template padrão de Technology

---

## 📋 Templates Disponíveis (Por Categoria)

Se você não enviar `imageUrl`, o sistema usa:

```
politics       → https://piranot.com.br/templates/politics-1080x1350.jpg
economy        → https://piranot.com.br/templates/economy-1080x1350.jpg
sports         → https://piranot.com.br/templates/sports-1080x1350.jpg
technology     → https://piranot.com.br/templates/technology-1080x1350.jpg
entertainment  → https://piranot.com.br/templates/entertainment-1080x1350.jpg
lotteries      → https://piranot.com.br/templates/lotteries-1080x1350.jpg
other          → https://piranot.com.br/templates/default-1080x1350.jpg
```

---

## 🎯 Como Usar (3 passos)

### 1. Crie suas artes no Canva

1. Ir em https://www.canva.com/
2. Criar designs 1080x1350px (tamanho Instagram)
3. Baixar como PNG/JPG
4. Upload em seu servidor (ou CDN)

**Exemplo**: `https://piranot.com.br/artes/tech-design.jpg`

### 2. Envie o POST com o URL

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Notícia Importante",
    "link": "https://piranot.com.br/noticia",
    "summary": "Resumo",
    "category": "technology",
    "channels": ["instagram"],
    "imageUrl": "https://seu-servidor.com/artes/sua-arte.jpg",
    "metadata": {"utmCampaign": "campaign"}
  }'
```

### 3. Pronto! 

Post será publicado no Instagram com sua arte automático!

---

## 💡 Dicas

### Artes Recomendadas

Para melhor resultado no Instagram:
- **Dimensões**: 1080x1350px (Feed)
- **Formato**: PNG ou JPG
- **Tamanho arquivo**: < 10MB
- **Design**: Simples + legível em mobile

### Personalize os Templates

Para mudar os templates padrão, edite `canva-generator-simple.ts`:

```typescript
private templates: Record<string, string> = {
  politics: 'https://seu-servidor.com/templates/politics.jpg',  // ← Seu template
  economy: 'https://seu-servidor.com/templates/economy.jpg',
  // ... etc
};
```

### Adicione Templates em Runtime

Se quiser adicionar templates dinamicamente:

```typescript
import { artGenerator } from '../services/canva-generator-simple';

// Em algum lugar do seu código:
artGenerator.addTemplate('sports', 'https://novo-template.jpg');
```

---

## 📊 Fluxo Completo

```
Você cria arte no Canva
       ↓
Download JPG/PNG (1080x1350px)
       ↓
Upload em: https://seu-servidor.com/artes/...jpg
       ↓
Envia POST com imageUrl
       ↓
Social Dispatcher pega URL
       ↓
Publica no Instagram
       ↓
Post ao vivo com sua arte! 🎉
```

---

## ❓ FAQ

**P: E se eu não enviar imageUrl?**
R: Sistema usa template automático baseado em `category`

**P: Preciso de Canva API Key agora?**
R: Não! Versão simplificada não precisa de API.

**P: Posso misturar (às vezes com imagem, às vezes sem)?**
R: Sim! Cada POST pode ter sua URL ou usar template.

**P: Como coloco watermark/logo no Canva?**
R: Edite a arte no Canva antes de baixar. Add logo → Download → Upload.

**P: Quais dimensões usar?**
R: 1080x1350px para Feed, 1080x1920px para Stories.

---

## 🚀 Comece Agora!

```bash
# Crie uma arte no Canva
# Baixe como PNG (1080x1350px)
# Hospede em qualquer servidor
# Use o URL no curl acima!

# Exemplo simples:
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Primeira Notícia",
    "link": "https://piranot.com.br",
    "category": "technology",
    "channels": ["instagram"],
    "imageUrl": "https://example.com/minha-arte.jpg"
  }'
```

✅ **Pronto!** Post Instagram saindo! 📸

---

**Muito mais simples que API Canva!** 🎨
