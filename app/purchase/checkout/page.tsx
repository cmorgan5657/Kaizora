"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, CreditCard, X, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
// Load Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

// Real Stripe Payment Form Component
function StripePaymentForm({
  items,
  total,
  onSuccess,
  onClose,
}: {
  items: any[];
  total: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message || "An error occurred");
      setProcessing(false);
    } else {
      // Payment successful
      setProcessing(false);
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xs uppercase text-gray-600 font-light tracking-wider mb-3">
          Payment Information
        </h3>
        <div className="bg-white/5 border border-white/10 p-4">
          <PaymentElement />
        </div>
      </div>

      {errorMessage && (
        <div className="text-red-500 text-sm font-light bg-red-500/10 border border-red-500/30 p-3">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={processing || !stripe}
        className="w-full py-4 bg-white text-black hover:bg-gray-200 cursor-pointer disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-sm font-light flex items-center justify-center gap-2 transition-colors duration-300"
      >
        {processing ? (
          <>Processing...</>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Pay ${(total / 100).toFixed(2)}
          </>
        )}
      </button>

      <p className="text-xs text-gray-600 font-light flex items-center gap-2 justify-center">
        <Lock className="w-3 h-3" />
        Secure Payment Powered by Stripe
      </p>
    </form>
  );
}

// Skeleton Loader Component
function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <Skeleton className="h-4 w-24 mb-4 bg-white/10" />
          <Skeleton className="h-10 w-48 bg-white/10" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Skeleton className="h-4 w-40 mb-4 bg-white/10" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white/5 border border-white/10">
                  <Skeleton className="h-20 w-full bg-white/10" />
                  <div className="p-2 md:p-5 space-y-3">
                    <Skeleton className="h-4 w-full bg-white/10" />
                    <Skeleton className="h-3 w-16 bg-white/10" />
                    <Skeleton className="h-5 w-20 bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white/5 border border-white/10 p-3 md:p-6 space-y-4">
              <Skeleton className="h-4 w-20 bg-white/10" />
              <Skeleton className="h-20 w-full bg-white/10" />
              <Skeleton className="h-12 w-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Success Screen Component
function SuccessScreen({
  items,
  total,
  onClose,
}: {
  items: any[];
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-white/10 max-w-md w-full text-center p-8">
        <div className="flex justify-center mb-6">
          <CheckCircle2 className="w-16 h-16 text-green-500" />
        </div>

        <h2 className="text-2xl font-light mb-2">Payment Successful!</h2>
        <p className="text-gray-400 text-sm font-light mb-6">
          Your order has been confirmed
        </p>

        <div className="bg-white/5 border border-white/10 p-4 mb-6 text-left">
          <div className="text-xs uppercase text-gray-600 font-light tracking-wider mb-3">
            Order Summary
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between text-sm font-light"
              >
                <span className="text-gray-400 truncate mr-2">
                  {item.title}
                </span>
                <span className="text-white">
                  ${(item.price_cents / 100).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-white/10 flex justify-between font-light">
              <span>Total Paid</span>
              <span className="text-lg">${(total / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-600 font-light mb-6">
          A confirmation email has been sent to your email address
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 bg-white text-black hover:bg-gray-200 text-sm font-light transition-colors duration-300"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}

// Main Checkout Component
export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutSource, setCheckoutSource] = useState<"cart" | "direct">("cart");
  const [feePercent, setFeePercent] = useState<number>(0);

  function storageUrl(path?: string) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  function renderThumb(item: any) {
    const url = storageUrl(item.thumbnail);
    const contentType = item.content_type;

    if (contentType === "image" && url) {
      return (
        <img
          src={url}
          alt={item.title}
          className="w-full h-full object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">
        {contentType === "video" && "🎥"}
        {contentType === "audio" && "🎧"}
        {contentType === "code" && "💻"}
        {contentType === "text" && "📄"}
        {contentType === "prompt" && "✨"}
        {(!contentType || contentType === "other") && "📦"}
      </div>
    );
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.push("/login?redirectTo=/purchase/checkout");
      }
    });
    async function fetchFeePercent() {
      const { data } = await supabase
        .from("platform_settings")
        .select("value_number")
        .eq("key", "platform_fee_percent")
        .maybeSingle();
      setFeePercent(data?.value_number ?? 10);
    }
    fetchFeePercent();

    async function fetchItems() {
      const urlParams = new URLSearchParams(window.location.search);
      const cartIds = urlParams.get("cartIds")?.split(",").filter(Boolean) || [];
      const assetId = urlParams.get("assetId");
      const licenseId = urlParams.get("licenseId");

      if (cartIds.length > 0) {
        setCheckoutSource("cart");

        const { data: cartData, error: cartError } = await supabase
          .from("cart")
          .select(
            `
      *,
      asset_license:asset_licenses!license_id(
        id,
        price_override,
        license_type:license_types(*)
      )
    `,
          )
          .in("id", cartIds);

        if (cartError) {
          console.error("Cart fetch error:", cartError);
        }

        if (!cartData || cartData.length === 0) {
          setLoading(false);
          return;
        }

        const assetIds = cartData
          .map((item) => item.asset_id)
          .filter((id) => id != null);

        const { data: assetsData } = await supabase
          .from("assets")
          .select("id, content_type, owner_id")
          .in("id", assetIds);

        const assetDataMap = new Map(
          (assetsData || []).map((asset) => [asset.id, asset]),
        );

        const itemsWithContentType = cartData.map((item) => {
          const assetData = assetDataMap.get(item.asset_id);
          return {
            ...item,
            seller_id: assetData?.owner_id,
            content_type: assetData?.content_type,
            license: item.asset_license
              ? {
                  ...item.asset_license,
                  license_type: Array.isArray(item.asset_license.license_type)
                    ? item.asset_license.license_type[0]
                    : item.asset_license.license_type,
                }
              : null,
          };
        });

        console.log("Items with seller_id:", itemsWithContentType);

        setItems(itemsWithContentType);
        setLoading(false);
        return;
      }

      if (assetId) {
        setCheckoutSource("direct");

        const { data: assetData, error: assetError } = await supabase
          .from("assets")
          .select("id, title, storage_path, thumbnail_path, price_cents, content_type, owner_id, is_public")
          .eq("id", assetId)
          .single();

        if (assetError || !assetData?.is_public) {
          console.error("Asset checkout fetch error:", assetError);
          setLoading(false);
          return;
        }

        let licenseQuery = supabase
          .from("asset_licenses")
          .select(
            `
      id,
      price_override,
      is_available,
      license_type:license_types(*)
    `,
          )
          .eq("asset_id", assetId)
          .eq("is_available", true);

        if (licenseId) {
          licenseQuery = licenseQuery.eq("id", licenseId);
        }

        const { data: licensesData, error: licenseError } = await licenseQuery;
        if (licenseError) {
          console.error("License checkout fetch error:", licenseError);
        }

        const licenses = (licensesData || []).map((license) => ({
          ...license,
          license_type: Array.isArray(license.license_type)
            ? license.license_type[0]
            : license.license_type,
        }));

        const selectedLicense =
          licenses.length > 0
            ? licenses.reduce((prev, curr) => {
                const prevPrice =
                  prev.price_override ||
                  Math.round((assetData.price_cents || 0) * parseFloat(prev.license_type?.price_multiplier || 1));
                const currPrice =
                  curr.price_override ||
                  Math.round((assetData.price_cents || 0) * parseFloat(curr.license_type?.price_multiplier || 1));
                return currPrice < prevPrice ? curr : prev;
              })
            : null;

        const priceCents = selectedLicense
          ? selectedLicense.price_override ||
            Math.round((assetData.price_cents || 0) * parseFloat(selectedLicense.license_type?.price_multiplier || 1))
          : assetData.price_cents || 0;

        if (priceCents <= 0) {
          setLoading(false);
          return;
        }

        setItems([
          {
            id: `direct-${assetData.id}`,
            user_id: null,
            asset_id: assetData.id,
            listing_id: null,
            license_id: selectedLicense?.id || null,
            title: assetData.title,
            price_cents: priceCents,
            thumbnail: assetData.thumbnail_path || assetData.storage_path,
            seller_id: assetData.owner_id,
            content_type: assetData.content_type,
            license: selectedLicense,
          },
        ]);
        setLoading(false);
        return;
      }

      setLoading(false);
    }

    fetchItems();

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const total = items.reduce((acc, cur) => acc + (cur.price_cents || 0), 0);
  const platformFeeCents = Math.floor((total * feePercent) / 100);
  const sellerReceivesCents = total - platformFeeCents;

  // Create payment intent when modal opens
  const handleOpenPaymentModal = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: total,
          userId: user?.id,
          items: items,
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert("Error creating payment: " + data.error);
        return;
      }

      setClientSecret(data.clientSecret);
      setShowPaymentModal(true);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to initialize payment");
    }
  };

  const handlePaymentSuccess = async () => {
    // Fulfillment — ownership, license, seller payout, royalty, certificate
    // and email — now runs server-side via the Stripe webhook
    // (see lib/fulfillPurchase.ts), so it completes even if this tab closes.
    // The browser only clears the cart and shows the success screen.
    try {
      if (checkoutSource === "cart") {
        const cartIds = items.map((item) => item.id);
        await supabase.from("cart").delete().in("id", cartIds);
      }
    } catch (error) {
      console.error("Cart cleanup error:", error);
    }
    setShowPaymentModal(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    router.push("/marketplace");
  };

  if (loading) {
    return <CheckoutSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-sm text-gray-400 font-light">
          No items to checkout
        </div>
      </div>
    );
  }

  const appearance = {
    theme: "night" as const,
    variables: {
      colorPrimary: "#ffffff",
      colorBackground: "#000000",
      colorText: "#ffffff",
      colorDanger: "#ef4444",
      borderRadius: "0px",
    },
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 cursor-pointer hover:text-gray-400 text-xs font-light mb-3 md:mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Cart
          </button>

          <h1 className="text-xl md:text-4xl font-extralight tracking-tight">Checkout</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
        <div className="grid lg:grid-cols-3 gap-4 md:gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-xs uppercase text-gray-600 font-light tracking-wider mb-2 md:mb-4">
              Order Summary ({items.length}{" "}
              {items.length === 1 ? "item" : "items"})
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/5 overflow-hidden transition-all duration-300 flex flex-col"
                >
                  <div className="h-14 md:h-20 bg-black flex items-center justify-center overflow-hidden shrink-0">
                    {renderThumb(item)}
                  </div>

                  <div className="p-2 md:p-5 flex flex-col">
                    <h3 className="text-xs md:text-base font-light line-clamp-2">
                      {item.title || "Untitled asset"}
                    </h3>

                    <div className="space-y-1 mt-2">
                      {item.content_type && (
                        <div className="text-xs text-gray-600 font-light uppercase tracking-wider">
                          {item.content_type}
                        </div>
                      )}
                      {item.license?.license_type && (
                        <div className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded border border-red-500/30 inline-block">
                          {item.license.license_type.name}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 md:mt-4 text-sm md:text-lg font-light text-white">
                      ${(item.price_cents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-3 md:space-y-6">
              <div className="bg-white/5 border border-white/10 p-3 md:p-6">
                <h2 className="text-xs uppercase text-gray-600 font-light tracking-wider mb-2 md:mb-4">
                  Order Summary
                </h2>

                {/* Items */}
                <div className="space-y-2 mb-3 md:mb-4">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm font-light text-gray-400">
                      <div className="min-w-0 mr-2">
                        <span className="truncate block">{item.title}</span>
                        {item.license?.license_type?.name && (
                          <span className="text-[10px] text-red-400/70">{item.license.license_type.name}</span>
                        )}
                      </div>
                      <span className="text-white shrink-0">${(item.price_cents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Breakdown */}
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex justify-between text-sm font-light text-gray-400">
                    <span>Subtotal</span>
                    <span className="text-white">${(total / 100).toFixed(2)}</span>
                  </div>

                  {feePercent > 0 && (
                    <>
                      <div className="flex justify-between text-xs font-light text-gray-600">
                        <span>Platform fee ({feePercent}%)</span>
                        <span className="text-yellow-500/70">−${(platformFeeCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-light text-gray-600">
                        <span>Seller receives</span>
                        <span className="text-emerald-500/70">${(sellerReceivesCents / 100).toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  <div className="pt-2 border-t border-white/10 flex justify-between text-base md:text-xl font-light">
                    <span>You pay</span>
                    <span>${(total / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleOpenPaymentModal}
                className="w-full py-2.5 md:py-4 bg-white text-black hover:bg-gray-200 cursor-pointer text-xs md:text-sm font-light flex items-center justify-center gap-2 transition-colors duration-300"
              >
                <CreditCard className="w-4 h-4" />
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPaymentModal && clientSecret && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto" data-lenis-prevent>
            <div className="sticky top-0 bg-black border-b border-white/10 p-3 md:p-6 flex items-center justify-between">
              <h2 className="text-base md:text-xl font-light">Complete Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-600 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 md:p-6">
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance }}
              >
                <StripePaymentForm
                  items={items}
                  total={total}
                  onSuccess={handlePaymentSuccess}
                  onClose={() => setShowPaymentModal(false)}
                />
              </Elements>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <SuccessScreen
          items={items}
          total={total}
          onClose={handleSuccessClose}
        />
      )}
    </div>
  );
}
