# otmd.app: desktop login broker

Implemented in the website repo, branch `feat/osu-oauth-broker`, logic in `lib/osuOAuthBroker.js`.

## Why

The oTMD desktop app (v3, Tauri) uses osu! API v2 OAuth with a single account. The osu! docs show `client_secret` in both code exchange and token refresh and document no PKCE or public-client option. A desktop binary can't keep a secret, so otmd.app holds it. osu! only ever sees the HTTPS callback on otmd.app, and the site hands the result to the app on loopback.

The broker is **stateless**: it stores no tokens and has no accounts or sessions. Each desktop login gets its own token pair, separate from the website's NextAuth session. It is unrelated to the `ExportMatches` website API key.

## Flow

```
Desktop app                         otmd.app                         osu.ppy.sh
  | browser: GET /api/auth/desktop/login?state&code_challenge          |
  |--------------------------------->|-- /oauth/authorize ------------>|
  |                                  |<-- /api/auth/desktop/callback --|
  |<-- 127.0.0.1:21086/oauth/callback?state&code&code_binding          |
  |  (app validates state)                                             |
  |-- POST /api/osu/oauth/token {code, code_binding, code_verifier} -->|
  |                                  |-- code + client_secret -------->|
  |<----------------- tokens --------|                                 |
  |
  | every refresh, unattended, possibly while the user is streaming:
  |-- POST /api/osu/oauth/refresh {refresh_token} --->|-- token + secret -->|
  |<----------------- new tokens ---------------------|
```

The desktop app calls osu! directly with the access token for all data. The broker never sees match traffic.

Browser routes live under `/api/auth/` on purpose: next-pwa's service worker caches every other GET `/api/*` URL for 24 h, which would store the code.

## Setup

1. In the website's existing osu! OAuth application, **add** `https://otmd.app/api/auth/desktop/callback` to Application Callback URLs, comma-separated. Keep the NextAuth callback `https://otmd.app/api/auth/callback/osu`.
2. The broker reuses the site's `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET`. Never commit them or send the secret to any client.
3. The desktop app needs only the site base URL. It never holds the client ID or secret.

## Desktop side

`state` and the PKCE verifier are 32 random bytes each, base64url without padding (43 chars). `code_challenge` is the base64url SHA-256 of the verifier, S256 only. The callback carries `state` and either `code` + `code_binding`, or `error` (`access_denied` or `server_error`). Reject a mismatched `state` before anything else.

## Endpoints

JSON body, HTTPS only, no cookies, no CORS. `Content-Type: application/json` is required.

- `POST /api/osu/oauth/token`: `{ "code", "code_binding", "code_verifier" }`
- `POST /api/osu/oauth/refresh`: `{ "refresh_token" }`

Success, both, 200: `{ "access_token", "refresh_token", "expires_in", "token_type" }`. Don't assume `expires_in` is 86400.

### Errors: the desktop app depends on this distinction

| Situation | Status | Body | Desktop app does |
|---|---|---|---|
| osu! rejects the code or refresh token | 400 | `{ "error": "invalid_grant" }` | Asks the user to log in again |
| Malformed body, wrong binding or verifier | 400 | `{ "error": "invalid_request" }` | Treats as a bug, keeps tokens |
| Broker rate limit hit | 429 | `{ "error": "rate_limited" }`, `Retry-After` | Retries later, keeps tokens |
| osu! 5xx, timeout, network failure, or bad client credentials | 502 | `{ "error": "upstream_unavailable" }` | Retries with backoff, keeps tokens |

Upstream mapping, from osu-web's `league/oauth2-server` 9.4.1 source: a bad refresh token is 400 `invalid_grant`; a garbage or foreign code is 400 `invalid_request`, so `/token` maps it to `invalid_grant`; expired or revoked codes are 400 `invalid_grant`; bad client credentials are 401 `invalid_client`, mapped to 502. On `/refresh`, only upstream 400 `invalid_grant` ends a session.

## Security notes

- **Resetting the secret disables all access tokens issued for the application**, logging out every website and desktop user, and invalidates in-flight code bindings. Treat a reset as an incident action.
- Rate limiting is per serverless instance. Add a WAF rule if the routes get abused.

## Done when

- [ ] Desktop callback added to the existing OAuth application
- [ ] Branch deployed
- [ ] A real login reaches the app and the returned refresh token works through `/refresh`
- [ ] A garbage refresh token returns 400 `invalid_grant`
