# KAIZORA API And Feature Inventory

This file summarizes the repo API surface in tabular form.

## External APIs / Services Used

| Service / API | Where It Appears | Main Use |
| --- | --- | --- |
| Supabase | `lib/supabaseClient.ts`, `lib/supabaseServer.ts`, most `app/api/**/route.ts` files | Auth, database CRUD, storage, admin operations, analytics counters, webhook logs |
| Stripe | `lib/stripe.ts`, `lib/credits.ts`, `lib/transferToSeller.ts`, `app/api/stripe/**`, `app/api/credits/**`, `app/api/create-payment-intent`, `app/api/webhooks/stripe` | Subscription billing, checkout, payment intents, seller payouts, Connect onboarding |
| OpenAI | `lib/openai.js`, `app/api/ai-generate/route.ts`, `app/components/ChatAssistant.tsx` flow | AI generation and assistant responses in parts of remix / assistant flows |
| Google Gemini | `lib/ai/**`, `app/api/decision-layer/**`, `app/api/community-assistant`, `app/api/marketplace-assistant`, `app/api/creator-agent`, `app/api/marketplace/bundles/suggest` | Decision Layer reasoning, commerce recommendations, moderation, AI chat, bundle suggestions |
| Replicate | `lib/replicate.ts`, `app/api/ai-generate/route.ts`, `app/api/lightweight/evaluate`, `app/api/decision-layer-audio/evaluate`, `app/api/decision-layer-video/evaluate` | Audio/video/image generation and analysis support |
| fal.ai | `app/api/ai-generate/route.ts`, usage pricing in `lib/ai/genUsage.ts` | Additional media generation models in remix / generation flow |
| ElevenLabs | `app/api/decision-layer/tts/route.ts`, `lib/ai/elevenlabsUsage.ts` | Text-to-speech voice output for Decision Layer |
| Nodemailer / SMTP | `lib/email.ts`, `app/api/contact/route.ts`, `app/api/send-purchase-email/route.ts`, notification / DMCA routes | Contact form mail, purchase mail, low-balance mail, compliance mail |
| FFmpeg / FFprobe | `app/api/decision-layer/utils/frame-extractor.ts`, media analysis routes | Extract video frames and audio tracks before AI analysis |

## AI Environment Keys

These are the AI-related environment variable names used in the repo. Secret values should not be committed or shared.

| Env Var | Service | Main Files Using It | Use |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI | `lib/openai.js`, `app/api/ai-generate/route.ts` | Used for OpenAI-backed generation / assistant behavior. |
| `GEMINI_API_KEY` | Google Gemini | `lib/ai/*.ts`, `app/api/chat-assistant/route.ts`, `app/api/community-assistant/route.ts`, `app/api/marketplace-assistant/route.ts`, `app/api/decision-layer/**`, `app/api/ai-suggest/route.ts`, `app/api/ai-reverse/route.ts`, `app/api/ai/analyze-asset/route.ts`, `app/api/marketplace/bundles/suggest/route.ts` | Main reasoning and analysis key used across assistants, Decision Layer, commerce agents, and metadata suggestions. |
| `REPLICATE_API_TOKEN` | Replicate | `lib/replicate.ts`, `app/api/decision-layer-audio/evaluate/route.ts`, `app/api/decision-layer-video/evaluate/route.ts`, `app/api/lightweight/evaluate/route.ts`, `app/api/ai-generate/route.ts`, `app/api/marketplace/analyze/audio-analysis.ts` | Used for media analysis and some generation pipelines. |
| `FAL_AI_KEY` | fal.ai | `app/api/ai-generate/route.ts` | Used for fal.ai generation models in the remix / generation flow. |
| `ELEVENLABS_API_KEY` | ElevenLabs | `app/api/decision-layer/tts/route.ts` | Used for text-to-speech audio generation. |
| `ELEVENLABS_VOICE_ID` | ElevenLabs | `app/api/decision-layer/tts/route.ts` | Selects the TTS voice. |
| `ELEVENLABS_MODEL_ID` | ElevenLabs | `app/api/decision-layer/tts/route.ts` | Selects the TTS model variant. |

