"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  ArrowLeft,
  Package,
  Lock,
  CreditCard,
  CheckCircle2,
  Loader2,
  ImageIcon,
  Tag,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function storageUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
}

function AssetCard({ asset }: { asset: any }) {
  const url = storageUrl(asset.thumbnail_path || asset.storage_path);
  return (
    <a
      href={`/assets/${asset.id}`}
      className="group border border-white/10 bg-white/[0.02] overflow-hidden hover:border-white/25 hover:-translate-y-0.5 transition-all duration-200 block"
    >
      <div className="aspect-square bg-black relative overflow-hidden">
        {url ? (
          <img src={url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            {asset.content_type === "video" && "🎥"}
            {asset.content_type === "audio" && "🎧"}
            {asset.content_type === "text" && "📄"}
            {(!asset.content_type || asset.content_type === "image") && <ImageIcon className="w-8 h-8 text-gray-600" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute bottom-2 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded-full">View asset →</span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm text-white font-light truncate group-hover:text-red-400 transition-colors">{asset.title || "Untitled"}</p>
        <p className="text-xs text-gray-500 mt-0.5">{asset.category || "Uncategorized"}</p>
        <p className="text-xs text-gray-400 mt-1">${((asset.price_cents || 0) / 100).toFixed(2)}</p>
      </div>
    </a>
  );
}

function PaymentForm({
  total,
  onSuccess,
}: {
  total: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeErr) {
      setError(stripeErr.message || "Payment failed");
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white/5 border border-white/10 p-4">
        <PaymentElement />
      </div>
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3">{error}</p>
      )}
      <button
        type="submit"
        disabled={processing || !stripe}
        className="w-full py-4 bg-white text-black hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-light flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        {processing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
        ) : (
          <><CreditCard className="w-4 h-4" /> Pay ${(total / 100).toFixed(2)}</>
        )}
      </button>
      <p className="text-xs text-gray-600 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Secure payment via Stripe
      </p>
    </form>
  );
}

