// @ts-nocheck
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data } = await supabase
      .from("ai_controls")
      .select("enabled")
      .eq("key", "agents_enabled")
      .single();

    if (!data?.enabled) {
      return new Response("AI disabled");
    }

    // Call your Next.js API with POST
    const response = await fetch(
      "https://KAIZORA-nextjs.vercel.app/api/run-agent/cron",
      { method: "POST" },
    );

    const result = await response.text();
    console.log("Result:", result);

    return new Response("Agents completed: " + result);
  } catch (error) {
    console.error("Error:", error);
    return new Response("Error: " + error.message, { status: 500 });
  }
});