## Internal API Route Inventory

### 1. Account, Admin, Pricing

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Delete account | `/api/account/delete` | `POST` | `app/profile/page.tsx` | Supabase, Stripe | Deletes the signed-in user, clears user records, and cancels active Stripe subscriptions. |
| Assign plan manually | `/api/admin/assign-plan` | `POST` | Server/admin utility | Supabase | Assigns a plan to a user from admin flows or backend scripts. |
| Cancel subscription from admin | `/api/admin/cancel-subscription` | `POST` | Server/admin utility | Stripe, Supabase | Marks a subscription to cancel at period end and updates subscription tables. |
| Manage discount rules | `/api/admin/discounts` | `GET`, `POST`, `PATCH`, `DELETE` | `app/superadmin/pricing/page.tsx` | Stripe, Supabase | Creates and manages promo / coupon style discount records. |
| Manage DMCA records | `/api/admin/dmca` | `GET`, `PATCH`, `DELETE` | `app/superadmin/dmca/page.tsx` | Supabase, Email | Admin inbox for DMCA notices, status updates, and deletion. |
| Manage licenses | `/api/admin/licenses` | `GET`, `POST`, `PATCH`, `DELETE` | `app/superadmin/licenses/page.tsx` | Supabase | CRUD for marketplace licensing options. |
| Moderation action | `/api/admin/moderation/action` | `POST` | `app/superadmin/moderation/page.tsx` | Supabase, Email | Approves, removes, or changes moderation state for flagged assets. |
| Fetch moderation flags | `/api/admin/moderation/flags` | `GET` | `app/superadmin/moderation/page.tsx` | Supabase | Returns flagged content queue for the moderation dashboard. |
| Manage subscription plans | `/api/admin/plans` | `GET`, `POST`, `PUT`, `DELETE` | `app/pricing/page.tsx`, `app/superadmin/pricing/SubscriptionPlans.tsx` | Stripe, Supabase | CRUD for paid plans and related Stripe price IDs. |
| Platform fee config | `/api/admin/platform-fee` | `GET`, `POST` | `app/superadmin/platform-fee/page.tsx`, `lib/transferToSeller.ts` | Supabase | Stores and returns the platform fee percentage used during payouts. |
| Credit pricing and top-up packs | `/api/admin/pricing` | `GET`, `PUT`, `POST`, `DELETE` | `app/credits/page.tsx`, `app/pricing/page.tsx`, `app/superadmin/pricing/page.tsx`, `app/superadmin/topup-packs/page.tsx` | Supabase | Manages credit pack pricing, subscription credit amounts, and pack visibility. |
| Royalty config | `/api/admin/royalty` | `GET`, `POST` | `app/superadmin/royalty/page.tsx`, `lib/transferToSeller.ts` | Supabase | Stores royalty percentage used when splitting creator payouts. |
| Backfill Stripe prices for plans | `/api/admin/sync-plans` | `POST` | Server/admin utility | Stripe, Supabase | Creates missing Stripe products/prices for active plans. |

### 2. AI Generation, Analysis, Remix

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Remix generation | `/api/ai-generate` | `POST` | `app/remix/studio/regenerate/[id]/page.tsx` | OpenAI, Gemini, Replicate, fal.ai, Supabase, FFmpeg | Runs the main AI generation / regeneration pipeline for remix studio. |
| Reverse prompt / analysis | `/api/ai-reverse` | `POST` | `app/remix/studio/regenerate/[id]/page.tsx` | Gemini | Reads an asset and suggests reverse-engineered prompt ideas. |
| Prompt suggestions | `/api/ai-suggest` | `POST` | `app/remix/studio/regenerate/[id]/page.tsx` | Gemini | Generates creative prompt suggestions for remixing. |
| Analyze uploaded asset | `/api/ai/analyze-asset` | `POST` | `app/creator/assets/create/page.tsx` | Gemini | Analyzes a single uploaded asset and suggests metadata / commerce hints. |
| Bulk asset analysis | `/api/ai/analyze-assets` | `POST` | Background / creator tooling | Gemini, Supabase | Batch analysis pipeline for multiple assets. |
| Creator assistant workflow | `/api/creator-agent` | `POST` | `app/remix/studio/regenerate/[id]/page.tsx` | Gemini | AI helper for creator workflow decisions and studio-side assistance. |
| Bulk categorize creator assets | `/api/creator/bulk-categorize` | `POST` | Background / creator tooling | Gemini, Supabase | Suggests categories / tags across multiple creator assets. |
| Bulk reprice creator assets | `/api/creator/bulk-reprice` | `POST` | Background / creator tooling | Supabase, Gemini agents | Applies automated repricing logic to creator assets. |

