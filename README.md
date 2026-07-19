# KAIZORA

KAIZORA is a Next.js marketplace and creator platform for AI-assisted digital assets. The app combines creator tooling, asset remix/generation flows, marketplace commerce, credit/subscription billing, moderation, and a large "Decision Layer" analysis experience.

This README is meant to help a new developer understand how the repo is organized and where to start.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase
  Database, auth, storage, and some backend automation
- Stripe
  Subscriptions, one-time payments, credits, and creator payouts
- Gemini / Vertex AI, OpenAI, Replicate, fal.ai, ElevenLabs
  AI generation, analysis, assistants, voice, and commerce agents

## What The Product Does

The repo is organized around a few main product areas:

- Public marketing pages
  Home, pricing, features, how-it-works, policies, contact
- Auth and profile
  Login, signup, callback, profile completion, account management
- Creator workspace
  Upload assets, manage listings, earnings, reports, AI inbox, commerce insights
- Marketplace
  Browse assets and bundles, view listings, cart, purchase, resale
- Remix studio
  AI generation and regeneration workflows for media assets
- Decision Layer
  AI-assisted evaluation of text, image, audio, and video assets
- Superadmin
  Pricing, moderation, DMCA, royalties, plans, users, reporting

## High-Level Architecture

### Frontend

The UI lives under `app/` and uses the App Router.

- `app/layout.tsx`
  Global shell, navbar, footer, security guards, credits modal
- `app/page.tsx`
  Landing page
- `app/components/`
  Shared UI used across product areas
- `app/hooks/`
  Client-side hooks for pagination, plans, tours, credit status

### Backend Inside Next.js

Server routes live under `app/api/**/route.ts`.

These routes handle:

- billing and checkout
- marketplace actions
- AI generation and evaluation
- creator automation
- moderation and compliance
- notifications and support

### Data Layer

Supabase is the main backend service:

- auth/session state on the client
- server-side service-role access
- database tables for assets, bundles, purchases, credits, plans, reports, notifications, agent decisions
- storage buckets for uploaded/generated assets

Main entry points:

- `lib/supabaseClient.ts`
  Browser/client Supabase instance
- `lib/supabaseServer.ts`
  Server-side admin Supabase instance

### AI Layer

The AI-related logic is split between route handlers and reusable helpers in `lib/ai/`.

Main responsibilities:

- Decision Layer analysis
- marketplace readiness checks
- prompt suggestions and reverse analysis
- creator assistants and chat
- pricing, packaging, catalog, merchandising, and search optimization agents

Useful folders:

- `lib/ai/`
  Shared AI provider and agent helpers
- `lib/agents/`
  Batch/automation agents for commerce workflows
- `app/api/decision-layer*`
  Main analysis endpoints
- `app/api/commerce/*`
  Asset and catalog optimization flows

## Folder Guide

### `app/`

This is the main application.

- `app/(auth)/`
  Login, signup, callback, reset password, profile completion
- `app/api/`
  All internal API endpoints
- `app/creator/`
  Creator dashboard pages
- `app/marketplace/`
  Marketplace browsing and bundle pages
- `app/remix/`
  Remix and studio flows
- `app/decision-layer/`
  Decision Layer UI
- `app/superadmin/`
  Admin dashboards and controls
- `app/components/`
  Shared app-level components

### `lib/`

Shared business logic and integrations.

- `lib/stripe.ts`
  Shared Stripe client
- `lib/transferToSeller.ts`
  Payout logic
- `lib/credits.ts`
  Credit billing/email helpers
- `lib/email.ts`
  Mail templates and mailer config
- `lib/debugLogs.ts`
  Feature-flagged server logging
- `lib/fulfillPurchase.ts`
  Post-purchase fulfillment helpers
- `lib/ai/`
  AI provider wrappers and commerce intelligence logic
- `lib/agents/`
  Background agent implementations

### `scripts/`

Manual scripts and SQL helpers.

- `scripts/with-env.mjs`
  Runs commands with a chosen env file
- `scripts/runAgent.ts`
  Manual agent execution helper
- `scripts/*.sql`
  Seed/reset/admin SQL for credits and pricing

### `supabase/`

Supabase-specific server code.

- `supabase/functions/fulfill-credits/`
  Edge function for credit fulfillment
- `supabase/functions/run-agents/`
  Edge function entry for automation agents

### `docs/`

Project-specific reference docs.

- `docs/environment-setup.md`
  Local, staging, and production env setup
- `docs/api-feature-inventory.md`
  Route inventory and service usage
- `docs/commerce-ai-reference.md`
  Commerce intelligence behavior and debugging notes

## API Areas

The internal routes are large, but they cluster into a few clear groups.

### Billing, Credits, and Stripe

Paths:

- `app/api/stripe/*`
- `app/api/credits/*`
- `app/api/create-payment-intent/route.ts`
- `app/api/webhooks/stripe/route.ts`

Handles:

- plan checkout
- credit subscriptions and top-ups
- saved cards
- creator Stripe Connect onboarding
- seller transfers
- webhook-driven fulfillment

