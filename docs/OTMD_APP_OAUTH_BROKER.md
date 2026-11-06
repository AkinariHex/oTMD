# otmd.app: osu! OAuth broker handoff

For the session that works on the otmd.app website. That repo was not available when this was written, so its stack, routing and deploy setup are unknown: read them first and adapt the shape below to its conventions.

## Why

The oTMD desktop app (v3, Tauri) is moving from osu! API v1 keys to osu! API v2 OAuth, with a single account. The osu! docs show `client_secret` in both code exchange and token refresh, and document no PKCE or public-client option. A desktop binary can't keep a secret, so otmd.app holds it and adds it to those two calls.

The broker is **stateless**: it stores no tokens and has no user accounts or sessions. It is unrelated to the existing `ExportMatches` website API key, and existing routes (`/api/tournaments/app`, `/api/validate`) don't change.

## Flow

```
Desktop app                     osu.ppy.sh                  otmd.app
  | open browser: /oauth/authorize  |                          |
  |  client_id, redirect_uri,       |                          |
  |  response_type=code,            |                          |
  |  scope="public identify", state |                          |
  |<-- localhost:21086/oauth/callback?code&state               |
  |  (app validates state)                                     |
  |-- POST /api/osu/oauth/token {code, redirect_uri} --------->|
  |                                 |<-- code + client_secret -|
  |<----------------- tokens ----------------------------------|
  |
  | every refresh, unattended, possibly while the user is streaming:
  |-- POST /api/osu/oauth/refresh {refresh_token} ------------>|
  |                                 |<-- token + client_secret-|
  |<----------------- new tokens ------------------------------|
```

The desktop app calls osu! directly with the access token for all data. The broker never sees match traffic.

## Setup

1. Register an OAuth application in osu! account settings, callback URL exactly `http://localhost:21086/oauth/callback`. The docs' examples use localhost but don't explicitly say it's allowed at registration, so confirm this first. If osu! refuses it, stop and rethink the redirect: the desktop design depends on it.
2. Store `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET` as server environment variables. Never commit them or send the secret to any client.
3. The client ID is public and gets compiled into the desktop app.

## Endpoints

Both: `POST`, JSON body, HTTPS only, no auth, no cookies. No CORS headers: the caller is Rust, not a browser.

### `POST /api/osu/oauth/token`

Request: `{ "code": "...", "redirect_uri": "http://localhost:21086/oauth/callback" }`

Reject any other `redirect_uri` with 400. Forward to `POST https://osu.ppy.sh/oauth/token`, form-encoded: `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`.

### `POST /api/osu/oauth/refresh`

Request: `{ "refresh_token": "..." }`

Forward to the same URL: `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`.

### Success response (both): 200

```json
{ "access_token": "...", "refresh_token": "...", "expires_in": 86400, "token_type": "Bearer" }
```

Pass osu!'s values through. `expires_in` varies in principle, so don't hardcode 86400.

### Errors: the desktop app depends on this distinction

| Situation | Status | Body | Desktop app does |
|---|---|---|---|
| osu! rejects the code or refresh token (revoked, expired, reused) | 400 | `{ "error": "invalid_grant" }` | Asks the user to log in again |
| Malformed body, wrong `redirect_uri` | 400 | `{ "error": "invalid_request" }` | Treats as a bug, keeps tokens |
| Broker rate limit hit | 429 | `{ "error": "rate_limited" }`, `Retry-After` | Retries later, keeps tokens |
| osu! 5xx, timeout, network failure, or osu! rejecting our client credentials | 502 | `{ "error": "upstream_unavailable" }` | Retries with backoff, keeps tokens |

**Never return `invalid_grant` for a temporary or server-side failure.** That would log a streamer out mid-match. If it's ambiguous, return 502. Check what osu! actually returns for a bad token and for bad client credentials before writing the mapping, since the docs don't list error bodies here.

## Security requirements

- Never log request bodies, response bodies, tokens or codes. Check framework and proxy logging too, not just application code.
- Don't store tokens anywhere: no database, no cache.
- Hardcode `grant_type` per endpoint; never accept it from the caller.
- Set a small body limit (about 8 KB) and a 10 s upstream timeout.
- Rate limit per IP, generous enough for tournament LANs sharing one IP (start around 30 requests per minute).
- Don't use the secret for anything else.
- **Resetting the secret disables all access tokens issued for the application**, logging out every user. Treat a reset as an incident action.

## Availability

The desktop app refreshes well before expiry, so it survives a broker outage of up to about 12 hours without interrupting a stream. Beyond that, polling stops until the broker returns. Use whatever uptime monitoring the site already has. No new infrastructure is needed.

## Facts to re-check

From https://osu.ppy.sh/docs/index.html, read 2026-11-06:

- Refresh tokens rotate: each refresh returns a new one. Refresh token lifetime is not documented.
- The docs ask for no more than 60 requests per minute. Broker traffic is tiny, about one refresh per user per 12 hours.
- PKCE is not documented. If osu! adds a public-client option, this broker can be retired.

## Done when

- [ ] OAuth application registered with the localhost callback
- [ ] A real code exchanges through `/token`, and the returned refresh token works through `/refresh`
- [ ] A garbage refresh token returns 400 `invalid_grant`
- [ ] With osu! unreachable (simulated) or a wrong client secret, the endpoint returns 502, not `invalid_grant`
- [ ] A wrong `redirect_uri` returns 400 and never reaches osu!
- [ ] Logs from a full run contain no tokens or codes
- [ ] Deployed; tell the desktop session the base URL and client ID
