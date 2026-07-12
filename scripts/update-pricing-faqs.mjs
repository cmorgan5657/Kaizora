import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const faqs = [
  {
    id: "what-is-kaizora",
    question: "What is Kaizora?",
    answer:
      "Kaizora is a platform where creators can evaluate, improve, and monetize their content. It combines a decision layer that coaches you on your work, a Remix Studio for transforming content into finished products, a marketplace for selling your assets, and a community where creators connect and compete in content challenges.",
    sort_order: 0,
  },
  {
    id: "who-is-kaizora-for",
    question: "Who is Kaizora for?",
    answer:
      "Creators who want to understand what's working in their content and turn more of it into revenue - especially the unused work sitting in your folders. Whether you're just starting out or already selling, Kaizora helps you go to market with confidence.",
    sort_order: 1,
  },
  {
    id: "what-plans-does-kaizora-offer",
    question: "What plans does Kaizora offer?",
    answer:
      "Kaizora offers monthly and yearly subscription plans. Yearly plans come with a 20% discount compared to paying month-to-month.",
    sort_order: 2,
  },
  {
    id: "how-do-credits-work",
    question: "How do credits work?",
    answer:
      "Your plan includes a monthly allotment of credits, which you use for platform features like decision layer evaluations. Credits reset each month and unused credits expire - they do not roll over.",
    sort_order: 3,
  },
  {
    id: "what-happens-if-i-run-out-of-credits-before-the-month-ends",
    question: "What happens if I run out of credits before the month ends?",
    answer:
      "You have two options: top up with additional credits at any time, or upgrade to a higher plan for a larger monthly allotment.",
    sort_order: 4,
  },
  {
    id: "do-credits-expire",
    question: "Do credits expire?",
    answer:
      "Yes. Credits expire at the end of each monthly cycle and do not carry over to the next month.",
    sort_order: 5,
  },
  {
    id: "whats-the-difference-between-the-standard-plan-and-pro",
    question: "What's the difference between the standard plan and Pro?",
    answer:
      "Pro plan members get higher-frequency optimization from the marketplace AI agents, meaning their listed assets are monitored and optimized more often. [Add other Pro benefits - credit amounts, pricing, and feature differences - as finalized.]",
    sort_order: 6,
  },
  {
    id: "can-i-switch-between-monthly-and-yearly-billing",
    question: "Can I switch between monthly and yearly billing?",
    answer:
      "Yes, you can upgrade or change your plan at any time. [Confirm proration policy before publishing.]",
    sort_order: 7,
  },
  {
    id: "what-is-the-decision-layer",
    question: "What is the decision layer?",
    answer:
      "The decision layer is Kaizora's evaluation and coaching engine. It reviews the content you upload and gives you specific, personalized feedback on what's working, what needs improvement, and what to do next.",
    sort_order: 8,
  },
  {
    id: "how-does-it-personalize-the-coaching",
    question: "How does it personalize the coaching?",
    answer:
      "Before your evaluation, you'll answer a set of specific questions about your content, your goals, and your intent. Your answers are then cross-referenced against the content you upload - so the coaching you receive reflects both what you made and what you were trying to achieve, not generic advice.",
    sort_order: 9,
  },
  {
    id: "what-kind-of-content-should-i-submit-first",
    question: "What kind of content should I submit first?",
    answer:
      "Start with something where you feel uncertain, not fully confident, or stuck on what to improve. That's where the decision layer is most useful.",
    sort_order: 10,
  },
  {
    id: "does-an-evaluation-use-credits",
    question: "Does an evaluation use credits?",
    answer:
      "Yes, evaluations consume credits from your monthly allotment.",
    sort_order: 11,
  },
  {
    id: "how-does-the-kaizora-marketplace-work",
    question: "How does the Kaizora marketplace work?",
    answer:
      "List your assets, choose a license type and price, and buyers can purchase them directly. The marketplace is run by several AI agents that continuously monitor and optimize your listed assets to improve their performance.",
    sort_order: 12,
  },
  {
    id: "what-do-the-ai-agents-actually-do",
    question: "What do the AI agents actually do?",
    answer:
      "They monitor how your assets perform in the marketplace and optimize them - refining how your work is positioned so it reaches the right buyers. Pro plan members receive this optimization at a higher frequency.",
    sort_order: 13,
  },
  {
    id: "what-fees-does-kaizora-charge",
    question: "What fees does Kaizora charge?",
    answer:
      "Kaizora takes a 15% fee on marketplace transactions. The rest goes to you.",
    sort_order: 14,
  },
  {
    id: "what-is-the-remix-studio",
    question: "What is the Remix Studio?",
    answer:
      "The Remix Studio lets you transform content - including assets purchased under a Commercial license - into new, finished products. It's designed to help you apply the coaching from the decision layer, especially to unused content you can now turn into sellable work.",
    sort_order: 15,
  },
  {
    id: "what-license-types-does-kaizora-offer",
    question: "What license types does Kaizora offer?",
    answer:
      "Three: Personal Use, Commercial Use, and Royalty-Free. The creator chooses which license(s) to offer when listing an asset.",
    sort_order: 16,
  },
  {
    id: "do-kaizora-licenses-apply-outside-the-platform",
    question: "Do Kaizora licenses apply outside the platform?",
    answer:
      "Kaizora licenses apply only to the Kaizora platform.",
    sort_order: 17,
  },
  {
    id: "what-does-the-personal-use-license-allow",
    question: "What does the Personal Use license allow?",
    answer:
      "Personal Use is the most affordable tier. Buyers can view the asset on Kaizora and download it for personal, non-commercial projects. They cannot use it in commercial or revenue-generating work, remix it, create derivative works, or resell or redistribute it. Best for buyers who simply want an asset for personal projects.",
    sort_order: 18,
  },
  {
    id: "what-does-the-commercial-use-license-allow",
    question: "What does the Commercial Use license allow?",
    answer:
      "Buyers can use the asset in commercial, revenue-generating projects, remix it in the Remix Studio, and resell the asset or sell remixes of it - with a royalty paid back to the original creator.",
    sort_order: 19,
  },
  {
    id: "how-do-royalties-work-under-the-commercial-license",
    question: "How do royalties work under the Commercial license?",
    answer:
      "When a buyer resells the asset or sells a remix of it, the license stays locked to Commercial - it cannot be changed. A platform royalty (set by Kaizora, 3% by default) from every downstream sale is paid to the original creator, forever. Remix lineage is tracked automatically, so the original creator is always credited and paid.",
    sort_order: 20,
  },
  {
    id: "what-does-the-royalty-free-license-allow",
    question: "What does the Royalty-Free license allow?",
    answer:
      "Royalty-Free is the highest tier: the buyer owns their copy outright. They can use the asset commercially without restriction, remix it freely, resell it, sell remixes, and choose any license when reselling - licenses are not locked. No royalty is ever owed to the original creator.",
    sort_order: 21,
  },
  {
    id: "which-license-should-i-choose-as-a-creator",
    question: "Which license should I choose as a creator?",
    answer:
      "Personal Use if you want to offer an affordable option for non-commercial buyers. Commercial Use if you want your work used and remixed commercially while earning a cut every time it changes hands. Royalty-Free if you're pricing your work as a one-time, full-rights sale.",
    sort_order: 22,
  },
  {
    id: "what-is-remix-lineage",
    question: "What is remix lineage?",
    answer:
      "Every remix on Kaizora carries an automatic record tracing it back to the original creator. This ensures original creators are always credited - and under Commercial licenses, always paid - no matter how many times a work is remixed or resold.",
    sort_order: 23,
  },
  {
    id: "what-is-the-kaizora-community",
    question: "What is the Kaizora community?",
    answer:
      "A space where creators connect, share their experience, and compete in content challenges. Challenges are a great way to sharpen your skills, get your work evaluated, and build visibility on the platform.",
    sort_order: 24,
  },
  {
    id: "how-do-i-share-feedback-or-report-an-issue",
    question: "How do I share feedback or report an issue?",
    answer:
      "Early-access members can share feedback directly in our Slack channel - we read everything, and your input directly shapes the product. [Add general support contact/email for broader users.]",
    sort_order: 25,
  },
  {
    id: "is-kaizora-finished",
    question: "Is Kaizora finished?",
    answer:
      "Kaizora is in early access and improving quickly. Our goal is to understand who you are as a creator and build tools that suit you - the first version will need work, but we'll learn and grow together.",
    sort_order: 26,
  },
];

const { error } = await supabase.from("platform_settings").upsert(
  {
    key: "pricing_faqs",
    value_text: JSON.stringify(faqs),
    updated_at: new Date().toISOString(),
  },
  { onConflict: "key" },
);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Updated pricing_faqs with ${faqs.length} FAQs`);
