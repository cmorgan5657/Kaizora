export interface PricingFaq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export const DEFAULT_PRICING_FAQS: PricingFaq[] = [
  {
    id: "subscription-credits",
    question: "How do credits work on subscriptions?",
    answer:
      "Subscription credits refresh monthly on both monthly and annual plans. Annual plans only change how often you are billed.",
    sort_order: 0,
  },
  {
    id: "cancel-anytime",
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancellation is set for the end of your current billing period, so you keep access and credits until that date.",
    sort_order: 1,
  },
  {
    id: "discount-codes",
    question: "Do discount codes still work?",
    answer:
      "Yes. Promo codes apply during subscription checkout. Annual plans can also show their own built-in advertised savings.",
    sort_order: 2,
  },
  {
    id: "run-out-of-credits",
    question: "What happens if I run out of credits early?",
    answer:
      "You can enable auto top-up from the credits page to recharge automatically before your subscription period ends.",
    sort_order: 3,
  },
];

export function normalizePricingFaqs(value: unknown): PricingFaq[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PRICING_FAQS;
  }

  const faqs = value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Partial<PricingFaq>;
      const question = typeof record.question === "string"
        ? record.question.trim()
        : "";
      const answer = typeof record.answer === "string"
        ? record.answer.trim()
        : "";

      if (!question || !answer) {
        return null;
      }

      return {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : `faq_${index + 1}`,
        question,
        answer,
        sort_order:
          typeof record.sort_order === "number" && Number.isFinite(record.sort_order)
            ? record.sort_order
            : index,
      };
    })
    .filter((item): item is PricingFaq => item !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  return faqs;
}
