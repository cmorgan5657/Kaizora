# Environment Setup

This repo now supports separate env files for staging and production without adding extra packages.

## Files

- `.env`: your current local/default environment
- `.env.staging`: staging secrets and URLs
- `.env.production`: production secrets and URLs
- `.env.example`: local/default template
- `.env.staging.example`: staging template
- `.env.production.example`: production template

## Commands

- `npm run dev`: use `.env`
- `npm run dev:staging`: use `.env.staging`
- `npm run dev:production`: use `.env.production`
- `npm run build:staging`: build with `.env.staging`
- `npm run build:production`: build with `.env.production`
- `npm run start:staging`: start with `.env.staging`
- `npm run start:production`: start with `.env.production`

## Recommended setup

1. Keep `.env` for your current local setup.
2. Create `.env.staging` from `.env.staging.example`.
3. Create `.env.production` from `.env.production.example`.
4. Use staging Supabase, Stripe, webhooks, and app URLs in `.env.staging`.
5. Use production Supabase, Stripe, webhooks, and live URLs in `.env.production`.

## Notes

- Do not commit real secrets.
- `staging` and `production` should each have their own Stripe webhook secret.
- `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` should match the deployed frontend domain for each environment.
- If you use Vertex AI, keep `GOOGLE_CLOUD_CREDENTIALS_JSON` on one line with escaped `\n` values.
