# Cloudflare Worker Migration + Mailtrap Contact Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move hannascottage.uk to run as a Cloudflare Worker (static assets + one API route), with no visual/style changes to the site, and replace the contact form's third-party backend with a Worker route that sends via Mailtrap and verifies Cloudflare Turnstile.

**Architecture:** A single Cloudflare Worker (`src/worker.ts`) serves static assets from `public/` via a Workers assets binding, and handles `POST /api/contact` itself. Validation/Turnstile-verification logic lives in `src/lib/contact.ts`, kept separate so it can be unit tested without mocking the Workers runtime. No frontend build step — the site stays plain HTML/CSS/jQuery.

**Tech Stack:** TypeScript (Worker source only, bundled by `wrangler deploy`'s built-in esbuild), Vitest (unit tests), Cloudflare Workers (assets binding), Mailtrap HTTP send API, Cloudflare Turnstile.

**Spec:** [`docs/superpowers/specs/2026-09-06-cloudflare-worker-migration-design.md`](../specs/2026-09-06-cloudflare-worker-migration-design.md)

## Global Constraints

- No visual/style change to the existing site except the one approved addition: a Name field on the contact form.
- No build tooling for the frontend (no Astro, no bundler) — only `src/worker.ts` is bundled, by `wrangler deploy` itself.
- Contact form abuse protection: Turnstile verification + honeypot field + length caps (name ≤ 200 chars, message ≤ 5000 chars).
- Mailtrap `from` address must be `noreply@parris.me.uk` (the account's one verified sending domain) — never `@hannascottage.uk`. `reply_to` is always the visitor's submitted email.
- Runtime env vars (`MAILTRAP_API_TOKEN`, `CONTACT_TO_EMAIL`, `TURNSTILE_SECRET_KEY`) are set in the Cloudflare dashboard only, never committed.
- `wrangler.toml`: `name = "hannascottage-uk"`, `main = "src/worker.ts"`, `[assets] directory = "./public"`, `keep_vars = true`.

---

### Task 1: Scaffold the Worker project and move static assets into `public/`

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `.gitignore`
- Create: `.dev.vars.example`
- Create: `.node-version`
- Create: `src/worker.ts`
- Move: every existing static file/directory at the repo root into `public/` (see exact list in Step 1)

**Interfaces:**
- Produces: `env.ASSETS.fetch(request)` static-asset serving, used unmodified by Task 3's route dispatch.

- [ ] **Step 1: Move all static assets into `public/`**

Run, from the repo root:

```bash
mkdir -p public
git mv android-chrome-144x144.png android-chrome-192x192.png android-chrome-36x36.png \
  android-chrome-48x48.png android-chrome-72x72.png android-chrome-96x96.png \
  apple-touch-icon-114x114.png apple-touch-icon-120x120.png apple-touch-icon-144x144.png \
  apple-touch-icon-152x152.png apple-touch-icon-180x180.png apple-touch-icon-57x57.png \
  apple-touch-icon-60x60.png apple-touch-icon-72x72.png apple-touch-icon-76x76.png \
  apple-touch-icon-precomposed.png apple-touch-icon.png assets browserconfig.xml css \
  favicon-16x16.png favicon-32x32.png favicon-96x96.png favicon.ico fonts img index.html js \
  manifest.json mstile-144x144.png mstile-150x150.png mstile-310x150.png mstile-310x310.png \
  mstile-70x70.png sent.html public/
```

Expected: `git status` shows every one of those paths renamed to `public/<same path>`, nothing left at the repo root except the new files this task creates plus `docs/`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "hannascottage-uk",
  "type": "module",
  "version": "0.0.1",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "check": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^5.20260906.1",
    "typescript": "^6.0.3",
    "vitest": "^5.0.0",
    "wrangler": "^4.129.0"
  }
}
```

- [ ] **Step 3: Create `.node-version`**

```
24.20.0
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 5: Create `wrangler.toml`**

