"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ArrowRight } from "phosphor-react";
import { supabase } from "@/lib/supabaseClient";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  async function loadSubscription() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      // Get user's subscription
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select(
          `
          *,
          subscription_plans:plan_id(name, price_cents)
        `,
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      setSubscription(sub);
    } catch (error) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  const plan = subscription?.subscription_plans;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Success Section */}
      <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-6">
            <CheckCircle size={40} className="text-green-400" weight="fill" />
          </div>

          <h1 className="text-3xl md:text-4xl font-light mb-3">
            Subscription Activated!
          </h1>

          <p className="text-gray-400 text-lg">
            Welcome to {plan?.name || "your new plan"}
          </p>
        </div>

        {/* Plan Details Card */}
        {subscription && (
          <div className="border border-white/10 bg-white/5 p-8 mb-8">
            <div className="grid md:grid-cols-3 gap-6 text-center md:text-left">
              {/* Plan Name */}
              <div>
                <div className="text-sm text-gray-500 mb-1">Plan</div>
                <div className="text-xl font-light">{plan?.name}</div>
              </div>

              {/* Price */}
              <div>
                <div className="text-sm text-gray-500 mb-1">Price</div>
                <div className="text-xl font-light">
                  ${(plan?.price_cents / 100).toFixed(0)}
                  <span className="text-sm text-gray-600">/month</span>
                </div>
              </div>

              {/* Status */}
              <div>
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className="inline-block px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 text-sm">
                  Active
                </div>
              </div>
            </div>

            {/* Billing Period */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="text-sm text-gray-500 mb-2">
                Current Billing Period
              </div>
              <div className="text-sm text-gray-400">
                {new Date(
                  subscription.current_period_start,
                ).toLocaleDateString()}
                {" - "}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* What's Next */}
        <div className="border border-white/10 bg-white/5 p-8 mb-8">
          <h2 className="text-xl font-light mb-4">What's Next?</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 text-sm border border-red-500/30 flex-shrink-0 mt-0.5">
                1
              </div>
              <div>
                <div className="font-light mb-1">Start Uploading Content</div>
                <div className="text-sm text-gray-500">
                  Head to your dashboard and upload your first AI-generated
                  assets
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 text-sm border border-red-500/30 flex-shrink-0 mt-0.5">
                2
              </div>
              <div>
                <div className="font-light mb-1">Explore the Marketplace</div>
                <div className="text-sm text-gray-500">
                  Browse assets from other creators and find inspiration
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 text-sm border border-red-500/30 flex-shrink-0 mt-0.5">
                3
              </div>
              <div>
                <div className="font-light mb-1">Manage Your Subscription</div>
                <div className="text-sm text-gray-500">
                  Update payment method, view invoices, or change your plan
                  anytime
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white hover:shadow-lg hover:shadow-red-500/50 transition-all duration-300"
          >
            <span>Go to Dashboard</span>
            <ArrowRight size={20} weight="bold" />
          </button>

          <button
            onClick={() => router.push("/marketplace")}
            className="flex-1 px-6 py-3 border-2 border-white/20 hover:border-red-500/50 bg-white/5 hover:bg-red-500/10 transition-all duration-300"
          >
            Explore Marketplace
          </button>
        </div>

        {/* Receipt Info */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            A receipt has been sent to your email address.
          </p>
        </div>
      </div>
    </div>
  );
}