### 3. Assets, Marketplace, Bundles, Commerce

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Track asset card clicks | `/api/assets/[id]/click` | `POST` | Asset cards / marketplace interactions | Supabase | Increments `clicks_count` for asset engagement analytics. |
| Save or unsave asset | `/api/assets/[id]/save` | `POST`, `GET` | Asset detail / saved-state checks | Supabase | Toggles saved assets and returns whether the current user saved the asset. |
| Track asset detail views | `/api/assets/[id]/view` | `POST` | `app/assets/[id]/page.tsx` | Supabase | Increments `views_count` when an asset page opens, skipping the owner. |
| Moderate uploaded asset | `/api/assets/moderate` | `POST` | `app/marketplace/page.tsx`, `app/creator/assets/create/page.tsx` | Gemini moderation logic, Supabase | Checks upload safety / readiness before marketplace listing. |
| Resell purchased asset | `/api/assets/resell` | `POST` | `app/my-assets/page.tsx` | Supabase | Creates a resale listing for an already purchased asset. |
| Get bundle detail | `/api/bundles/[id]` | `GET` | `app/marketplace/bundles/[id]/page.tsx` | Supabase | Returns one bundle with its pricing and asset metadata. |
| Start bundle purchase | `/api/bundles/[id]/purchase` | `POST` | `app/marketplace/bundles/[id]/page.tsx` | Stripe, Supabase | Creates a Stripe PaymentIntent and a pending bundle purchase row. |
| Complete bundle purchase | `/api/bundles/[id]/complete` | `POST` | `app/marketplace/bundles/[id]/page.tsx` | Supabase, Stripe payout wrapper | Marks bundle purchase paid, grants ownership, logs transaction, triggers seller payout. |
| Auto-create bundles | `/api/bundles/auto-create` | `POST` | Background / admin automation | Gemini, Supabase | Scans creator assets and auto-builds public bundles when strong matches exist. |
| Create bundle manually | `/api/bundles/create` | `POST` | Creator bundle flow / backend use | Supabase | Creates a bundle from selected creator-owned assets and triggers bundle SEO optimization. |
| List bundles | `/api/bundles` | `GET` | `app/marketplace/page.tsx` | Supabase | Returns public bundles for marketplace browsing. |
| Ensure cart listing exists | `/api/cart/ensure-listing` | `POST` | `app/assets/[id]/page.tsx` | Supabase | Makes sure the asset has a valid listing row before checkout/cart actions. |
| Bundle search optimization | `/api/commerce/bundle-search-optimize` | `POST` | Background / bundle creation flow | Supabase, Gemini agent | Improves bundle metadata for search and discoverability. |
| Catalog strategy | `/api/commerce/catalog` | `POST` | Creator commerce tooling / automation | Supabase, Gemini agent | Builds catalog-level recommendations such as grouping and catalog structure. |
| Merchandising strategy | `/api/commerce/merchandising` | `POST`, `PATCH` | Creator commerce tooling / automation | Supabase, Gemini agent | Produces storefront / merchandising suggestions and stores updates. |
| Run post-launch optimization | `/api/commerce/optimize-all` | `POST` | Background / admin automation | Internal agents | Runs the post-launch optimizer cycle across assets. |
| Packaging recommendations | `/api/commerce/packaging` | `POST` | Creator commerce tooling | Supabase, Gemini agent | Suggests packaging / offer structure for assets. |
| Market price comparison | `/api/commerce/pricing/market` | `POST` | `app/marketplace/page.tsx` | Supabase, Gemini agent | Returns market-aware pricing comparisons used in marketplace evaluation UI. |
| Pricing strategy | `/api/commerce/pricing` | `POST` | Marketplace / creator pricing flows | Supabase, Gemini agent | Suggests or recalculates pricing for a specific asset. |
| Build commerce profile | `/api/commerce/profile/build` | `POST` | `app/marketplace/page.tsx` | Supabase, Gemini agent | Builds a detailed commerce profile from asset signals and decision-layer output. |
| Search optimization | `/api/commerce/search-optimize` | `POST` | Background / creator automation | Supabase, Gemini agent | Generates search-friendly titles, tags, and descriptions for assets. |
| Marketplace readiness evaluation | `/api/marketplace/evaluate` | `POST` | `app/marketplace/page.tsx` | Supabase, Gemini / analysis helpers | Evaluates whether an asset is marketplace-ready. |
| Marketplace purchase counts | `/api/marketplace/purchase-counts` | `GET` | `app/marketplace/page.tsx` | Supabase | Returns aggregated purchase counts for cards and ranking. |
| Suggest bundle ideas | `/api/marketplace/bundles/suggest` | `POST` | Backend / creator commerce flows | Gemini, Supabase | Suggests bundle combinations from a creator’s commerce-profiled assets. |