```toml
name = "hannascottage-uk"
compatibility_date = "2026-09-06"
main = "src/worker.ts"

# CONTACT_TO_EMAIL (and any other plain "Variable" set via the dashboard's
# Settings > Variables and Secrets) would otherwise get wiped on every deploy,
# since our deploy command is `wrangler deploy` and Wrangler treats this file
# as the source of truth for the Worker's config. Secrets are unaffected by
# this setting - Cloudflare won't delete a Secret unless you explicitly run
# `wrangler secret delete`.
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

- [ ] **Step 6: Create `.gitignore`**

```
# dependencies
node_modules/

# Cloudflare local dev state (Miniflare cache)
.wrangler/

# Cloudflare local dev secrets (wrangler dev)
.dev.vars

# environment variables
.env
.env.*

# macOS-specific files
.DS_Store

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# jetbrains setting folder
.idea/
```

- [ ] **Step 7: Create `.dev.vars.example`**

A committed template (no real values) documenting the runtime vars a developer needs in their own gitignored `.dev.vars` for local `wrangler dev`:

```
MAILTRAP_API_TOKEN=
CONTACT_TO_EMAIL=info@hannascottage.uk
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 8: Create a minimal `src/worker.ts` (assets-only for now)**

```typescript
// src/worker.ts
//
// Entry point for the Cloudflare Workers deployment. Static assets are served
// via the ASSETS binding configured in wrangler.toml; this Worker only needs
// to intercept the one route with server-side logic, the contact form
// (added in a later task).

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: completes with no errors, `node_modules/` and `package-lock.json` created.

- [ ] **Step 10: Verify the Worker serves the static site locally**

```bash
npx wrangler dev --port 8787 > /tmp/wrangler-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/
curl -s http://localhost:8787/ | grep -c "Hannas Cottage"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/css/style.css
kill %1
```

Expected: first curl prints `200`, second prints a count of `1` or more (confirms `index.html` content is served), third prints `200` (confirms nested static assets like `css/style.css` resolve correctly from `public/`).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Cloudflare Worker project, move static assets into public/"
```

---

### Task 2: Contact form validation and Turnstile verification logic (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/contact.ts`
- Create: `test/contact.test.ts`

