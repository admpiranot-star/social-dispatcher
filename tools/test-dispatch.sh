#!/bin/bash

# Social Dispatcher API Test
# Testa POST /api/dispatch sem precisar de banco

API_TOKEN="change-this-in-production"
BASE_URL="http://localhost:3302"

echo "🚀 Social Dispatcher API Test"
echo "=============================="

# POST /api/dispatch
curl -X POST "$BASE_URL/api/dispatch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{
    "id": "post-001",
    "title": "Teste de Distribuição Social",
    "link": "https://piranot.com.br/teste",
    "imageUrl": "https://piranot.com.br/images/test.jpg",
    "summary": "Resumo do artigo de teste para distribuição em redes sociais",
    "category": "technology",
    "priority": 5,
    "channels": ["facebook"],
    "metadata": {
      "sourceId": "123456789",
      "utmCampaign": "social-dispatcher-test",
      "utmSource": "internal"
    }
  }'

echo -e "\n\n✅ Teste concluído"
echo "Verifique os logs do servidor em outro terminal: npm run dev"
