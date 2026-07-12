"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Trash2, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getLicenseRule } from "@/lib/licenses";
export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Calculate total
  const total = items.reduce((acc, cur) => acc + (cur.price_cents || 0), 0);

  // Load cart items from Supabase
  useEffect(() => {
    async function loadCart() {
      setLoading(true);

      // Check if user is logged in
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

      // Fetch cart items
      // Fetch cart items with license info
      const { data, error } = await supabase
        .from("cart")
        .select(
          `
    *,
    asset_license:asset_licenses!license_id(
      id,
      price_override,
      license_type:license_types(*)
    )
  `
        )
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading cart:", error);
      } else {
        // Parse license data
        const parsedItems = (data || []).map((item) => ({
          ...item,
          license: item.asset_license
            ? {
                ...item.asset_license,
                license_type: Array.isArray(item.asset_license.license_type)
                  ? item.asset_license.license_type[0]
                  : item.asset_license.license_type,
              }
            : null,
        }));
        setItems(parsedItems);
      }

      setLoading(false);
    }

    loadCart();
  }, []);

  // Remove item from cart
  async function handleRemoveItem(cartId: string) {
    const { error } = await supabase.from("cart").delete().eq("id", cartId);

    if (error) {
      console.error("Error removing item:", error);
      return;
    }

    // Update local state
    setItems((prev) => prev.filter((item) => item.id !== cartId));
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white px-3 md:px-6 py-4 md:py-12">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Cart Items Skeleton */}
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 bg-white/5 border border-white/10 p-4"
              >
                {/* Thumbnail Skeleton */}
                <Skeleton className="w-14 h-14 bg-white/10 shrink-0" />

                {/* Title + Price Skeleton */}
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 bg-white/10" />
                  <Skeleton className="h-3 w-16 bg-white/10" />
                </div>

                {/* Remove Button Skeleton */}
                <Skeleton className="w-4 h-4 bg-white/10" />
              </div>
            ))}
          </div>

          {/* Summary Skeleton */}
          <div className="mt-8 bg-white/5 border border-white/10 p-6 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24 bg-white/10" />
              <Skeleton className="h-4 w-16 bg-white/10" />
            </div>

            <div className="flex justify-between pt-3 border-t border-white/10">
              <Skeleton className="h-4 w-12 bg-white/10" />
              <Skeleton className="h-6 w-20 bg-white/10" />
            </div>

            <Skeleton className="w-full h-12 bg-white/10 mt-6" />
          </div>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white px-3 md:px-6 py-4 md:py-12">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
        </div>
        <div className="relative max-w-4xl mx-auto text-center py-16 md:py-32">
          <ShoppingBag className="w-12 h-12 mx-auto text-gray-700 mb-6" />
          <h2 className="text-lg font-light text-gray-400 mb-2">
            Please log in to view your cart
          </h2>
          <button
            onClick={() => router.push("/login?redirectTo=/cart")}
            className="mt-8 px-6 py-3 bg-linear-to-r from-red-600 to-red-700 text-white text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-3 md:px-6 py-4 md:py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Empty State */}
        {items.length === 0 && (
          <div className="text-center py-16 md:py-32 bg-white/5 border border-white/10">
            <ShoppingBag className="w-10 h-10 md:w-12 md:h-12 mx-auto text-gray-700 mb-4 md:mb-6" />
            <h2 className="text-base md:text-lg font-light text-gray-400 mb-1 md:mb-2">
              Your cart is empty
            </h2>
            <p className="text-gray-600 text-xs md:text-sm font-light mb-4 md:mb-8">
              Add items from the marketplace to see them here
            </p>
            <button
              onClick={() => router.push("/marketplace")}
              className="px-4 md:px-6 py-2 md:py-3 bg-linear-to-r from-red-600 to-red-700 text-white text-xs md:text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
            >
              Browse Marketplace
            </button>
          </div>
        )}

        {/* Cart Items */}
        {items.length > 0 && (
          <div className="space-y-2 md:space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 md:gap-4 bg-white/5 border border-white/10 p-3 md:p-4 hover:border-white/20 transition-colors duration-300"
              >
                {/* Thumbnail */}
                <div
                  className="w-11 h-11 md:w-14 md:h-14 overflow-hidden bg-black border border-white/10 shrink-0 cursor-pointer"
                  onClick={() => router.push(`/assets/${item.asset_id}`)}
                >
                  {item.thumbnail ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${item.thumbnail}`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px] font-light">
                      No Img
                    </div>
                  )}
                </div>

                {/* Title + License + Price */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/assets/${item.asset_id}`)}
                >
                  <div className="font-light truncate text-xs md:text-sm mb-1">
                    {item.title}
                  </div>

                  {/* License Badge */}
                  {item.license?.license_type && (
                    <div className="flex items-center gap-1.5 md:gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 bg-red-500/20 text-red-400 rounded border border-red-500/30">
                        {item.license.license_type.name}
                      </span>
                      {(() => {
                        const rule = getLicenseRule(
                          item.license.license_type.slug,
                        );
                        if (!rule) return null;
                        return (
                          <>
                            {rule.canRemix && (
                              <span className="text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                Remix
                              </span>
                            )}
                            {rule.canResell && (
                              <span className="text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                Resell
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <div className="text-gray-600 text-[10px] md:text-xs font-light">
                    ${(item.price_cents / 100).toFixed(2)}
                  </div>
                </div>

                {/* Remove */}
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors duration-300 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div className="mt-4 md:mt-8 bg-white/5 border border-white/10 p-3 md:p-6">
            <div className="flex justify-between text-xs md:text-sm font-light mb-2 md:mb-3">
              <span className="text-gray-600">Items ({items.length})</span>
              <span className="text-gray-400">${(total / 100).toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-xs md:text-sm font-light pt-2 md:pt-3 border-t border-white/10">
              <span>Total</span>
              <span className="text-base md:text-lg">${(total / 100).toFixed(2)}</span>
            </div>

            <button
              onClick={() => {
                const cartIds = items.map((item) => item.id).join(",");
                router.push(`/purchase/checkout?cartIds=${cartIds}`);
              }}
              className="w-full mt-4 md:mt-6 py-2.5 md:py-3 bg-linear-to-r from-red-600 to-red-700 text-white text-xs md:text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
