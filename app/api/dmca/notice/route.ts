import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendDmcaNoticeEmail } from "@/lib/email";

// Public endpoint — copyright owners filing a DMCA takedown notice
// are often not registered users, so no auth is required.
const DMCA_AGENT_EMAIL = "dmca@kaizora.app";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      complainant_name,
      complainant_email,
      complainant_phone,
      complainant_address,
      copyrighted_work,
      infringing_url,
      good_faith,
      accuracy,
      signature,
    } = body;

    // ── Validate required fields ──
    const missing: string[] = [];
    if (!complainant_name?.trim()) missing.push("full legal name");
    if (!complainant_email?.trim()) missing.push("email");
    if (!complainant_address?.trim()) missing.push("mailing address");
    if (!copyrighted_work?.trim()) missing.push("copyrighted work description");
    if (!infringing_url?.trim()) missing.push("infringing URL");
    if (!signature?.trim()) missing.push("electronic signature");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Please provide: ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(complainant_email.trim())) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    if (!good_faith || !accuracy) {
      return NextResponse.json(
        { error: "Both the good-faith and accuracy statements must be confirmed." },
        { status: 400 },
      );
    }

    // ── Store the notice ──
    const { error: insertErr } = await supabaseAdmin
      .from("dmca_notices")
      .insert({
        complainant_name: complainant_name.trim(),
        complainant_email: complainant_email.trim(),
        complainant_phone: complainant_phone?.trim() || null,
        complainant_address: complainant_address.trim(),
        copyrighted_work: copyrighted_work.trim(),
        infringing_url: infringing_url.trim(),
        signature: signature.trim(),
        status: "pending",
      });

    if (insertErr) {
      console.error("[dmca/notice] insert failed", insertErr);
      return NextResponse.json(
        { error: "Could not submit your notice. Please try again." },
        { status: 500 },
      );
    }

    // ── Email the designated DMCA agent (fire-and-forget) ──
    sendDmcaNoticeEmail({
      to: DMCA_AGENT_EMAIL,
      complainantName: complainant_name.trim(),
      complainantEmail: complainant_email.trim(),
      complainantPhone: complainant_phone?.trim() || "",
      complainantAddress: complainant_address.trim(),
      copyrightedWork: copyrighted_work.trim(),
      infringingUrl: infringing_url.trim(),
      signature: signature.trim(),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