### AI Generation and Remix

Paths:

- `app/api/ai-generate/route.ts`
- `app/api/ai-suggest/route.ts`
- `app/api/ai-reverse/route.ts`
- `app/remix/**`

Handles:

- media generation/regeneration
- prompt help
- reverse analysis for remix workflows

### Decision Layer

Paths:

- `app/decision-layer/page.tsx`
- `app/api/decision-layer/evaluate/route.ts`
- `app/api/decision-layer-text/evaluate/route.ts`
- `app/api/decision-layer-audio/evaluate/route.ts`
- `app/api/decision-layer-video/evaluate/route.ts`
- `app/api/decision-layer/agent-chat/route.ts`
- `app/api/decision-layer/tts/route.ts`

Handles:

- asset readiness evaluation
- AI guidance and chat
- text/image/audio/video-specific analysis
- voice output through ElevenLabs

### Marketplace and Assets

Paths:

- `app/marketplace/page.tsx`
- `app/assets/[id]/page.tsx`
- `app/api/assets/*`
- `app/api/bundles/*`
- `app/api/cart/*`
- `app/api/marketplace/*`

Handles:

- asset browsing
- bundle browsing and purchase
- saves, clicks, views
- resale
- marketplace evaluation and bundle suggestion flows

### Creator Commerce Intelligence

Paths:

- `app/creator/commerce/page.tsx`
- `app/api/commerce/*`
- `app/api/run-agent/*`
- `lib/agents/*`

Handles:

- search optimization
- pricing suggestions
- bundling/debundling
- merchandising and catalog recommendations
- featuring/unfeaturing
- post-launch optimization

The dashboard depends heavily on `agent_decisions` data. If the page looks empty, read `docs/commerce-ai-reference.md`.

### Admin and Compliance

Paths:

- `app/superadmin/**`
- `app/api/admin/*`
- `app/api/dmca/*`
- `app/api/posts/moderate/route.ts`

Handles:

- plans and pricing
- moderation queues
- licenses, royalties, platform fees
- DMCA workflows
- community and marketplace oversight

## Environments

The repo now supports separate env files for local/default, staging, and production.

Relevant files:

- `.env`
  Local/default environment
- `.env.staging`
  Staging environment
- `.env.production`
  Production environment
- `.env.example`
- `.env.staging.example`
- `.env.production.example`

Commands:

- `npm run dev`
- `npm run dev:staging`
- `npm run dev:production`
- `npm run build:staging`
- `npm run build:production`
- `npm run start:staging`
- `npm run start:production`

More details:

- `docs/environment-setup.md`

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create env files

At minimum:

- copy `.env.example` to `.env`

If you also need multi-environment local workflows:

- create `.env.staging`
- create `.env.production`

### 3. Start the app

```bash
npm run dev
```

Or for staging config:

```bash
npm run dev:staging
```

## Where To Start For Common Tasks

### I need to change a page

Start in `app/<route>/page.tsx`.

Examples:

- homepage: `app/page.tsx`
- marketplace: `app/marketplace/page.tsx`
- creator commerce: `app/creator/commerce/page.tsx`
- decision layer: `app/decision-layer/page.tsx`

### I need to change shared UI

Start in:

- `app/components/`
- `app/components/motion/`
- `app/globals.css`

### I need to change billing or Stripe logic

Start in:

- `lib/stripe.ts`
- `lib/transferToSeller.ts`
- `lib/credits.ts`
- `app/api/stripe/*`
- `app/api/credits/*`
- `app/api/webhooks/stripe/route.ts`

### I need to change AI behavior

Start in:

- `lib/ai/`
- `lib/agents/`
- relevant `app/api/*` route

Examples:

- Decision Layer: `app/api/decision-layer*`
- marketplace assistant: `app/api/marketplace-assistant/route.ts`
- remix generation: `app/api/ai-generate/route.ts`

### I need to change auth or Supabase access

Start in:

- `lib/supabaseClient.ts`
- `lib/supabaseServer.ts`
- auth pages in `app/(auth)/`

### I need to debug creator commerce

Read first:

- `docs/commerce-ai-reference.md`

Then inspect:

- `app/creator/commerce/page.tsx`
- `app/api/run-agent/*`
- `lib/agents/*`

## Important Operational Notes

- Do not commit real secrets to `.env` files.
- Stripe production keys belong in `.env.production`.
- Staging and production should use different Supabase projects, Stripe keys, and webhook secrets.
- Some routes depend on FFmpeg and FFprobe paths being valid.
- Some admin/commerce pages will look empty if their backing tables are unseeded or agent history is missing.

## Reference Docs

- [Environment setup](./docs/environment-setup.md)
- [API feature inventory](./docs/api-feature-inventory.md)
- [Commerce AI reference](./docs/commerce-ai-reference.md)

## Current Caveats

- This repo has a large API surface and some routes contain both orchestration and business logic, so changes often need checks in both `app/api/**` and `lib/**`.
- Some historical debugging code exists in the codebase; review logs carefully before shipping changes to production.
- If credentials were ever committed or shared, rotate them before relying on them.
