import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";

type CreateSignalBody = {
  tag?: string;
  tag_color?: string | null;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  published_at?: string | null;
};

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[signals:create:${requestId}] request received`);

  try {
    const token = getBearerToken(req);
    if (!token) {
      console.warn(`[signals:create:${requestId}] missing bearer token`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      console.warn(`[signals:create:${requestId}] invalid token`, authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authData.user;
    const email = user.email?.toLowerCase() || "";
    if (email !== SUPERADMIN_EMAIL.toLowerCase()) {
      console.warn(`[signals:create:${requestId}] forbidden user ${email}`);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as CreateSignalBody;
    const tag = typeof body.tag === "string" ? body.tag.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!tag || !title) {
      console.warn(`[signals:create:${requestId}] validation failed`, {
        tag,
        title,
      });
      return NextResponse.json(
        { error: "Title and tag are required." },
        { status: 400 },
      );
    }

    const payload = {
      tag,
      tag_color: normalizeNullableString(body.tag_color) || "#ef4444",
      title,
      subtitle: normalizeNullableString(body.subtitle),
      description: normalizeNullableString(body.description),
      published_at: normalizeDate(body.published_at),
    };

    console.log(`[signals:create:${requestId}] inserting signal`, {
      tag: payload.tag,
      title: payload.title,
      published_at: payload.published_at,
    });

    const { data, error } = await supabaseAdmin
      .from("signals")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error(`[signals:create:${requestId}] insert failed`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[signals:create:${requestId}] success`, { id: data.id });
    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error(`[signals:create:${requestId}] unexpected error`, error);
    return NextResponse.json(
      { error: error?.message || "Failed to create signal" },
      { status: 500 },
    );
  }
}