### 4. Decision Layer And Voice

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Audio decision-layer evaluation | `/api/decision-layer-audio/evaluate` | `POST` | `app/decision-layer/page.tsx` | Replicate | Evaluates uploaded audio for readiness, quality, and next actions. |
| Text decision-layer evaluation | `/api/decision-layer-text/evaluate` | `POST` | `app/decision-layer/page.tsx` | Gemini analysis helpers | Evaluates text content with decision-layer scoring. |
| Video decision-layer evaluation | `/api/decision-layer-video/evaluate` | `POST` | `app/decision-layer/page.tsx` | Gemini, Replicate, FFmpeg | Evaluates uploaded video including extracted frames and audio cues. |
| Decision-layer chat | `/api/decision-layer/agent-chat` | `POST` | `app/decision-layer/page.tsx` | Gemini | Main conversational brain for the Decision Layer UI. |
| Image / general decision-layer evaluation | `/api/decision-layer/evaluate` | `POST` | `app/decision-layer/page.tsx` | Gemini | Evaluates image-like uploads and returns readiness guidance. |
| Decision-layer greeting | `/api/decision-layer/greeting` | `POST` | Internal Decision Layer start flow | Gemini | Generates the initial assistant greeting / opening prompt. |
| Handoff debug logging | `/api/decision-layer/handoff-debug` | `POST` | `app/decision-layer/page.tsx` | Internal logging | Stores debug data for decision-layer handoff tracing. |
| Decision-layer TTS | `/api/decision-layer/tts` | `POST` | `app/decision-layer/page.tsx` | ElevenLabs | Converts decision-layer responses to spoken audio. |
| Lightweight readiness evaluation | `/api/lightweight/evaluate` | `POST` | Upload / marketplace lightweight analysis flow | Supabase, Replicate, FFmpeg | Fast single-file readiness check using the same analysis building blocks as Decision Layer. |

