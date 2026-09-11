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

put_secret() {
  local name="$1" value="${2:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value" | npx wrangler secret put "$name"
  fi
}

put_secret CF_ACCESS_TEAM_DOMAIN "${CF_ACCESS_TEAM_DOMAIN:-}"
put_secret CF_ACCESS_AUD "${CF_ACCESS_AUD:-}"
