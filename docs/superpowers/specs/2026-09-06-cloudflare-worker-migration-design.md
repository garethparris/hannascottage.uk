# Hannas Cottage: Cloudflare Worker migration + Mailtrap contact form design

**Status:** Approved, 2026-09-06.

## Purpose

Move hannascottage.uk from its current host to a Cloudflare Worker, with no
visual or styling changes to the existing site. As part of the move, replace
the contact form's third-party backend (enformed.io) with a Cloudflare
Worker route that sends via Mailtrap, protected by Cloudflare Turnstile.

## Non-goals

- No redesign, restyling, or content rewrite of the existing site. The
  "old school" look and page structure stay exactly as they are today.
- No build tooling / framework (no Astro, no bundler for the frontend). The
  site is plain HTML/CSS/jQuery and stays that way; only the Worker's own
  TypeScript source is bundled, by `wrangler deploy` itself.

## Precedent

This mirrors the approach already live for
[parris.me.uk](https://parris.me.uk) (`~/GitHub/garethparris/parris.me.uk`):
a Cloudflare Worker with a static-assets binding, `src/worker.ts` intercepting
one API route, and `src/lib/contact.ts` holding the validation, Turnstile
verification, and Mailtrap send logic. That repo's `README.md` documents the
one-time manual dashboard setup steps this project will reuse verbatim in
kind (Worker creation, runtime Variables & Secrets, Turnstile widget, custom
domain).

## Architecture

A single Cloudflare Worker serves the whole site:

- Static assets (everything currently at the repo root — `index.html`,
  `sent.html` removed, `css/`, `js/`, `img/`, `fonts/`, `assets/`, favicons,
  `manifest.json`, `browserconfig.xml`) move into a new `public/` directory,
  unchanged in content. This is required because Cloudflare's `[assets]`
  binding needs its own directory, separate from Worker source.
- `src/worker.ts` is the Worker entry point (`main` in `wrangler.toml`). It
  serves everything through `env.ASSETS.fetch(request)` except
  `POST /api/contact`, which it handles itself.
- `src/lib/contact.ts` holds the pure logic: field extraction/validation,
  honeypot check, and Turnstile verification — kept separate from
  `worker.ts` so it can be unit tested without mocking the Workers runtime.

No build step is needed for the static assets (they're already plain
HTML/CSS/JS). `wrangler deploy` bundles `src/worker.ts` via esbuild
automatically — no separate `npm run build` step, unlike parris.me.uk's
Astro build.

## Contact form changes

Current form (`index.html`): posts to `https://www.enformed.io/oi0bqdgg`,
fields are Email + Message only, redirects to `sent.html` on success, and
carries an inert `<input type="hidden" name="*honeypot" />` that a bot
filling every input (hidden or not) would defeat.

New form:

- Adds a **Name** field (approved deviation from "no visual change" — small,
  one extra input, needed so the notification email can identify the
  enquirer and so Mailtrap's `from`/subject can reference them).
- Posts to `/api/contact` via a JS-intercepted `fetch` (same pattern as
  parris.me.uk's `contact.astro`), not a native form POST — so `sent.html`
  becomes unused and is deleted; success/failure is shown inline instead.
- Adds a real off-screen honeypot input (absolutely positioned off-screen,
  `tabindex="-1"`, `aria-hidden="true"`, `autocomplete="off"`), replacing the
  old inert hidden one.
- Adds the Cloudflare Turnstile widget (`cf-turnstile` div + the Turnstile
  API script tag). The submit button stays `disabled` until Turnstile's
  success callback fires.

## Server-side handling

`src/worker.ts` / `src/lib/contact.ts`, adapted from parris.me.uk almost
verbatim:

1. Reject if `MAILTRAP_API_TOKEN`, `CONTACT_TO_EMAIL`, or
   `TURNSTILE_SECRET_KEY` env vars are missing (misconfiguration, not a user
   error — logged and a 500 returned).
2. Verify the Turnstile response token server-side against
   `https://challenges.cloudflare.com/turnstile/v0/siteverify` before
   anything else runs.
3. Extract and validate fields: honeypot must be empty; `name` and `message`
   required with length caps (200 / 5000 chars, matching parris.me.uk);
   `email` must contain `@`.
4. Send via Mailtrap's HTTP API (`https://send.api.mailtrap.io/api/send`).

### Mailtrap sending identity (important deviation from parris.me.uk)

Mailtrap only allows one verified sending domain on this account, already
verified for `parris.me.uk`. Hannas Cottage's contact form **cannot** send
`from: noreply@hannascottage.uk` — it must send from the already-verified
`noreply@parris.me.uk` address. To keep the message clearly attributable to
the right site:

- `from`: `{ email: "noreply@parris.me.uk", name: "Hannas Cottage website contact form" }`
- `reply_to`: the visitor's submitted email, so replying goes to them directly.
- `to`: `env.CONTACT_TO_EMAIL` (set to `info@hannascottage.uk`).
- `subject`: `New contact form message from {name} (Hannas Cottage website)`.

Despite sharing a sending domain, this site gets its **own**
`MAILTRAP_API_TOKEN` (a separate API key created in the same Mailtrap
account), not the token reused from parris.me.uk's Worker — separate secrets
per Worker, same underlying account/domain.

## Environment variables (Worker runtime Variables & Secrets)

| Name | Value | Notes |
|---|---|---|
| `MAILTRAP_API_TOKEN` | new API key, same Mailtrap account as parris.me.uk | secret |
| `CONTACT_TO_EMAIL` | `info@hannascottage.uk` | plain variable |
| `TURNSTILE_SECRET_KEY` | from a new Turnstile widget created for `hannascottage.uk` | secret |

Set under the Worker's **Settings > Variables and Secrets** (runtime), not
the project's **Build variables** — the latter never reaches the deployed
Worker's `env` (this bit us on parris.me.uk; documented there and repeated
here to avoid repeating the mistake).

## wrangler.toml

Same shape as parris.me.uk's:

```toml
name = "hannascottage-uk"
compatibility_date = "2026-09-06"
main = "src/worker.ts"
keep_vars = true

[assets]
directory = "./public"
binding = "ASSETS"

[observability.logs]
enabled = true
head_sampling_rate = 1
invocation_logs = true
persist = true
```

## Testing

Vitest unit tests for `src/lib/contact.ts`, mirroring parris.me.uk's
`test/contact-function.test.ts`: valid submission accepted; missing
name/email/message rejected; invalid email rejected; honeypot filled-in
rejected, honeypot empty accepted; length caps enforced at and beyond the
limit; Turnstile verification accepts/rejects based on the mocked
`siteverify` response and posts the right body (secret, response, remoteip).

No end-to-end test of the live Mailtrap send (same as parris.me.uk) — that's
verified manually once deployed, by submitting the real form.

## Deployment (manual, one-time dashboard steps)

DNS is already on Cloudflare, and the Cloudflare account already exists (used
for parris.me.uk), so this is just:

1. Workers & Pages → Create an app → Import the `garethparris/hannascottage.uk`
   GitHub repo. No build command needed; deploy command `npx wrangler deploy`.
2. Under the Worker's **Settings > Variables and Secrets**, set the three
   env vars above.
3. Create a new Cloudflare Turnstile widget for `hannascottage.uk` to get its
   site key (committed in `index.html`, safe to be public) and secret key
   (goes in step 2, never committed).
4. Under the Worker's **Settings > Domains & Routes**, add `hannascottage.uk`
   (and `www.hannascottage.uk` if wanted).
5. Every push to `main` redeploys automatically.

These dashboard steps are manual and out of scope for the implementation
plan itself — the plan produces the code and the README instructions; the
user performs steps 1–4 by hand, same division of labour as parris.me.uk.

## Repo visibility

Confirmed by scanning all 4 commits in the repo's history: no secrets, API
keys, tokens, credentials, or `.env` files were ever committed. Safe to make
the GitHub repo public independent of this migration.
