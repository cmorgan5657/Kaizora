# Commerce AI Reference

This file is a practical reference for Kaizora's Commerce Intelligence flow at `/creator/commerce`.

## What The Commerce AI Does

The Commerce AI is a set of background agents that review marketplace assets and bundles, then write their results into the database.

Main agent types used in the UI:

- `search_optimization`
  Improves asset or bundle discoverability by updating category, tags, and keywords.

- `bundling`
  Groups related assets into a bundle when the AI thinks they sell better together.

- `debundling`
  Reviews weak bundles and can suggest breaking them apart.

- `merchandising`
  Suggests presentation and merchandising improvements for marketplace visibility.

- `catalog`
  Reviews marketplace catalog quality and metadata completeness.

- `feature`
  Reviews assets for featuring.

- `unfeature`
  Reviews featured assets and can remove them when they no longer qualify.

- `pricing`
  Reviews asset demand and can suggest increasing or decreasing price.

- `post_launch`
  Reviews recently launched assets after performance data starts coming in.

## Why `/creator/commerce` Can Look Empty

The page does not become populated just because `assets` or `bundles` exist.

The Commerce Intelligence screen mainly depends on rows in:

- `public.agent_decisions`

That means:

- If you delete and recreate marketplace tables, the page can show `0 actions`.
- Updating `assets.created_at`, `updated_at`, `views_count`, or `purchases_count` only makes items eligible for review.
- The UI shows activity only after an agent actually runs and inserts an `agent_decisions` record.

In short:

`assets` and `bundles` are the input.
`agent_decisions` is the audit log the dashboard reads.

## Important Tables

- `public.assets`
  Stores creator assets and agent-related fields like `featured`, `price_cents`, `last_agent_action`, `last_agent_run_at`, and `last_search_optimized_at`.

- `public.bundles`
  Stores bundle records created or reviewed by bundling/debundling/search logic.

- `public.agent_decisions`
  Stores what each agent decided, why it decided it, and when it ran.

- `public.credit_action_costs`
  Stores admin pricing for AI actions such as Decision Layer and Remix credits.

## How The Dashboard Decides What To Show

The `/creator/commerce` page is driven by agent history, not only by current asset state.

Typical flow:

1. An asset or bundle becomes eligible.
2. An agent runs.
3. The agent writes a row to `public.agent_decisions`.
4. Some agents also update the asset or bundle itself.
5. `/creator/commerce` reads those decisions and shows counts, last-run state, and reports.

## Feature Agent Note

The feature agent lives in [lib/agents/featureAssetAgent.ts](/Users/primedepthlabs/PDL/Kaizora/kaizora-nextjs/lib/agents/featureAssetAgent.ts:1).

It currently works like this:

- skips assets under 7 days old
- skips already featured assets
- skips assets under active `manual_override_until`
- asks AI whether an asset should be featured
- falls back to a purchase threshold rule when AI does not return a clear answer

Important recent behavior:

- when the feature agent decides **not** to feature an asset, it now also logs a `feature` decision with `review_action = 'no_op'`
- this was added so the Commerce Intelligence dashboard can still show that the feature agent reviewed the asset

Without that log row, the asset may be evaluated internally but the UI can still look like "AI never run".

## Manual Test Flow

If you reset the DB and want to confirm everything is working again, use this order.

### 1. Seed required pricing/admin data

Run your `credit_action_costs` seed first if the pricing/admin screen was empty.

Example file:

- [scripts/seed-action-costs.sql](/Users/primedepthlabs/PDL/Kaizora/kaizora-nextjs/scripts/seed-action-costs.sql:1)

### 2. Make sure test assets are eligible

For asset-based agents, useful fields are:

- `agent_mode`
- `created_at`
- `featured`
- `is_public`
- `views_count`
- `purchases_count`
- `price_cents`
- `last_agent_run_at`
- `last_agent_action`

For bundle-based agents, useful fields are:

- `is_public`
- `sales_count`
- `updated_at`
- `auto_delisted_reason`

### 3. Run an agent

Manual routes exist at:

- `/api/run-agent/[type]`

Examples:

- `/api/run-agent/search_optimization`
- `/api/run-agent/bundling`
- `/api/run-agent/debundling`
- `/api/run-agent/merchandising`
- `/api/run-agent/catalog`
- `/api/run-agent/feature`
- `/api/run-agent/unfeature`
- `/api/run-agent/pricing`
- `/api/run-agent/post_launch`

If you run them from the browser console, use the logged-in user's bearer token.

Example:

```js
await fetch("/api/run-agent/search_optimization", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
}).then(async (r) => ({
  status: r.status,
  body: await r.json(),
}));
```

### 4. Verify database output

Check whether the agent wrote to `public.agent_decisions`.

```sql
select
  ad.agent_type,
  a.title,
  ad.review_action,
  ad.explanation,
  ad.output,
  ad.created_at
from public.agent_decisions ad
join public.assets a on a.id = ad.asset_id
where a.owner_id = '320c976f-ac7e-4571-98af-6878ad867cba'
order by ad.created_at desc;
```

Then confirm whether the asset fields changed:

```sql
select
  title,
  is_public,
  featured,
  price_cents,
  category,
  tags,
  keywords,
  last_agent_action,
  last_agent_run_at,
  last_search_optimized_at
from public.assets
where owner_id = '320c976f-ac7e-4571-98af-6878ad867cba'
order by title;
```

And confirm bundle changes:

```sql
select
  name,
  is_public,
  sales_count,
  auto_delisted_reason,
  asset_ids,
  updated_at
from public.bundles
where creator_id = '320c976f-ac7e-4571-98af-6878ad867cba'
order by created_at desc;
```

## What Success Looks Like

Here is how to tell each major agent is working.

- `search_optimization`
  New `agent_decisions` rows appear, and `assets.category`, `tags`, `keywords`, `last_agent_action`, and `last_search_optimized_at` update.

- `bundling`
  A new bundle appears in `public.bundles`, and a `bundling` row appears in `public.agent_decisions`.

- `debundling`
  A `debundling` row appears in `public.agent_decisions`. Depending on the decision, bundle state may change.

- `feature`
  A `feature` row appears in `public.agent_decisions`. If strong enough, the asset becomes `featured = true`. If not, a `no_op` decision should still be logged.

- `unfeature`
  An `unfeature` row appears in `public.agent_decisions`, and `featured` may be set to `false`.

- `pricing`
  A `pricing` row appears in `public.agent_decisions`. Depending on implementation, it may suggest a change first before updating `price_cents`.

- `post_launch`
  A `post_launch` row appears in `public.agent_decisions`, and it may trigger actions like featuring strong performers.

## Known Source Of Confusion

Some unrelated API errors can appear in the browser console while testing commerce AI.

Examples already seen during testing:

- `GET /api/notifications` returning `500`
- Supabase `406` responses for unrelated subscription queries

These do not automatically mean the commerce agent failed.
Always verify agent execution by checking:

- HTTP response from `/api/run-agent/...`
- rows in `public.agent_decisions`
- updated fields in `public.assets` or `public.bundles`

## Practical Rule

If the Commerce Intelligence page says:

- `0 actions`
- `never run for you`
- `No ... actions yet`

then the first thing to check is not asset data alone.
Check whether the relevant agent inserted a row into `public.agent_decisions`.