### 5. Credits, Billing, Stripe, Earnings

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Asset purchase payment intent | `/api/create-payment-intent` | `POST` | `app/purchase/checkout/page.tsx` | Stripe, Supabase | Creates a payment intent for single-asset checkout. |
| Buy top-up credits | `/api/credits/buy` | `POST` | `app/credits/page.tsx` | Stripe, Supabase, Email | Charges for a one-time credit pack purchase and records the transaction. |
| Check saved card | `/api/credits/check-card` | `POST` | `app/credits/page.tsx` | Stripe, Supabase | Checks whether the user already has a reusable card on file. |
| Available credit discounts | `/api/credits/discounts` | `GET` | `app/pricing/page.tsx` | Stripe, Supabase | Returns active discounts applicable to credit subscriptions. |
| Remove saved card | `/api/credits/remove-card` | `POST` | `app/credits/page.tsx` | Stripe, Supabase | Detaches the customer’s saved payment method. |
| Save card for auto-topup | `/api/credits/save-card` | `POST` | `app/credits/page.tsx` | Stripe, Supabase | Stores a card / payment method to support credit auto-topups. |
| Subscribe to credits plan | `/api/credits/subscribe` | `POST` | `app/pricing/page.tsx` | Stripe, Supabase | Starts a recurring credit subscription / plan checkout flow. |
| Credit subscription status / cancel | `/api/credits/subscription` | `GET`, `POST` | `app/credits/page.tsx`, `app/pricing/page.tsx` | Stripe, Supabase | Fetches credit subscription state and handles cancellation requests. |
| Validate coupon | `/api/credits/validate-coupon` | `POST` | `app/pricing/page.tsx` | Stripe, Supabase | Validates promo code eligibility before subscription purchase. |
| Seller earnings summary | `/api/seller/earnings` | `GET` | `app/creator/earnings/page.tsx` | Supabase | Returns creator earnings history and payout-related transaction data. |
| Send purchase email | `/api/send-purchase-email` | `POST` | `lib/fulfillPurchase.ts` | Email | Sends buyer confirmation email after successful purchase fulfillment. |
| Stripe onboarding status | `/api/stripe/check-status` | `POST` | `app/creator/creatorSettings/page.tsx` | Stripe, Supabase | Checks whether a creator has completed Stripe Connect onboarding. |
| Stripe Connect onboarding | `/api/stripe/connect` | `POST` | `app/creator/creatorSettings/page.tsx` | Stripe, Supabase | Creates or resumes a Connect onboarding link for creators. |
| Subscription checkout session | `/api/stripe/create-checkout` | `POST` | `app/checkout/[planId]/page.tsx` | Stripe, Supabase | Creates a Stripe Checkout session for subscription plans. |
| Stripe dashboard login link | `/api/stripe/create-login-link` | `POST` | `app/creator/earnings/page.tsx` | Stripe, Supabase | Creates a login link to the connected Stripe dashboard. |
| Create Stripe product / price | `/api/stripe/create-product` | `POST` | Server/admin utility | Stripe | Creates a recurring Stripe product and price for a plan. |
| Transfer seller payout | `/api/stripe/transfer-to-seller` | `POST` | Internal purchase / webhook flows | Stripe, Supabase | Thin wrapper that sends seller payout transfers using shared payout logic. |
| Stripe webhook receiver | `/api/webhooks/stripe` | `POST` | Stripe webhook | Stripe, Supabase, Email | Handles subscription lifecycle, payment confirmation, credits fulfillment, and related bookkeeping. |

### 6. Chat, Community, Notifications, Support

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| Asset-aware chat assistant | `/api/chat-assistant-assets` | `POST` | `app/components/ChatAssistantAssets.tsx` | Gemini | Chat assistant that answers based on asset context. |
| General chat assistant | `/api/chat-assistant` | `POST` | `app/components/ChatAssistant.tsx` | OpenAI, Gemini | General in-app assistant for marketplace / creator guidance. |
| Community assistant | `/api/community-assistant` | `POST` | `app/components/CommunityAssistant.tsx` | Gemini | AI helper for community interactions and quick prompts. |
| Contact form | `/api/contact` | `POST` | `app/contact/page.tsx` | Email | Sends website contact form submissions to support. |
| Marketplace assistant | `/api/marketplace-assistant` | `POST` | `app/components/MarketplaceAssistant.tsx` | Gemini | AI helper focused on marketplace questions and discovery. |
| Get notifications | `/api/notifications` | `GET` | `app/components/NotificationBell.tsx`, `app/credits/page.tsx` | Supabase | Returns user notification list and unread count. |
| Low-balance email alert | `/api/notifications/low-balance` | `POST` | `app/credits/page.tsx` | Email | Sends email when credits drop below the user’s chosen threshold. |
| Mark notifications read | `/api/notifications/mark-read` | `POST` | `app/components/NotificationBell.tsx` | Supabase | Marks one or all notifications as read. |
| Sale notification | `/api/notifications/sale` | `POST` | Internal purchase flow | Supabase, Email | Creates seller sale notifications after purchases. |
| Community post moderation | `/api/posts/moderate` | `POST` | `app/community/feed/page.tsx` | Supabase, Gemini moderation logic | Moderates newly created community posts. |
| Superadmin community signals | `/api/superadmin/community/signals` | `POST` | `app/superadmin/community/page.tsx` | Supabase | Returns analytics / signal summaries for community moderation and trends. |