export default function BundlePage() {
  const params = useParams();
  const router = useRouter();
  const bundleId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<any>(null);
  const [allAssets, setAllAssets] = useState<any[]>([]);   // full bundle asset list
  const [ownedAssetIds, setOwnedAssetIds] = useState<Set<string>>(new Set());
  const [creator, setCreator] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState("");
  const [alreadyOwned, setAlreadyOwned] = useState(false); // whole bundle purchased

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      setUser(auth?.user || null);
      const session = await supabase.auth.getSession();
      const t = session.data.session?.access_token || "";
      setToken(t);

      const res = await fetch(`/api/bundles/${bundleId}`);
      const data = await res.json();
      if (data.error) { setLoading(false); return; }

      setBundle(data.bundle);
      setAllAssets(data.assets || []);
      setCreator(data.creator || null);

      if (auth?.user) {
        // Check if the whole bundle has been purchased
        const { data: bundlePurchase } = await supabase
          .from("bundle_purchases")
          .select("id")
          .eq("bundle_id", bundleId)
          .eq("buyer_id", auth.user.id)
          .eq("status", "paid")
          .maybeSingle();
        setAlreadyOwned(!!bundlePurchase);

        // Fetch individually purchased asset IDs to exclude from display
        const assetIds = (data.assets || []).map((a: any) => a.id);
        if (assetIds.length > 0) {
          const { data: purchased } = await supabase
            .from("purchased_assets")
            .select("asset_id")
            .eq("buyer_id", auth.user.id)
            .in("asset_id", assetIds);
          setOwnedAssetIds(new Set((purchased || []).map((r: any) => r.asset_id)));
        }
      }

      setLoading(false);
    }
    if (bundleId) init();
  }, [bundleId]);

  // Assets not yet owned by the user
  const unpurchasedAssets = allAssets.filter(a => !ownedAssetIds.has(a.id));
  const effectiveTotal = unpurchasedAssets.reduce((s, a) => s + (a.price_cents || 0), 0);

  const handleBuy = async () => {
    if (!user) { router.push("/login"); return; }
    setPaymentLoading(true);
    const res = await fetch(`/api/bundles/${bundleId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) { alert(data.error); setPaymentLoading(false); return; }
    setClientSecret(data.clientSecret);
    setShowPayment(true);
    setPaymentLoading(false);
  };

  const handlePaymentSuccess = async () => {
    setCompleting(true);
    await fetch(`/api/bundles/${bundleId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stripe_payment_intent_id: null }),
    });
    setCompleting(false);
    setShowPayment(false);
    setSuccess(true);
    setAlreadyOwned(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-6 max-w-5xl mx-auto">
        <Skeleton className="h-4 w-20 mb-8 bg-white/10" />
        <Skeleton className="h-8 w-64 mb-2 bg-white/10" />
        <Skeleton className="h-4 w-96 mb-8 bg-white/10" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square bg-white/10" />)}
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-500">Bundle not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Success overlay */}
      {success && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white/10 max-w-md w-full text-center p-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-light mb-2">Bundle Purchased!</h2>
            <p className="text-gray-400 text-sm font-light mb-4">
              All {unpurchasedAssets.length} assets are now in your library.
            </p>
            <div className="bg-white/5 border border-white/10 p-4 mb-6 text-left space-y-2">
              {unpurchasedAssets.map(a => (
                <div key={a.id} className="flex justify-between text-sm font-light">
                  <span className="text-gray-400 truncate mr-2">{a.title}</span>
                  <span>${((a.price_cents || 0) / 100).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-white/10 flex justify-between font-light">
                <span>Total Paid</span>
                <span className="text-lg">${(effectiveTotal / 100).toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={() => router.push("/library")}
              className="w-full py-3 bg-white text-black hover:bg-gray-100 text-sm font-light transition-colors"
            >
              Go to Library
            </button>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPayment && clientSecret && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/10 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-light">Complete Purchase</h3>
              <button onClick={() => setShowPayment(false)} className="text-gray-500 hover:text-white text-lg">×</button>
            </div>
            <div className="flex justify-between text-sm mb-4 pb-4 border-b border-white/10">
              <span className="text-gray-400">{bundle.name}</span>
              <span className="text-white">${(effectiveTotal / 100).toFixed(2)}</span>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm total={effectiveTotal} onSuccess={handlePaymentSuccess} />
            </Elements>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto py-8 px-4">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: bundle info + assets */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 border border-white/20 text-gray-400 uppercase tracking-wider">
                  {bundle.bundle_type?.replace("_", " ")}
                </span>
                <span className="text-xs text-gray-600">{allAssets.length} assets total</span>
                {ownedAssetIds.size > 0 && !alreadyOwned && (
                  <span className="text-xs text-emerald-500">{ownedAssetIds.size} already owned</span>
                )}
              </div>
              <h1 className="text-2xl font-light text-white mb-2">{bundle.name}</h1>
              {bundle.description && (
                <p className="text-sm text-gray-400 font-light">{bundle.description}</p>
              )}
              {creator?.username && (
                <p className="text-xs text-gray-600 mt-2">
                  by <span className="text-gray-400">{creator.username}</span>
                </p>
              )}
            </div>

            {/* Assets grid — only unpurchased assets */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                {alreadyOwned ? "Bundle Assets" : unpurchasedAssets.length < allAssets.length ? `${unpurchasedAssets.length} assets to unlock` : "Included Assets"}
              </p>
              {unpurchasedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border border-white/10 bg-white/[0.02] text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                  <p className="text-sm text-white font-light mb-1">You already own all assets in this bundle</p>
                  <p className="text-xs text-gray-500">Check your library to access them</p>
                  <button
                    onClick={() => router.push("/library")}
                    className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                  >
                    Go to Library
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {unpurchasedAssets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>

            {/* Tags from first asset */}
            {allAssets[0]?.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allAssets[0].tags.slice(0, 8).map((tag: string) => (
                  <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 border border-white/10 text-gray-500">
                    <Tag className="w-2.5 h-2.5" />{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: purchase panel */}
          <div className="lg:col-span-1">
            <div className="border border-white/10 bg-white/[0.02] p-5 sticky top-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-red-400" />
                <p className="text-xs text-gray-400 uppercase tracking-wider">
                  {unpurchasedAssets.length < allAssets.length && !alreadyOwned ? "Remaining to unlock" : "Bundle Price"}
                </p>
              </div>

              {/* Price breakdown — only show unpurchased assets */}
              <div className="space-y-2 pb-3 border-b border-white/10">
                {unpurchasedAssets.map(a => (
                  <div key={a.id} className="flex justify-between text-xs text-gray-500">
                    <span className="truncate mr-2">{a.title}</span>
                    <span>${((a.price_cents || 0) / 100).toFixed(2)}</span>
                  </div>
                ))}
                {ownedAssetIds.size > 0 && !alreadyOwned && (
                  <div className="flex justify-between text-xs text-emerald-600 pt-1">
                    <span>{ownedAssetIds.size} asset{ownedAssetIds.size > 1 ? "s" : ""} already owned</span>
                    <span>–</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">
                  {unpurchasedAssets.length < allAssets.length && !alreadyOwned ? "You pay" : "Total"}
                </span>
                <span className="text-2xl font-light text-white">
                  ${(effectiveTotal / 100).toFixed(2)}
                </span>
              </div>

              {alreadyOwned || unpurchasedAssets.length === 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 py-3 border border-green-500/30 bg-green-500/5 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Already Owned
                  </div>
                  <button
                    onClick={() => router.push("/library")}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-light transition-colors"
                  >
                    Go to Library
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleBuy}
                  disabled={paymentLoading}
                  className="w-full py-3 bg-white text-black hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-light flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {paymentLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                  ) : (
                    <><Package className="w-4 h-4" /> Buy Bundle</>
                  )}
                </button>
              )}

              <p className="text-xs text-gray-600 text-center">
                {unpurchasedAssets.length > 0
                  ? `Unlock ${unpurchasedAssets.length} asset${unpurchasedAssets.length > 1 ? "s" : ""} instantly`
                  : `All ${allAssets.length} assets in your library`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
