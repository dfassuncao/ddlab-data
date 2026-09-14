#!/usr/bin/env bash
# Deploy do Worker + reaplicação dos secrets do Cloudflare Access.
#
# Por que isso existe: o Workers Builds roda cada deploy numa máquina limpa,
# sem o estado de secrets adicionados manualmente pelo dashboard (Settings ->
# Runtime -> Variables and Secrets). Isso já causou CF_ACCESS_TEAM_DOMAIN e
# CF_ACCESS_AUD sumirem depois de deploys automáticos, derrubando a proteção
# de login (worker/auth.ts falha fechado nesse caso -- ver nota de segurança
# no README). Reaplicar os dois a cada deploy, lidos de variável de ambiente,
# resolve isso de vez -- desde que essas variáveis existam no ambiente que
# roda este script (ver DEPLOY.md, seção "Deploy automático no push").
#
# Local: se as env vars não estiverem exportadas, os secrets simplesmente não
# são tocados (mantém o valor que já está configurado no Worker).
set -euo pipefail

npx wrangler deploy

# `wrangler secret put` logo após `wrangler deploy` às vezes esbarra numa race
# condition da API do Cloudflare: a versão recém-deployada ainda não é
# reconhecida como "a atual" por um instante ("latest version of your Worker
# isn't currently deployed"). Tenta de novo algumas vezes com um pequeno
# delay antes de desistir.
put_secret() {
  local name="$1" value="${2:-}"
  if [ -z "$value" ]; then return 0; fi
  for attempt in 1 2 3 4; do
    if printf '%s' "$value" | npx wrangler secret put "$name"; then
      return 0
    fi
    echo "put_secret $name: tentativa $attempt falhou, tentando de novo em 5s..." >&2
    sleep 5
  done
  echo "put_secret $name: falhou após 4 tentativas." >&2
  return 1
}

put_secret CF_ACCESS_TEAM_DOMAIN "${CF_ACCESS_TEAM_DOMAIN:-}"
put_secret CF_ACCESS_AUD "${CF_ACCESS_AUD:-}"