### 7. Compliance, Reports, Debug, Background Jobs

| Feature Name | API Route | Method(s) | Used From | API / Service Used | Use |
| --- | --- | --- | --- | --- | --- |
| DMCA notice submit | `/api/dmca/notice` | `POST` | `app/dmca-policy/page.tsx` | Supabase, Email | Accepts formal DMCA notices and stores / emails them. |
| Marketplace report submit | `/api/dmca/report` | `POST` | `app/marketplace/page.tsx`, `app/assets/[id]/page.tsx` | Supabase, Email | Lets users report assets for infringement or trust-and-safety issues. |
| Creator reports feed | `/api/creator/reports` | `GET` | `app/components/CreatorSidebar.tsx`, `app/creator/reports/page.tsx` | Supabase | Returns AI / review / marketplace reports tied to a creator. |
| Debug log sink | `/api/debug/log` | `POST` | `app/marketplace/page.tsx` | Internal logging | Receives debug payloads from the marketplace UI. |
| Peek asset pricing | `/api/debug/peek-asset-prices` | `GET` | Debug / manual use | Supabase | Quick debug endpoint to inspect asset price values. |
| Run one named automation agent | `/api/run-agent/[type]` | `POST` | Background / secured internal use | Supabase, internal agents | Runs one automation agent such as pricing, bundling, or search optimization. |
| Run full cron automation set | `/api/run-agent/cron` | `POST`, `GET` | Cron / scheduler | Internal agents | Runs the full scheduled automation suite and returns per-agent results. |
| Run core agents | `/api/run-agent` | `GET` | Manual internal use | Internal agents | Runs core feature, pricing, merchandising, and catalog agents. |
| Run search-only agent | `/api/run-agent/search-only` | `POST`, `GET` | Cron / manual internal use | Internal agents | Runs just the search optimization batch agent. |
| Test webhook logging | `/api/test-webhook` | `GET` | Manual debug | Supabase | Inserts a test webhook log record to confirm DB connectivity. |

## Supabase Edge Functions

| Function | Path | Use |
| --- | --- | --- |
| Fulfill credits | `supabase/functions/fulfill-credits/index.ts` | Edge-side fulfillment for credit-related operations. |
| Run agents | `supabase/functions/run-agents/index.ts` | Edge-side entry point for agent execution / automation. |

## Notes

| Topic | Detail |
| --- | --- |
| Route source | All internal routes above come from `app/api/**/route.ts`. |
| "Used From" meaning | This column shows the main page/component caller found in the repo, or notes `background`, `manual`, or `internal` when the route is not directly called from a page. |
| AI service selection | Some AI routes can switch model/provider based on request mode, so one route may touch more than one provider. |
| Direct client data access | Some pages also read or write data directly with Supabase client code, so this file is the internal API inventory plus service usage summary, not a complete database query catalog. |
| Secret safety | I found real secret values present in `.env`. They should be treated as compromised if they were ever shared. Also `app/api/create-payment-intent/route.ts` currently logs `process.env.STRIPE_SECRET_KEY` and should be cleaned up. |