**Interfaces:**
- Produces: `extractContactFields(formData: FormData): Promise<{ ok: true; name: string; email: string; message: string } | { ok: false; error: string }>`
- Produces: `verifyTurnstileToken(token: string, secretKey: string, remoteIp?: string): Promise<boolean>`
- Produces: exported constants `MAX_NAME_LENGTH = 200`, `MAX_MESSAGE_LENGTH = 5000`, `HONEYPOT_FIELD = 'website'` — Task 3's `src/worker.ts` and this task's own test import these by name.

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {},
});
```

- [ ] **Step 2: Write the failing test file `test/contact.test.ts`**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractContactFields,
  verifyTurnstileToken,
  HONEYPOT_FIELD,
  MAX_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
} from '../src/lib/contact';

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe('extractContactFields', () => {
  it('accepts a complete, valid submission', async () => {
    const result = await extractContactFields(
      formDataWith({ name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' })
    );
    expect(result).toEqual({ ok: true, name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' });
  });

  it('rejects a missing name', async () => {
    const result = await extractContactFields(
      formDataWith({ name: '', email: 'jane@example.com', message: 'Hello!' })
    );
    expect(result).toEqual({ ok: false, error: 'Missing name' });
  });

  it('rejects an email without an @', async () => {
    const result = await extractContactFields(
      formDataWith({ name: 'Jane Doe', email: 'not-an-email', message: 'Hello!' })
    );
    expect(result).toEqual({ ok: false, error: 'Invalid email' });
  });

  it('rejects a missing message', async () => {
    const result = await extractContactFields(
      formDataWith({ name: 'Jane Doe', email: 'jane@example.com', message: '' })
    );
    expect(result).toEqual({ ok: false, error: 'Missing message' });
  });
});

describe('abuse protection', () => {
  it('rejects a submission with the honeypot field filled in', async () => {
    const result = await extractContactFields(
      formDataWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'Hello!',
        [HONEYPOT_FIELD]: 'http://spam.example.com',
      })
    );
    expect(result).toEqual({ ok: false, error: 'Invalid submission' });
  });

  it('accepts a submission with the honeypot field present but empty', async () => {
    // A real browser submits the hidden input as an empty string, so an
    // empty honeypot must not be mistaken for bot traffic.
    const result = await extractContactFields(
      formDataWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'Hello!',
        [HONEYPOT_FIELD]: '',
      })
    );
    expect(result).toEqual({
      ok: true,
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello!',
    });
  });

  it('accepts a name and message exactly at the length limits', async () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    const message = 'b'.repeat(MAX_MESSAGE_LENGTH);
    const result = await extractContactFields(
      formDataWith({ name, email: 'jane@example.com', message })
    );
    expect(result).toEqual({ ok: true, name, email: 'jane@example.com', message });
  });

  it('rejects a name over the length limit', async () => {
    const result = await extractContactFields(
      formDataWith({
        name: 'a'.repeat(MAX_NAME_LENGTH + 1),
        email: 'jane@example.com',
        message: 'Hello!',
      })
    );
    expect(result).toEqual({ ok: false, error: 'Name too long' });
  });

  it('rejects a message over the length limit', async () => {
    const result = await extractContactFields(
      formDataWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'b'.repeat(MAX_MESSAGE_LENGTH + 1),
      })
    );
    expect(result).toEqual({ ok: false, error: 'Message too long' });
  });
});

describe('verifyTurnstileToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an empty token without calling Turnstile', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyTurnstileToken('', 'secret');

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a token Turnstile reports as valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );

    const result = await verifyTurnstileToken('a-real-token', 'secret');

    expect(result).toBe(true);
  });

  it('rejects a token Turnstile reports as invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
        })
      )
    );

    const result = await verifyTurnstileToken('a-fake-token', 'secret');

    expect(result).toBe(false);
  });

  it('sends the token, secret and remote IP to the siteverify endpoint', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await verifyTurnstileToken('a-real-token', 'my-secret', '203.0.113.1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
    const sentBody = fetchSpy.mock.calls[0][1].body as URLSearchParams;
    expect(sentBody.get('secret')).toBe('my-secret');
    expect(sentBody.get('response')).toBe('a-real-token');
    expect(sentBody.get('remoteip')).toBe('203.0.113.1');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/contact.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/contact'` (the file doesn't exist yet).

- [ ] **Step 4: Create `src/lib/contact.ts`**

```typescript
// src/lib/contact.ts

// Abuse-protection limits. Generous enough that no genuine enquiry hits them,
// tight enough to stop a bot pasting a spam payload into the email body.
export const MAX_NAME_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 5000;

// Name of the hidden honeypot input rendered (off-screen) by the contact form.
// A human never sees it, so a non-empty value means a bot filled the form in.
export const HONEYPOT_FIELD = 'website';

export async function extractContactFields(formData: FormData): Promise<
  { ok: true; name: string; email: string; message: string } | { ok: false; error: string }
> {
  const honeypot = formData.get(HONEYPOT_FIELD);
  const name = formData.get('name');
  const email = formData.get('email');
  const message = formData.get('message');

  // Checked first so bot traffic short-circuits before any other work.
  // The error is deliberately vague: naming the honeypot would teach a
  // bot author exactly which field to leave alone next time.
  if (typeof honeypot === 'string' && honeypot.trim()) {
    return { ok: false, error: 'Invalid submission' };
  }

  if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Missing name' };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Name too long' };
  if (typeof email !== 'string' || !email.includes('@')) return { ok: false, error: 'Invalid email' };
  if (typeof message !== 'string' || !message.trim()) return { ok: false, error: 'Missing message' };
  if (message.length > MAX_MESSAGE_LENGTH) return { ok: false, error: 'Message too long' };

  return { ok: true, name, email, message };
}

// Verifies a Cloudflare Turnstile response token server-side. `remoteIp` is
// optional (Turnstile's siteverify endpoint accepts requests without it) but
// including it, when available, improves Cloudflare's risk scoring.
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<boolean> {
  if (!token) return false;

  const body = new URLSearchParams();
  body.append('secret', secretKey);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });

  const outcome = (await response.json()) as { success: boolean };
  return outcome.success === true;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/contact.test.ts`
Expected: PASS, all 11 tests green.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/contact.ts test/contact.test.ts
git commit -m "Add contact form validation and Turnstile verification logic"
```

---

### Task 3: Wire `/api/contact` into the Worker, sending via Mailtrap

**Files:**
- Modify: `src/worker.ts`

**Interfaces:**
- Consumes: `extractContactFields`, `verifyTurnstileToken` from `src/lib/contact.ts` (Task 2), with the exact signatures given there.
- Produces: `POST /api/contact` — accepts `multipart/form-data` with fields `name`, `email`, `message`, `website` (honeypot), `cf-turnstile-response`; returns JSON `{ ok: true }` (200), or `{ error: string }` (400 validation/honeypot/Turnstile failure, 500 misconfiguration, 502 Mailtrap send failure).

- [ ] **Step 1: Replace `src/worker.ts` with the full contact-handling version**

```typescript
// src/worker.ts
//
// Entry point for the Cloudflare Workers deployment. Static assets are served
// via the ASSETS binding configured in wrangler.toml; this Worker only needs
// to intercept the one route with server-side logic, the contact form.

import { extractContactFields, verifyTurnstileToken } from './lib/contact';

// MAILTRAP_API_TOKEN, CONTACT_TO_EMAIL and TURNSTILE_SECRET_KEY must be set
// under the Worker's Settings > Variables and Secrets (runtime), not the
// project's Build variables and secrets. Build variables are only injected
// into the CI shell during `npm run build`/`wrangler deploy` and never reach
// this Env object - setting them there instead is a real, easy-to-make
// mistake that silently produces a "Contact form is not configured" 500
// below.
export interface Env {
  MAILTRAP_API_TOKEN: string;
  CONTACT_TO_EMAIL: string;
  TURNSTILE_SECRET_KEY: string;
  ASSETS: Fetcher;
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (!env.MAILTRAP_API_TOKEN || !env.CONTACT_TO_EMAIL || !env.TURNSTILE_SECRET_KEY) {
    console.error(
      `Contact form misconfigured: MAILTRAP_API_TOKEN present=${!!env.MAILTRAP_API_TOKEN}, CONTACT_TO_EMAIL present=${!!env.CONTACT_TO_EMAIL}, TURNSTILE_SECRET_KEY present=${!!env.TURNSTILE_SECRET_KEY}`
    );
    return new Response(JSON.stringify({ error: 'Contact form is not configured' }), { status: 500 });
  }

  const formData = await request.formData();

  const turnstileToken = formData.get('cf-turnstile-response');
  const turnstileValid =
    typeof turnstileToken === 'string' &&
    turnstileToken.length > 0 &&
    (await verifyTurnstileToken(turnstileToken, env.TURNSTILE_SECRET_KEY, request.headers.get('CF-Connecting-IP') ?? undefined));

  if (!turnstileValid) {
    return new Response(JSON.stringify({ error: 'Verification failed, please try again' }), { status: 400 });
  }

  const fields = await extractContactFields(formData);

  if (!fields.ok) {
    return new Response(JSON.stringify({ error: fields.error }), { status: 400 });
  }

  // Mailtrap's account behind MAILTRAP_API_TOKEN has only one verified
  // sending domain, already used for parris.me.uk - so `from` must stay on
  // that domain even though this is the Hannas Cottage site. reply_to is set
  // to the visitor's own address so replying goes straight to them, and the
  // display name plus subject make it clear which site the message is from.
  const mailtrapResponse = await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MAILTRAP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: 'noreply@parris.me.uk', name: 'Hannas Cottage website contact form' },
      to: [{ email: env.CONTACT_TO_EMAIL }],
      reply_to: { email: fields.email },
      subject: `New contact form message from ${fields.name} (Hannas Cottage website)`,
      text: fields.message,
    }),
  });

  if (!mailtrapResponse.ok) {
    const body = await mailtrapResponse.text();
    console.error(`Mailtrap send failed: ${mailtrapResponse.status} ${body}`);
    return new Response(JSON.stringify({ error: 'Failed to send' }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 2: Create a local `.dev.vars` for testing (not committed — already gitignored)**

```
MAILTRAP_API_TOKEN=fake-token-for-local-testing
CONTACT_TO_EMAIL=info@hannascottage.uk
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

`1x0000000000000000000000000000000AA` is Cloudflare's official Turnstile testing secret key that always reports success, regardless of the token value sent — it lets us exercise the whole pipeline locally without a real Turnstile widget or a real Mailtrap token.

- [ ] **Step 3: Verify the honeypot rejection path**

```bash
npx wrangler dev --port 8787 > /tmp/wrangler-dev.log 2>&1 &
sleep 4
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8787/api/contact \
  -F "name=Jane Doe" -F "email=jane@example.com" -F "message=Hello" \
  -F "website=http://spam.example.com" -F "cf-turnstile-response=test-token"
```

Expected: body `{"error":"Invalid submission"}` followed by `400`.

- [ ] **Step 4: Verify the missing-Turnstile-token rejection path**

```bash
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8787/api/contact \
  -F "name=Jane Doe" -F "email=jane@example.com" -F "message=Hello"
```

Expected: body `{"error":"Verification failed, please try again"}` followed by `400`.

- [ ] **Step 5: Verify the missing-message rejection path**

```bash
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8787/api/contact \
  -F "name=Jane Doe" -F "email=jane@example.com" -F "cf-turnstile-response=test-token"
```

Expected: body `{"error":"Missing message"}` followed by `400`.

- [ ] **Step 6: Verify a valid submission reaches Mailtrap (and fails there, since the token is fake)**

```bash
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8787/api/contact \
  -F "name=Jane Doe" -F "email=jane@example.com" -F "message=Hello" \
  -F "cf-turnstile-response=test-token"
tail -5 /tmp/wrangler-dev.log
kill %1
```

Expected: body `{"error":"Failed to send"}` followed by `502` — this proves Turnstile verification passed, all field validation passed, and the request reached Mailtrap's API (which rejects the fake bearer token). The log tail shows a line like `Mailtrap send failed: 401 ...`.

- [ ] **Step 7: Commit**

```bash
git add src/worker.ts
git commit -m "Wire /api/contact into the Worker, sending via Mailtrap"
```

---

### Task 4: Rewrite the contact form frontend (Name field, honeypot, Turnstile)

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`
- Modify: `public/js/bnb.js`
- Delete: `public/sent.html`

**Interfaces:**
- Consumes: `POST /api/contact` (Task 3) as a `multipart/form-data` submission via `fetch`.

- [ ] **Step 1: Delete the now-unused redirect page**

```bash
git rm public/sent.html
```

- [ ] **Step 2: Add the Turnstile script tag to `public/index.html`'s `<head>`**

In `public/index.html`, immediately after the existing `<script src="js/testimonial.js" type="text/javascript"></script>` line (currently line 56), add:

```html
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

- [ ] **Step 3: Replace the form markup in `public/index.html`**

Replace this block (currently lines 75-91):

```html
      <div class="form">
        <form class="booking" method="POST" action="https://www.enformed.io/oi0bqdgg" accept-charset="UTF-8">
		  <div>
            <span>To check availability or book online </span><a href="https://www.airbnb.co.uk/rooms/37902664">CLICK HERE.</a>
          </div>
          <div><span>Or send us a message:</span></div>
          <textarea name="message" class="message required"></textarea>
          <label class="for-email">Email:</label>
          <input type="text" name="email" class="email required" />    
          <input type="submit" class="submit" value="Submit" />
		  <input type="hidden" name="*redirect" value="http://www.hannascottage.uk/sent.html" />
		  <input type="hidden" name="*subject" value="Hannas Cottage Website Contact Request" />
          <input type="hidden" name="*default_email" value="hannascottage@prime23.co.uk" />
		  <input type="hidden" name="*formname" value="hannascottage" />
		  <input type="hidden" name="*honeypot" />
        </form>
      </div><!-- end .form -->
```

with:

```html
      <div class="form">
        <form class="booking">
		  <div>
            <span>To check availability or book online </span><a href="https://www.airbnb.co.uk/rooms/37902664">CLICK HERE.</a>
          </div>
          <div><span>Or send us a message:</span></div>
          <!--
            Honeypot: positioned off-screen rather than display:none, so naive
            bots that skip hidden inputs still fill it in. Kept out of the tab
            order and hidden from assistive tech so no real visitor ever
            reaches it. Any non-empty value is rejected server-side (see
            src/lib/contact.ts).
          -->
          <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position: absolute; left: -9999px;" />
          <label class="for-name">Name:</label>
          <input type="text" name="name" class="name required" required maxlength="200" />
          <label class="for-email">Email:</label>
          <input type="text" name="email" class="email required" required />
          <textarea name="message" class="message required" required maxlength="5000"></textarea>
          <div class="cf-turnstile" data-sitekey="1x00000000000000000000AA" data-callback="onTurnstileSuccess" data-expired-callback="onTurnstileExpired" data-error-callback="onTurnstileExpired"></div>
          <input type="submit" class="submit" value="Submit" disabled="disabled" />
          <p class="status" role="status"></p>
        </form>
      </div><!-- end .form -->
```

`1x00000000000000000000AA` is Cloudflare's official Turnstile testing site key that always passes — swap it for the real site key once the Turnstile widget for `hannascottage.uk` is created in the Cloudflare dashboard (see README, added in Task 5).

- [ ] **Step 4: Add matching CSS for the new Name field to `public/css/style.css`**

Immediately after the existing `.header .showcase .form form input.email` rule block (around line 166), add:

```css
.header .showcase .form form input.name {
	width: 250px;
	margin: 0 5px 0 0;
	padding: 0 0 0 10px;
}
```

Immediately after the existing `.header .showcase .form form label.for-email` rule block (around line 199), add:

```css
.header .showcase .form form label.for-name {
	width: 58px;
}
```

- [ ] **Step 5: Replace the booking-form wiring in `public/js/bnb.js`**

Replace this block:

```javascript
// BOOKING FORM VALIDATION

		$(".booking").validate({
			rules: {
				".email": {
					required: true,
					email: true
				},
				".message": {
					required: true
				}
			},
			errorPlacement: function(error, element){
				}
			});
```

with:

```javascript
// BOOKING FORM VALIDATION AND SUBMISSION

		$(".booking").validate({
			rules: {
				name: {
					required: true
				},
				email: {
					required: true,
					email: true
				},
				message: {
					required: true
				}
			},
			errorPlacement: function(error, element){
				},
			submitHandler: function(form) {
				var $form = $(form);
				var $submit = $form.find(".submit");
				var $status = $form.find(".status");

				$.ajax({
					url: "/api/contact",
					method: "POST",
					data: new FormData(form),
					processData: false,
					contentType: false
				}).done(function() {
					$status.text("Thanks, your message has been sent.");
					form.reset();
					$submit.prop("disabled", true);
					if (window.turnstile) { window.turnstile.reset(); }
				}).fail(function() {
					$status.text("Something went wrong, please try again or email us directly.");
				});

				return false;
			}
		});
```

Then, above the `$(document).ready(function(){` line at the top of the file, add the two Turnstile callback functions (plain DOM, not jQuery, so they're defined the moment this script parses, before the widget can call them):

```javascript
// Called by the Cloudflare Turnstile widget (see public/index.html) once a
// challenge completes or expires. Kept outside $(document).ready so these
// are defined as soon as this script parses, regardless of load order
// relative to Turnstile's own async script tag.
function onTurnstileSuccess() {
	document.querySelector(".booking .submit").disabled = false;
}
function onTurnstileExpired() {
	document.querySelector(".booking .submit").disabled = true;
}

```

- [ ] **Step 6: Manually verify the form end-to-end in a browser**

```bash
npx wrangler dev --port 8787 > /tmp/wrangler-dev.log 2>&1 &
sleep 4
open http://localhost:8787/
```

In the browser: confirm the Submit button starts disabled and becomes enabled within a second or two (the test site key auto-solves with no user interaction). Fill in Name, Email, and Message, then click Submit. Confirm the status text below the button changes to either "Thanks, your message has been sent." or "Something went wrong, please try again or email us directly." (the latter is expected here, since `.dev.vars` still has a fake Mailtrap token from Task 3 — the point of this check is that the request round-trips to `/api/contact` and the UI reflects the result, not that a real email is sent).

```bash
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rewrite contact form: add Name field, real honeypot, Turnstile, and /api/contact submission"
```

---

### Task 5: Documentation and final verification

**Files:**
- Create: `README.md`

**Interfaces:**
- None — this task only documents what Tasks 1-4 already built.

- [ ] **Step 1: Create `README.md`**

```markdown
# hannascottage.uk

Hannas Cottage self-catering accommodation site. Plain HTML/CSS/jQuery
(no build step, no framework), deployed on Cloudflare Workers.

## Local development

    npm install
    npm run dev

Copy `.dev.vars.example` to `.dev.vars` and fill in real values (or the
Cloudflare Turnstile testing keys documented below) to exercise the contact
form locally.

## Testing

    npm run test

Unit tests cover the contact form's validation and Turnstile-verification
logic (`src/lib/contact.ts`). There is no automated end-to-end test of a real
Mailtrap send — that's verified manually against the deployed site.

## Deployment (manual, one-time setup)

This deploys as a Cloudflare Worker with static assets. `wrangler.toml`
declares `main = "src/worker.ts"` plus an `[assets]` block pointing at
`public`, so a single Worker serves the static site and handles
`POST /api/contact` itself.

1. In the Cloudflare dashboard, create a Worker connected to the
   `garethparris/hannascottage.uk` GitHub repo (Workers & Pages → Create an
   app → Import a repository). No build command is needed; deploy command
   `npx wrangler deploy`.
2. Under the Worker's **Settings > Variables and Secrets** (the runtime one,
   not the separate "Build variables and secrets" section under Settings >
   Build - that one only reaches the CI shell during `wrangler deploy`,
   never the deployed Worker's `env`), set:
   - `MAILTRAP_API_TOKEN` - a Mailtrap API key for this site (Mailtrap's
     account here only has one verified sending domain, `parris.me.uk`, so
     this Worker sends `from: noreply@parris.me.uk` even though it's the
     Hannas Cottage site - `reply_to` is always set to the visitor's own
     email address).
   - `CONTACT_TO_EMAIL` - `info@hannascottage.uk`.
   - `TURNSTILE_SECRET_KEY` - from a Cloudflare Turnstile widget created for
     `hannascottage.uk`.
3. Create that Turnstile widget (Turnstile → Add site, domain
   `hannascottage.uk`), then replace the testing site key
   `1x00000000000000000000AA` in `public/index.html`'s `cf-turnstile` div
   with the real site key (safe to commit - it's public by design, unlike
   the secret key).
4. Under the Worker's Settings > Domains & Routes, add `hannascottage.uk`
   (and `www.hannascottage.uk` if wanted); Cloudflare handles the DNS
   automatically since the domain's nameservers already point at Cloudflare.
5. Every push to `main` redeploys automatically; every PR gets its own
   preview URL.

## Contact form abuse protection

Three layers, all enforced server-side in `src/worker.ts` (validation logic
lives in `src/lib/contact.ts`, shared with its test):

- **Cloudflare Turnstile** - a challenge widget on the form; the response
  token is verified against Cloudflare's siteverify API before anything else
  runs.
- A hidden **honeypot field** - real visitors never fill it in, so any value
  there means a bot bypassed the widget entirely.
- **Name and message length caps** - stops a bot that passes both of the
  above from pasting an oversized spam payload into the email body.

## License

Code (Worker source and configuration) is provided as-is. The written
content and images are not licensed for reuse.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: PASS, all tests green.

- [ ] **Step 3: Run the type checker**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Final smoke test of the whole site through the Worker**

```bash
npx wrangler dev --port 8787 > /tmp/wrangler-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/img/bigimg-1.jpg
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/sent.html
kill %1
```

Expected: `200`, `200`, and `404` (confirming `sent.html` is really gone).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document deployment, testing, and contact form abuse protection"
```
