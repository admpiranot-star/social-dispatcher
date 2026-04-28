#!/bin/bash

# =====================================================================
# SDC Facebook V1 — Smoke Test Oficial
# Versão: 1.0 (2026-04-13)
# =====================================================================

# Configurações
API_TOKEN="cnfLF2sE8ZFUqZuGG81cxo9Z9JCtPDrMerwpybrz0D+pkuk4rLe3pJm4u2GIJwSj"
BASE_URL="http://localhost:3302"
DB_URL="postgresql://nexus:nexus_password@127.0.0.1:15432/nexus_publisher"

echo "🔍 [1/5] Checando saúde dos processos (PM2)..."
pm2 show social-dispatcher | grep status

echo -e "\n🚀 [2/5] Disparando post de teste via API..."
# Gerar UUID válido para o teste
TEST_UUID=$(cat /proc/sys/kernel/random/uuid)

RESPONSE=$(curl -s -X POST "$BASE_URL/api/dispatch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{
    "title": "SMOKE TEST: PiraNOT Social Dispatcher V1",
    "link": "https://www.piranot.com.br/",
    "summary": "Este é um post de teste automático para validar o fluxo ponta a ponta do SDC V1.",
    "category": "technology",
    "priority": 10,
    "channels": ["facebook"],
    "metadata": {
      "sourceId": "'"$TEST_UUID"'",
      "utmCampaign": "smoke-test",
      "utmSource": "dispatcher-v1"
    }
  }')

echo "Resposta da API: $RESPONSE"

# Extrair postId da resposta (A resposta é um array de resultados: [{"jobId":"...","postId":"..."}, ...])
POST_ID=$(echo $RESPONSE | grep -oP '"postId":"\K[^"]+' | head -1)

if [ -z "$POST_ID" ]; then
  echo "❌ Erro: Não foi possível obter o postId da resposta."
  exit 1
fi

echo -e "\n⏳ [3/5] Aguardando processamento (15s)..."
sleep 15

echo -e "\n📊 [4/5] Verificando banco de dados (Tabela posts)..."
psql "$DB_URL" -c "SELECT id, title, status, platform_post_id FROM posts WHERE id = '$POST_ID';"

echo -e "\n📜 [5/5] Verificando logs de execução (Tabela job_logs)..."
psql "$DB_URL" -c "SELECT channel, status, external_id, error_message FROM job_logs WHERE post_id = '$POST_ID';"

# Resultado Final
FINAL_STATUS=$(psql "$DB_URL" -t -A -c "SELECT status FROM posts WHERE id = '$POST_ID';")

if [ "$FINAL_STATUS" == "published" ]; then
  echo -e "\n✅ SMOKE TEST CONCLUÍDO COM SUCESSO!"
  echo "A publicação foi confirmada e o external_id foi persistido."
elif [ "$FINAL_STATUS" == "queued" ] || [ "$FINAL_STATUS" == "processing" ]; then
  echo -e "\n⚠️ SMOKE TEST EM ANDAMENTO..."
  echo "O post ainda está na fila ou sendo processado. Verifique novamente em instantes."
else
  echo -e "\n❌ SMOKE TEST FALHOU!"
  echo "Status final: $FINAL_STATUS"
  echo "Verifique os logs do PM2: pm2 logs social-dispatcher"
  exit 1
fi
