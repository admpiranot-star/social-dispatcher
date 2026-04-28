# 🎨 Seus Designs Canva Integrados!

## ✨ Designs Salvos

**Feed Instagram (1080x1350px)**
- Design ID: `DAGfeh4a0QE`
- Link: https://www.canva.com/design/DAGfeh4a0QE/Hj4aQ0IVZT7COOCCvdlOmA/edit

**Stories (1080x1920px)**
- Design ID: `DAFbivDtN2Y`
- Link: https://www.canva.com/design/DAFbivDtN2Y/qLT657x6U6tUy_rwlinM-A/edit

---

## 🎯 Como Usar Seus Designs

### Opção 1: Exportar Manual do Canva (MELHOR)

1. Abra um dos links acima
2. **Para cada categoria**, mude a cor do fundo:
   - **Technology** → Roxo (#4b0082)
   - **Politics** → Azul (#1a3a52)
   - **Sports** → Vermelho (#8b0000)
   - **Economy** → Verde (#2d5016)
   - **Entertainment** → Magenta (#c71585)
   - **Lotteries** → Ouro (#ffd700)

3. **Clique em "Download"** (canto superior direito)
4. Escolha **PNG** ou **JPG**
5. Nomeie como: `category-feed-1080x1350.png`
6. **Hospede em seu servidor** (ou CDN)

### Opção 2: Usar URLs Diretas do Canva

Sistema Social Dispatcher consegue usar links Canva direto:

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech News",
    "link": "https://piranot.com.br/tech",
    "category": "technology",
    "channels": ["instagram"],
    "imageUrl": "https://www.canva.com/design/DAGfeh4a0QE/view?utm_content=DAGfeh4a0QE"
  }'
```

---

## 📋 Mapeamento de Cores por Categoria

| Categoria | Cor | Hex | RGB |
|-----------|-----|-----|-----|
| **Technology** | Roxo | #4b0082 | 75,0,130 |
| **Politics** | Azul Escuro | #1a3a52 | 26,58,82 |
| **Sports** | Vermelho | #8b0000 | 139,0,0 |
| **Economy** | Verde | #2d5016 | 45,80,22 |
| **Entertainment** | Magenta | #c71585 | 199,21,133 |
| **Lotteries** | Ouro | #ffd700 | 255,215,0 |
| **Other** | Cinza | #333333 | 51,51,51 |

---

## 🚀 Workflow Completo

### Primeira Vez (Setup):

1. ✅ Crie variações de cor dos seus 2 designs
2. ✅ Exporte 7 versões (uma por categoria)
3. ✅ Hospede em: `https://piranot.com.br/artes/`
4. ✅ Nomeie como: `category-feed-1080x1350.jpg`

### Diariamente:

```bash
# Post com sua arte
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Notícia Importante",
    "link": "https://piranot.com.br/noticia",
    "category": "technology",
    "channels": ["instagram"],
    "imageUrl": "https://piranot.com.br/artes/technology-feed-1080x1350.jpg"
  }'
```

---

## 💡 Dicas Pro

### Reusar Design Base

Como sua cor muda por tema, você pode:
1. Usar APENAS 1 design base
2. Clonar para cada categoria no Canva
3. Mudar só a cor do fundo
4. Exportar todas

**Atalho no Canva**: Design → Clonar → Mudar cor → Download

### Automação (Futuro)

Se quiser automação total:
1. Use API Canva (premium)
2. Sistema detecta categoria
3. Gera arte automaticamente com cor certa
4. Exporta e publica

Mas por enquanto, versão manual é 100% viável!

### Watermark

Adicione watermark "piranot.com.br" em seus designs Canva:
1. Abra design
2. Adicione texto "piranot.com.br" no canto
3. Coloque em branco/cinza com opacidade baixa
4. Exporte

---

## 📊 Exemplo de Post (Technology)

```bash
curl -X POST http://localhost:3302/api/dispatch \
  -H "Authorization: Bearer dev-token-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "IA Revoluciona Medicina com Novo Algoritmo",
    "link": "https://piranot.com.br/tech-ia-medicina",
    "summary": "Pesquisadores desenvolvem IA que diagnostica doenças com 99% de precisão...",
    "category": "technology",
    "priority": 10,
    "channels": ["instagram"],
    "imageUrl": "https://piranot.com.br/artes/technology-feed-1080x1350.jpg",
    "metadata": {
      "sourceId": "art_001",
      "utmCampaign": "tech-breakthrough"
    }
  }'
```

**Resultado**: Post Instagram com fundo roxo (technology) e sua arte!

---

## ✅ Próximos Passos

1. Abra seus designs Canva acima
2. Clone para cada categoria (7 no total)
3. Mude a cor do fundo conforme tabela
4. Exporte todos como PNG
5. Hospede em: `piranot.com.br/artes/`
6. Use URLs nos POSTs

---

**Seus designs estão integrados! Agora é só personalizar a cor!** 🎨
