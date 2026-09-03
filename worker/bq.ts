import type { Env } from "./env";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa: ServiceAccount = JSON.parse(env.GCP_SA_KEY);
  const scope = "https://www.googleapis.com/auth/bigquery.readonly";
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`GCP token error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

export interface BqQueryParam {
  name: string;
  type: "STRING" | "INT64" | "DATE";
  value: string;
}

export async function runQuery<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  params: BqQueryParam[] = [],
): Promise<T[]> {
  const token = await getAccessToken(env);
  const body = {
    query: sql,
    useLegacySql: false,
    timeoutMs: 55_000,
    maxResults: 50_000,
    parameterMode: params.length ? "NAMED" : undefined,
    queryParameters: params.length
      ? params.map((p) => ({
          name: p.name,
          parameterType: { type: p.type },
          parameterValue: { value: p.value },
        }))
      : undefined,
  };

  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${env.GCP_PROJECT_ID}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`BigQuery error ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }
  if (!json.jobComplete) {
    throw new Error("BigQuery job did not complete within timeout");
  }
  const fields: { name: string }[] = json.schema?.fields ?? [];
  const rows: { f: { v: unknown }[] }[] = json.rows ?? [];
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    r.f.forEach((cell, i) => {
      obj[fields[i].name] = cell.v;
    });
    return obj as T;
  });
}

/** Nome totalmente qualificado de uma tabela do transfer (particionada). */
export function tbl(env: Env, name: string): string {
  return `\`${env.GCP_PROJECT_ID}.${env.BQ_DATASET}.${name}_${env.BQ_MCC_SUFFIX}\``;
}
