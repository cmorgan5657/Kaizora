import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import {
  DEFAULT_PRICING_FAQS,
  normalizePricingFaqs,
  type PricingFaq,
} from "@/lib/pricingFaqs";

const SETTINGS_KEY = "pricing_faqs";

async function readFaqs() {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("value_text")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.value_text) {
    return DEFAULT_PRICING_FAQS;
  }

  try {
    return normalizePricingFaqs(JSON.parse(data.value_text));
  } catch {
    return DEFAULT_PRICING_FAQS;
  }
}

async function writeFaqs(faqs: PricingFaq[]) {
  const { error } = await supabaseAdmin.from("platform_settings").upsert(
    {
      key: SETTINGS_KEY,
      value_text: JSON.stringify(faqs),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw error;
  }
}

export async function GET() {
  try {
    const faqs = await readFaqs();
    return NextResponse.json({ faqs });
  } catch (error: any) {
    return NextResponse.json({
      faqs: DEFAULT_PRICING_FAQS,
      db_error: error?.message || "Failed to load FAQs",
      hint: "platform_settings table missing — run the platform settings SQL to enable FAQ persistence",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { question, answer, sort_order } = await req.json();
    if (!question || !answer) {
      return NextResponse.json(
        { error: "Question and answer are required" },
        { status: 400 },
      );
    }

    const faqs = await readFaqs();
    const faq: PricingFaq = {
      id: `faq_${Date.now()}`,
      question: String(question).trim(),
      answer: String(answer).trim(),
      sort_order: Number(sort_order) || faqs.length,
    };

    const nextFaqs = normalizePricingFaqs([...faqs, faq]);
    await writeFaqs(nextFaqs);

    return NextResponse.json({ success: true, faqs: nextFaqs });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Could not save FAQ. Did you run the platform_settings SQL?",
        details: error?.message || "Failed to create FAQ",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, question, answer, sort_order } = await req.json();
    if (!id || !question || !answer) {
      return NextResponse.json(
        { error: "id, question, and answer are required" },
        { status: 400 },
      );
    }

    const faqs = await readFaqs();
    const nextFaqs = normalizePricingFaqs(
      faqs.map((faq) =>
        faq.id === id
          ? {
              ...faq,
              question: String(question).trim(),
              answer: String(answer).trim(),
              sort_order:
                typeof sort_order === "number" ? sort_order : Number(sort_order) || 0,
            }
          : faq,
      ),
    );

    await writeFaqs(nextFaqs);
    return NextResponse.json({ success: true, faqs: nextFaqs });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Could not update FAQ. Did you run the platform_settings SQL?",
        details: error?.message || "Failed to update FAQ",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const faqs = await readFaqs();
    const nextFaqs = normalizePricingFaqs(faqs.filter((faq) => faq.id !== id));
    await writeFaqs(nextFaqs);

    return NextResponse.json({ success: true, faqs: nextFaqs });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Could not delete FAQ. Did you run the platform_settings SQL?",
        details: error?.message || "Failed to delete FAQ",
      },
      { status: 500 },
    );
  }
}
