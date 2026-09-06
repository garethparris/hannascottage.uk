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
