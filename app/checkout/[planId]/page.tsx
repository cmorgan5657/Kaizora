"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface CheckoutPageProps {
  planId: string;
}

export default function CheckoutPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const router = useRouter();
  const { planId } = use(params);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    initiateCheckout();
  }, [planId]);

  async function initiateCheckout() {
    // Validate plan ID
    if (!planId) {
      alert("No plan selected");
      router.push("/");
      return;
    }

    // Check if user is logged in
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Redirect to login, then back here
      router.push(`/auth/signin?redirect=/checkout/${planId}`);
      return;
    }

    setCreating(true);

    try {
      // Create Stripe checkout session
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          userId: user.id,
          email: user.email,
        }),
      });

      const data = await response.json();

      if (data.success && data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        alert(
          "Failed to create checkout session: " +
            (data.error || "Unknown error"),
        );
        router.push("/");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout");
      router.push("/");
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm text-gray-400">
          {creating ? "Redirecting to checkout..." : "Loading..."}
        </p>
      </div>
    </div>
  );
}
