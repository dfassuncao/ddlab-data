import type { Context, Next } from "hono";
import type { Env } from "./env";

/**
 * Verifica o JWT do Cloudflare Access (header Cf-Access-Jwt-Assertion).
 * A tela de login é 100% gerenciada pelo Access; aqui só validamos, como
 * defesa em profundidade, e extraímos o e-mail para auditoria.
 *
 * Se CF_ACCESS_TEAM_DOMAIN/AUD não estiverem configurados (ambiente local),
 * a verificação é ignorada e o usuário vira "dev@localhost".
 */

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
}

let jwksCache: { keys: Record<string, CryptoKey>; exp: number } | null = null;

function b64urlToUint8(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKeys(teamDomain: string): Promise<Record<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCache.exp > now) return jwksCache.keys;
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const map: Record<string, CryptoKey> = {};
  for (const jwk of keys) {
    map[jwk.kid] = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  jwksCache = { keys: map, exp: now + 3600_000 };
  return map;
}

export interface AccessUser {
  email: string;
  name?: string;
}

export async function verifyAccess(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<AccessUser> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");
  const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(p)));

  const keys = await getKeys(teamDomain);
  const key = keys[header.kid];
  if (!key) throw new Error("unknown kid");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToUint8(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new Error("bad signature");
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error("expired");
  const audMatch = Array.isArray(payload.aud)
    ? payload.aud.includes(aud)
    : payload.aud === aud;
  if (aud && !audMatch) throw new Error("aud mismatch");

  return { email: payload.email ?? "unknown", name: payload.name };
}

export function accessMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: { user: AccessUser } }>, next: Next) => {
    const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } = c.env;
    if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
      c.set("user", { email: "dev@localhost" });
      return next();
    }
    const token =
      c.req.header("Cf-Access-Jwt-Assertion") ||
      c.req.header("cf-access-jwt-assertion") ||
      "";
    if (!token) return c.json({ error: "no Access token" }, 401);
    try {
      const user = await verifyAccess(token, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD);
      c.set("user", user);
      return next();
    } catch (e) {
      return c.json({ error: `Access verification failed: ${(e as Error).message}` }, 401);
    }
  };
}
