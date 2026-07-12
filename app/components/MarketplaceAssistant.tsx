"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, ExternalLink, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  displayedContent?: string;
  recommendedAssets?: string[];
  isTyping?: boolean;
}

interface MarketplaceAssistantProps {
  listings: any[];
  myAssets?: any[];
  myListings?: any[];
  commerceProfiles?: any[];
  currentListing?: any;
  currentAssets?: any[];
  bundles?: any[];
  activeTab?: string;
  isLoggedIn?: boolean;
}

const QUICK_PROMPTS_BROWSE = [
  "What's hot right now?",
  "Show me free gems",
  "Who are the top creators?",
  "Find me something unique",
];
const QUICK_PROMPTS_COMMERCE = [
  "How are my assets doing?",
  "Which asset should I list next?",
  "Tips to boost my sales",
  "What price should I set?",
];
const QUICK_PROMPTS_ASSET = [
  "What's the best asset here?",
  "Compare the top picks",
  "Anything free here?",
  "Worth buying?",
];

export default function MarketplaceAssistant({
  listings,
  myAssets,
  myListings,
  commerceProfiles,
  currentListing,
  currentAssets,
  bundles,
  activeTab,
  isLoggedIn,
}: MarketplaceAssistantProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const getGreeting = () => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 5 ? "Night owl" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Late night";

    // Context: viewing a specific asset
    if (currentListing) {
      const assetCount = (currentAssets || []).length;
      const title = currentListing.title;
      const assetGreetings = [
        `Looking at "${title}" — ${assetCount} related asset${assetCount === 1 ? "" : "s"} to dig through. Want the highlights, the steals, or something specific?`,
        `You're on "${title}". I can rank these ${assetCount} by quality, price, or vibe. What's the move?`,
        `${assetCount} asset${assetCount === 1 ? "" : "s"} around "${title}" — I've read every one. Ask me what's worth your time.`,
      ];
      return assetGreetings[Math.floor(Math.random() * assetGreetings.length)];
    }

    // Context: logged-in creator on commerce tab
    if (isLoggedIn && activeTab === "commerce") {
      const assetCount = (myAssets || []).length;
      const publishedCount = (myListings || []).length;
      if (assetCount === 0) {
        return `${timeOfDay}. No assets yet — upload your first and I'll score it for commerce readiness in seconds.`;
      }
      if (publishedCount === 0) {
        return `${timeOfDay}. ${assetCount} asset${assetCount === 1 ? "" : "s"} ready, nothing published yet. Want me to pick your strongest one to launch first?`;
      }
      const commerceGreetings = [
        `${timeOfDay}, creator. ${publishedCount} live asset${publishedCount === 1 ? "" : "s"}, ${assetCount} total. Ask me what's converting, what's sleeping, or what to ship next.`,
        `Back in the studio. I've got your ${assetCount} asset${assetCount === 1 ? "" : "s"} and ${publishedCount} published on radar — pricing, scores, next moves, just say the word.`,
        `${timeOfDay}. Your commerce dashboard is live. Want a health check, a pricing audit, or ideas for your next drop?`,
      ];
      return commerceGreetings[Math.floor(Math.random() * commerceGreetings.length)];
    }

    // Context: general browse
    const assetCount = (listings || []).length;
    const browseGreetings = [
      `${timeOfDay}. ${assetCount > 0 ? `${assetCount} asset${assetCount === 1 ? "" : "s"} live` : "KAIZORA is open"} — tell me a vibe, a budget, or a use case and I'll find your match.`,
      `Hey. I've memorized every asset here. Hunting something specific, or want me to surface what's hot?`,
      `${timeOfDay}. Think of me as your shortcut through the marketplace — ask for recs, creators, free picks, anything.`,
      `Welcome in. ${assetCount > 40 ? "Too many assets to scroll through?" : "Plenty to explore here."} I can narrow it down in one message.`,
      `${timeOfDay}. Quick question to get started: browsing for fun, or hunting something real?`,
    ];
    return browseGreetings[Math.floor(Math.random() * browseGreetings.length)];
  };
  const greeting = getGreeting();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: greeting, displayedContent: greeting },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTypingEffect, setIsTypingEffect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const showTimer = setTimeout(() => setShowPopup(true), 3000);
    const hideTimer = setTimeout(() => setShowPopup(false), 8000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

  const storageUrl = (path?: string) =>
    path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`
      : null;

  const getListingById = (id: string) => listings.find((l) => l.id === id);

  const typeMessage = (
    fullContent: string,
    messageIndex: number,
    recommendedAssets: string[],
  ) => {
    setIsTypingEffect(true);
    let charIndex = 0;

    typingIntervalRef.current = setInterval(() => {
      charIndex++;
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = {
            ...updated[messageIndex],
            displayedContent: fullContent.slice(0, charIndex),
            isTyping: charIndex < fullContent.length,
          };
        }
        return updated;
      });

      if (charIndex >= fullContent.length) {
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[messageIndex]) {
            updated[messageIndex] = {
              ...updated[messageIndex],
              displayedContent: fullContent,
              isTyping: false,
              recommendedAssets,
            };
          }
          return updated;
        });
        setIsTypingEffect(false);
      }
    }, 12);
  };

  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput || input.trim();
    if (!text || isLoading || isTypingEffect) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      displayedContent: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Slim down data before sending — only what the AI needs
      const slimBundles = (bundles || []).map((b: any) => ({
        id: b.id, name: b.name, description: b.description,
        bundle_type: b.bundle_type, asset_count: b.asset_ids?.length || 0,
        total_price_cents: b.total_price_cents,
      }));
      const slimListings = (listings || []).slice(0, 40).map((l: any) => ({
        id: l.id, title: l.title, category: l.category, tags: l.tags,
        price_cents: l.price_cents, views_count: l.views_count,
        _profile: l._profile ? { display_name: l._profile.display_name } : null,
        creator: l._profile?.display_name,
      }));
      const slimAssets = (myAssets || []).slice(0, 30).map((a: any) => ({
        id: a.id, title: a.title, content_type: a.content_type,
        is_public: a.is_public, created_at: a.created_at,
      }));
      const slimMyListings = (myListings || []).slice(0, 20).map((l: any) => ({
        id: l.id, title: l.title, status: l.status, price_cents: l.price_cents,
        views_count: l.views_count, purchases_count: l.purchases_count,
      }));
      const slimCurrentAssets = (currentAssets || []).slice(0, 30).map((a: any) => ({
        id: a.id, title: a.title, content_type: a.content_type,
        price_cents: a.price_cents, featured: a.featured, purchases_count: a.purchases_count,
      }));
      const slimCurrentListing = currentListing ? {
        title: currentListing.title, category: currentListing.category,
        description: currentListing.description, price_cents: currentListing.price_cents,
        views_count: currentListing.views_count, purchases_count: currentListing.purchases_count,
        creator: currentListing._profile?.display_name || currentListing.creator,
      } : null;

      const res = await fetch("/api/marketplace-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          listings: slimListings,
          bundles: slimBundles,
          myAssets: slimAssets,
          myListings: slimMyListings,
          commerceProfiles: commerceProfiles || [],
          currentListing: slimCurrentListing,
          currentAssets: slimCurrentAssets,
          activeTab: activeTab || "browse",
          isLoggedIn: !!isLoggedIn,
        }),
      });

      const data = await res.json();
      const msg = data.message || "";

      if (msg && !data.error) {
        const newIdx = messages.length + 1;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: msg,
            displayedContent: "",
            isTyping: true,
            recommendedAssets: [],
          },
        ]);
        setIsLoading(false);
        typeMessage(msg, newIdx, data.recommendedAssets || []);
      } else {
        const fallback = data.error ? msg : "Hmm, I didn't get a response. Try rephrasing?";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: fallback,
            displayedContent: fallback,
          },
        ]);
        setIsLoading(false);
      }
    } catch {
      const errMsg = "Connection issue — give it another shot.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errMsg,
          displayedContent: errMsg,
        },
      ]);
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Popup hint */}
      {showPopup && !isOpen && (
        <div className="fixed bottom-[76px] right-6 z-50 max-w-[220px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(12,12,14,0.98))] px-3.5 py-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <p className="text-[11px] font-medium tracking-[0.01em] text-gray-300 leading-relaxed">
              {currentListing
                ? "Want the best related picks?"
                : isLoggedIn && activeTab === "commerce"
                  ? "Pricing help? Sales ideas? Ask me."
                  : "Can't decide? I'll find it for you."}
            </p>
          </div>
          <div className="absolute -bottom-1.5 right-6 h-2.5 w-2.5 rotate-45 border-r border-b border-white/[0.08] bg-[#111113]" />
        </div>
      )}

      {/* Toggle button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setShowPopup(false);
          }}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-red-400/20 bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_18px_45px_rgba(220,38,38,0.32)] hover:from-red-400 hover:to-red-500 active:scale-95 transition-all"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[540px] w-[360px] flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(180,25,25,0.14),transparent_32%),linear-gradient(180deg,rgba(12,12,14,0.985),rgba(8,8,10,0.985))] shadow-[0_28px_90px_rgba(0,0,0,0.58)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          {/* Header */}
          <div className="relative flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(19,19,22,0.96),rgba(13,13,15,0.92))] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/18 to-rose-600/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
              </div>
              <div>
                <p className="text-[12px] font-semibold tracking-[0.02em] text-white">
                  Marketplace Assistant
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.45)]" />
                  <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-gray-500">
                    Online
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white/[0.06] hover:text-white transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div
            className="relative flex-1 space-y-3 overflow-y-auto px-4 py-3.5"
            data-lenis-prevent
          >
            <div className="pointer-events-none sticky top-0 z-10 -mx-4 -mt-3.5 mb-2 h-6 bg-gradient-to-b from-[#0f0f11] to-transparent" />
            {messages.map((msg, index) => (
              <div key={index}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-[1.72] tracking-[0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${
                      msg.role === "user"
                        ? "rounded-br-md bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_12px_30px_rgba(220,38,38,0.18)]"
                        : "rounded-bl-md border border-white/[0.07] bg-white/[0.045] text-gray-200"
                    }`}
                  >
                    {msg.displayedContent || msg.content}
                    {msg.isTyping && (
                      <span className="inline-block w-px h-3 bg-gray-400 ml-0.5 animate-pulse" />
                    )}
                  </div>
                </div>

                {/* Skeleton cards while typing */}
                {msg.role === "assistant" &&
                  msg.isTyping &&
                  msg.content.length > 30 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 animate-pulse">
                        <div className="w-10 h-10 bg-white/[0.05] rounded-md flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 bg-white/[0.05] rounded w-3/4" />
                          <div className="h-2 bg-white/[0.04] rounded w-1/2" />
                        </div>
                      </div>
                    </div>
                  )}

                {/* Asset recommendation cards */}
                {msg.recommendedAssets &&
                  msg.recommendedAssets.length > 0 &&
                  !msg.isTyping && (
                    <div className="mt-2 rounded-[18px] border border-white/[0.05] bg-white/[0.02] p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Recommended Picks
                        </span>
                        <span className="text-[9px] text-gray-600">
                          {msg.recommendedAssets.length} result{msg.recommendedAssets.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {msg.recommendedAssets.map((id, ci) => {
                          const listing = getListingById(id);
                          if (!listing) return null;
                          const imgUrl = storageUrl(
                            listing._asset?.thumbnail_path ||
                              listing._asset?.storage_path,
                          );
                          const isPaid =
                            listing.price_cents && listing.price_cents > 0;
                          const creator =
                            listing._profile?.display_name || "Unknown";

                          return (
                            <div
                              key={id}
                              onClick={() =>
                                router.push(`/assets/${id}`)
                              }
                              className="group/card flex cursor-pointer items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.018))] p-2.5 transition-all hover:-translate-y-[1px] hover:border-red-500/22 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.026))]"
                              style={{
                                animation: `fadeInCard 0.25s ease-out ${ci * 0.08}s both`,
                              }}
                            >
                              <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b0b0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={listing.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-800 text-[8px]">
                                    --
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-[11px] font-semibold tracking-[0.01em] text-white transition-colors group-hover/card:text-red-300">
                                  {listing.title}
                                </p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="rounded-full border border-white/[0.06] bg-white/[0.035] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                    {listing.category || "--"}
                                  </span>
                                  <span className="truncate text-[9px] text-red-300/75">
                                    @{creator}
                                  </span>
                                  <span
                                    className={`ml-auto text-[9px] font-semibold tracking-[0.02em] ${isPaid ? "text-white/85" : "text-emerald-300"}`}
                                  >
                                    {isPaid
                                      ? `$${(listing.price_cents / 100).toFixed(2)}`
                                      : "Free"}
                                  </span>
                                </div>
                              </div>
                              <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-600 transition-colors group-hover/card:text-red-300" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.045] px-4 py-3">
                  <div
                    className="w-1.5 h-1.5 bg-red-400/60 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-red-400/60 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-red-400/60 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && !isLoading && (
            <div className="shrink-0 px-4 pb-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Quick Starters
                </span>
                <span className="text-[9px] text-gray-600">Tap to ask</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(currentListing ? QUICK_PROMPTS_ASSET : activeTab === "commerce" && isLoggedIn ? QUICK_PROMPTS_COMMERCE : QUICK_PROMPTS_BROWSE).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-full border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.025))] px-2.5 py-1.5 text-[10px] font-medium tracking-[0.03em] text-gray-400 transition-all hover:-translate-y-[1px] hover:border-red-500/20 hover:bg-red-500/[0.05] hover:text-red-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-white/[0.06] bg-[linear-gradient(180deg,rgba(14,14,16,0.88),rgba(10,10,12,0.96))] px-3.5 py-3">
            <div className="mb-2 px-1 text-[9px] font-medium uppercase tracking-[0.16em] text-gray-600">
              Ask anything about this marketplace
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about assets, pricing, creators..."
                disabled={isLoading || isTypingEffect}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3.5 py-2.5 text-[12px] font-medium tracking-[0.01em] text-white placeholder-gray-500 transition-all focus:border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/15 disabled:opacity-40"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || isTypingEffect || !input.trim()}
                className="rounded-xl border border-red-400/20 bg-gradient-to-b from-red-500 to-red-600 px-3.5 py-2.5 text-white shadow-[0_10px_30px_rgba(220,38,38,0.16)] transition-all hover:from-red-400 hover:to-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <style jsx>{`
            @keyframes fadeInCard {
              from {
                opacity: 0;
                transform: translateY(4px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
