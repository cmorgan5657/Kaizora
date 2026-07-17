"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Flame,
  Heart,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Upload,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const capabilityCards = [
  {
    icon: Flame,
    title: "Regenerate Content",
    description:
      "Transform unused AI generations, discarded outputs, and forgotten concepts into valuable assets.",
  },
  {
    icon: Search,
    title: "Discover Inspiration",
    description:
      "Browse a curated marketplace of premium AI creations. Find the perfect foundation for your next masterpiece.",
  },
  {
    icon: Sparkles,
    title: "Remix & Reinvent",
    description:
      "Use AI to evolve existing content into something extraordinary. Build on others' work and create unique value.",
  },
];

const creatorPoints = [
  {
    icon: BadgeDollarSign,
    title: "Earn from Every Sale",
    body: "Set your price and license terms. Get paid instantly.",
  },
  {
    icon: ArrowRight,
    title: "Earn from Remixes",
    body: "Get royalties when others build on your work.",
  },
  {
    icon: Zap,
    title: "Build Your Legacy",
    body: "Showcase your AI creations and grow your audience.",
  },
];

const buyerPoints = [
  {
    icon: Sparkles,
    title: "Skip the First Draft",
    body: "Start with pre-generated content and iterate faster.",
  },
  {
    icon: Zap,
    title: "Remix with AI",
    body: "Use our AI tools to evolve content into something new.",
  },
  {
    icon: ShoppingCart,
    title: "Clear Licensing",
    body: "Know exactly what you can do with each asset.",
  },
];

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload Your Content",
    body:
      "Share unused generations, abandoned prompts, or creative experiments that deserve a second life.",
  },
  {
    number: "02",
    icon: Tag,
    title: "Set License & Price",
    body:
      "Choose your licensing terms and set your price, or offer it for free.",
  },
  {
    number: "03",
    icon: Search,
    title: "Buyers Discover & Remix",
    body:
      "Creators and remixers browse the marketplace, find inspiration, and purchase or remix your content.",
  },
  {
    number: "04",
    icon: BadgeDollarSign,
    title: "Creators Earn Continuously",
    body:
      "Get paid for sales and earn ongoing royalties when others build on your work through remixes.",
  },
];

const categories = ["All", "Images", "Text", "Video", "Audio", "Code"];

type BrowseItem = {
  id: string;
  title: string;
  model: string;
  type: string;
  price: string;
  author: string;
  image: string | null;
  mediaKind: "image" | "video" | "audio" | "text" | "code";
  mediaSrc?: string | null;
  hasThumbnail?: boolean;
};

const browseItems: BrowseItem[] = [
  {
    id: "browse-mission-to-mars-free",
    title: "Mission to mars",
    model: "GPT-4",
    type: "Image",
    price: "Free",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
  {
    id: "browse-who-think-they-can-win",
    title: "Who think they can win",
    model: "GPT-4",
    type: "Image",
    price: "$4.99",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
  {
    id: "browse-hamburger-free",
    title: "Hamburger",
    model: "GPT-4",
    type: "Image",
    price: "Free",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
  {
    id: "browse-mission-to-mars-five",
    title: "Mission to mars",
    model: "GPT-4",
    type: "Image",
    price: "$5",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
  {
    id: "browse-kaela-free",
    title: "Kaela",
    model: "GPT-4",
    type: "Image",
    price: "Free",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
  {
    id: "browse-best-content-free",
    title: "Best Content",
    model: "GPT-3.5",
    type: "Image",
    price: "Free",
    author: "Bill",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    mediaKind: "image",
    mediaSrc: null,
    hasThumbnail: true,
  },
];

const featuredDrops = [
  {
    title: "Mission to mars",
    prompt: "group watching the martian landscape",
    model: "GPT-4",
    price: "Free",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Who think they can win",
    prompt: "Mechanical owl",
    model: "GPT-4",
    price: "$4.99",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Hamburger",
    prompt: "Picture of hamburger",
    model: "GPT-4",
    price: "Free",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Mission to mars",
    prompt: "Group of explorers admiring the martian landscape",
    model: "GPT-4",
    price: "$5",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Kaela",
    prompt: "Kaela in her military suit",
    model: "GPT-4",
    price: "Free",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Best Content",
    prompt: "Best content available",
    model: "GPT-3.5",
    price: "Free",
    remixes: "0 remixes",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  },
];

function storageUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("assets").getPublicUrl(path);
  return data.publicUrl;
}

function SectionHeading({
  title,
  accent,
  subtitle,
}: {
  title: string;
  accent?: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
        {title}{" "}
        {accent ? <span className="text-[#ff2a57]">{accent}</span> : null}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base leading-7 text-white/55 md:text-[1.2rem]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-[#5b1426] bg-[linear-gradient(135deg,_#17111a,_#0d1018)] shadow-[0_0_0_1px_rgba(255,44,92,0.02),0_12px_38px_rgba(0,0,0,0.22)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [marketplaceItems, setMarketplaceItems] = useState<BrowseItem[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);

  useEffect(() => {
    async function loadMarketplaceContent() {
      setMarketplaceLoading(true);

      // Query published assets directly — no listings wrapper
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(18);

      if (error || !data?.length) {
        setMarketplaceItems([]);
        setMarketplaceLoading(false);
        return;
      }

      const creatorIds = [
        ...new Set(data.map((asset: any) => asset.owner_id).filter(Boolean)),
      ];

      const { data: profiles } = creatorIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", creatorIds)
        : { data: [] as any[] };

      const profileLookup = new Map(
        (profiles ?? []).map((profile: any) => [profile.id, profile]),
      );

      const formatted: BrowseItem[] = data
        .map((asset: any) => {
          const profile = profileLookup.get(asset.owner_id);
          const title = asset.title || "Untitled";
          const type = asset.content_type || "Image";
          const normalizedType = String(type).toLowerCase();
          const model = asset.ai_model || "AI Content";
          const price =
            !asset.price_cents || Number(asset.price_cents) === 0
              ? "Free"
              : `$${(Number(asset.price_cents) / 100).toFixed(2)}`;
          const imagePath =
            normalizedType === "image"
              ? asset.storage_path || asset.thumbnail_path
              : asset.thumbnail_path;
          const image = storageUrl(imagePath);
          const mediaSrc = storageUrl(asset.storage_path);
          const mediaKind: BrowseItem["mediaKind"] =
            normalizedType === "video" ||
            normalizedType === "audio" ||
            normalizedType === "text" ||
            normalizedType === "code"
              ? normalizedType
              : "image";

          return {
            id: asset.id,
            title,
            model,
            type,
            price,
            author: profile?.display_name || "KAIZORA Creator",
            image,
            mediaKind,
            mediaSrc,
            hasThumbnail: !!asset.thumbnail_path,
          };
        })
        .slice(0, 6);

      setMarketplaceItems(formatted);
      setMarketplaceLoading(false);
    }

    loadMarketplaceContent();
  }, []);

  const visibleBrowseItems = useMemo(() => {
    if (marketplaceLoading && marketplaceItems.length === 0) return [];

    const sourceItems = marketplaceItems.length > 0 ? marketplaceItems : browseItems;
    if (activeCategory === "All") return sourceItems;

    const selectedType =
      activeCategory === "Images" ? "Image" : activeCategory.slice(0, -1);

    return sourceItems.filter(
      (item) => item.type?.toLowerCase() === selectedType.toLowerCase(),
    );
  }, [activeCategory, marketplaceItems, marketplaceLoading]);

  return (
    <main className="overflow-x-hidden bg-[#070b13] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-45">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,36,79,0.06),transparent_24%),radial-gradient(circle_at_50%_48%,rgba(255,36,79,0.04),transparent_20%),linear-gradient(180deg,#090b14_0%,#070b13_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      <section className="relative border-b border-[#4d1120]">
        <div className="mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-7xl flex-col items-center justify-center px-6 pb-20 pt-16 text-center md:px-8 md:pb-28">
          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-[14%] h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-[#ff244f]/10 blur-[130px]" />
            <div className="absolute bottom-10 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#ff244f]/8 blur-[160px]" />
          </div>

          <div className="relative z-10 max-w-5xl">
            <h1 className="text-4xl font-semibold leading-[0.98] tracking-[-0.04em] text-white md:text-[5.8rem]">
              <span className="block">The Agentic</span>
              <span className="block">Commerce Platform</span>
              <span className="mt-2 block text-white/32">
                Powering the Future of
              </span>
              <span className="mt-2 block text-[#ff244f]">AI-Content Creators</span>
            </h1>

            <p className="mt-8 text-xl font-semibold text-[#ff244f] md:text-3xl">
              Recycle. Remix. Resell.
            </p>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-white/55 md:text-[1.25rem]">
              Unlocking the untapped value hidden inside AI-generated content.
            </p>

            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={() => router.push("/marketplace")}
                className="inline-flex min-w-[280px] items-center justify-center gap-3 rounded-2xl border border-[#ff375f] bg-gradient-to-r from-[#e61f4c] to-[#94102c] px-7 py-4 text-lg font-semibold text-white shadow-[0_0_40px_rgba(255,36,79,0.22)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <WandSparkles className="h-5 w-5" />
                Explore Marketplace
              </button>
            </div>

            <p className="mt-8 text-base text-white/42">
              For visionary creators worldwide
            </p>
            <p className="mt-14 text-base text-white/35 md:mt-20">
              ↓ Discover the rebirth ↓
            </p>
          </div>
        </div>
      </section>

      <section className="relative border-b border-[#4d1120] px-6 py-[5.5rem] md:px-8 md:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            title="The World's Premier AI"
            accent="Regeneration Platform"
          />

          <div className="mt-16 grid gap-7 md:grid-cols-3">
            {capabilityCards.map(({ icon: Icon, title, description }) => (
              <Surface key={title} className="p-10">
                <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-gradient-to-br from-[#d91742] to-[#8f0d2a] text-white shadow-[0_0_30px_rgba(255,36,79,0.24)]">
                  <Icon className="h-9 w-9" />
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight text-white md:text-[1.7rem]">
                  {title}
                </h3>
                <p className="mt-4 text-base leading-7 text-white/58 md:text-[1.08rem]">
                  {description}
                </p>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-[5.5rem] md:px-8 md:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            title="Browse"
            accent="AI Content"
            subtitle="Live public content from Marketplace Commerce OS"
          />

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            {categories.map((category) => {
              const active = category === activeCategory;
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full border px-7 py-3 text-xl transition-colors ${
                    active
                      ? "border-transparent bg-white text-[#0a0d15]"
                      : "border-[#452332] text-white/65 hover:border-[#a81f43] hover:text-white"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {marketplaceLoading && marketplaceItems.length === 0
              ? browseItems.map((item, index) => (
                  <article
                    key={`loading-${index}`}
                    className="overflow-hidden rounded-[26px] border border-[#4f1526] bg-[#0d1018] shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
                  >
                    <div className="h-[260px] animate-pulse bg-white/5" />
                    <div className="space-y-4 p-6">
                      <div className="flex gap-3">
                        <div className="h-7 w-16 animate-pulse rounded-full bg-white/5" />
                        <div className="h-7 w-20 animate-pulse rounded-full bg-white/5" />
                      </div>
                      <div className="h-7 w-40 animate-pulse rounded bg-white/5" />
                      <div className="h-6 w-20 animate-pulse rounded bg-white/5" />
                    </div>
                  </article>
                ))
              : null}
            {!marketplaceLoading && visibleBrowseItems.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3">
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[26px] border border-[#4f1526] bg-[#0d1018] px-8 py-12 text-center shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                  <Sparkles className="h-10 w-10 text-white/20" />
                  <h3 className="mt-5 text-2xl font-semibold text-white/88">
                    {activeCategory} content not available
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-white/45">
                    There’s no live public content in this category right now.
                    Try another filter or check back soon.
                  </p>
                </div>
              </div>
            ) : null}
            {visibleBrowseItems.map((item, index) => (
              <article
                key={item.id || `${item.title}-${index}`}
                className="overflow-hidden rounded-[26px] border border-[#4f1526] bg-[#0d1018] shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
              >
                <div className="relative h-[260px] overflow-hidden">
                  {item.mediaKind === "video" &&
                  !item.hasThumbnail &&
                  item.mediaSrc ? (
                    <video
                      src={item.mediaSrc}
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                      autoPlay
                      muted
                      onCanPlay={(e) => {
                        (e.target as HTMLVideoElement).pause();
                      }}
                    />
                  ) : item.mediaKind === "audio" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0b0b0b] px-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05]">
                        <svg
                          className="h-6 w-6 text-gray-500"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                        </svg>
                      </div>
                      <span className="line-clamp-1 text-center text-[11px] text-gray-500">
                        {item.title}
                      </span>
                      {item.mediaSrc ? (
                        <audio
                          src={item.mediaSrc}
                          controls
                          preload="metadata"
                          className="h-8 w-full"
                          style={{ colorScheme: "dark" }}
                        />
                      ) : null}
                    </div>
                  ) : item.mediaKind === "text" || item.mediaKind === "code" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#151923] text-white/35">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05]">
                        <svg
                          className="h-6 w-6 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M7.5 8.25h9m-9 3.75h9m-9 3.75h4.5M6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75Z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm uppercase tracking-[0.2em] text-white/25">
                        {item.mediaKind}
                      </p>
                    </div>
                  ) : item.image ? (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.18))] p-2">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full rounded-[20px] object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#151923] text-white/35">
                      <div className="text-center">
                        <Sparkles className="mx-auto h-10 w-10" />
                        <p className="mt-3 text-sm uppercase tracking-[0.2em] text-white/25">
                          {item.mediaKind}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/90">
                      {item.type}
                    </span>
                    <span className="rounded-full bg-[#4b1d28] px-3 py-1 text-sm font-medium text-[#ffd5de]">
                      {item.model}
                    </span>
                  </div>
                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                      <p className="mt-3 text-xl font-semibold text-[#ff2a57]">
                        {item.price}
                      </p>
                    </div>
                    <p className="pt-9 text-base text-white/55">by {item.author}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-12 md:px-8 md:py-[4.5rem]">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <Surface className="p-10 md:p-14">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d91742] to-[#8f0d2a] shadow-[0_0_30px_rgba(255,36,79,0.22)]">
              <Upload className="h-10 w-10" />
            </div>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight md:text-5xl">
              For <span className="text-[#ff2a57]">Creators</span>
            </h3>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-white/60 md:text-[1.55rem]">
              Monetize your AI generations. Transform creative experiments into
              revenue.
            </p>
            <div className="mt-10 space-y-8">
              {creatorPoints.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-4">
                  <Icon className="mt-1 h-7 w-7 text-[#ff2a57]" />
                  <div>
                    <h4 className="text-xl font-semibold">{title}</h4>
                    <p className="mt-2 text-lg leading-7 text-white/52">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/creator")}
              className="mt-10 w-full rounded-2xl bg-gradient-to-r from-[#e61f4c] to-[#98112d] px-6 py-4 text-lg font-semibold text-white"
            >
              Start Uploading
            </button>
          </Surface>

          <Surface className="p-10 md:p-14">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d91742] to-[#8f0d2a] shadow-[0_0_30px_rgba(255,36,79,0.22)]">
              <ShoppingCart className="h-10 w-10" />
            </div>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight md:text-5xl">
              For <span className="text-[#ff2a57]">Buyers & Remixers</span>
            </h3>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-white/60 md:text-[1.55rem]">
              Find inspiration and starting points. Build faster with premium AI
              assets.
            </p>
            <div className="mt-10 space-y-8">
              {buyerPoints.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-4">
                  <Icon className="mt-1 h-7 w-7 text-[#ff2a57]" />
                  <div>
                    <h4 className="text-xl font-semibold">{title}</h4>
                    <p className="mt-2 text-lg leading-7 text-white/52">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/marketplace")}
              className="mt-10 w-full rounded-2xl border border-[#ff2a57] px-6 py-4 text-lg font-semibold text-[#ff2a57] transition-colors hover:bg-[#ff2a57]/8"
            >
              Explore Marketplace
            </button>
          </Surface>
        </div>
      </section>

      <section className="relative border-b border-[#4d1120] border-t px-6 py-24 md:px-8 md:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,36,79,0.08),transparent_28%)]" />
        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-base text-white/80">
            <Sparkles className="h-5 w-5" />
            Pre-Monetization Tool
          </div>
          <h2 className="mt-8 text-4xl font-semibold tracking-tight md:text-6xl">
            Decide Before You <span className="text-[#ff2a57]">List</span>
          </h2>
          <p className="mx-auto mt-6 max-w-4xl text-lg leading-8 text-white/56 md:text-[1.4rem]">
            KAIZORA's Decision Layer helps creators quickly determine what's
            worth monetizing, how to price it directionally, and who it's for
            before publishing or marketing anything.
          </p>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("kz_decision_layer_welcome_trigger", "1");
              }
              router.push("/decision-layer");
            }}
            className="mt-10 inline-flex items-center gap-4 rounded-2xl bg-[#121520] px-8 py-4 text-lg font-semibold text-white shadow-[0_0_35px_rgba(255,36,79,0.14)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Try the Decision Layer
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
      </section>

      <section className="relative px-6 py-24 md:px-8 md:py-[7.5rem]">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            title="How"
            accent="KAIZORA Works"
            subtitle="From creative spark to valuable asset in four simple steps"
          />

          <div className="relative mt-[4.5rem]">
            <div className="absolute left-0 right-0 top-[92px] hidden h-px bg-[#7b1830] lg:block" />
            <div className="grid gap-12 lg:grid-cols-4 lg:gap-8">
              {steps.map(({ number, icon: Icon, title, body }) => (
                <div key={number} className="text-center">
                  <div className="text-[4rem] font-semibold leading-none text-[#5a1525] md:text-[5rem]">
                    {number}
                  </div>
                  <div className="mx-auto mt-3 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#d91742] to-[#8f0d2a] shadow-[0_0_34px_rgba(255,36,79,0.22)]">
                    <Icon className="h-12 w-12" />
                  </div>
                  <h3 className="mx-auto mt-8 max-w-xs text-2xl font-semibold leading-tight">
                    {title}
                  </h3>
                  <p className="mx-auto mt-4 max-w-sm text-lg leading-7 text-white/54">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-24 md:px-8 md:py-[7.5rem]">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            title="Featured"
            accent="Drops"
            subtitle="Discover the most popular AI-generated content waiting for its second life"
          />

          <div className="mt-16 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {featuredDrops.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className="overflow-hidden rounded-[22px] border border-[#4d1526] bg-[#0c1018] shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
              >
                <div className="relative h-[280px] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                  <button className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white/85 backdrop-blur-sm">
                    <Heart className="h-6 w-6" />
                  </button>
                </div>
                <div className="p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <span className="rounded-full bg-[#4b2e77] px-3 py-1 text-sm font-medium text-[#ebd5ff]">
                        image
                      </span>
                      <span className="rounded-full bg-[#6e5721] px-3 py-1 text-sm font-medium text-[#ffe06b]">
                        Paid
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold text-white">{item.price}</p>
                      <p className="mt-1 text-base text-white/38">{item.remixes}</p>
                    </div>
                  </div>

                  <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                  <div className="mt-4 rounded-xl bg-black/35 px-5 py-4 font-mono text-base text-white/82">
                    {item.prompt}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-base text-white/50">
                    <span>via {item.model}</span>
                    <span>by @Bill</span>
                  </div>
                  <div className="mt-7 grid grid-cols-2 gap-4">
                    <button className="rounded-xl border border-white/8 bg-transparent px-5 py-3 text-lg font-medium text-white">
                      Buy
                    </button>
                    <button className="rounded-xl border border-white/14 bg-black/35 px-5 py-3 text-lg font-medium text-white">
                      Remix
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-14 text-center">
            <button
              onClick={() => router.push("/marketplace")}
              className="rounded-xl border border-[#8c1834] px-8 py-4 text-lg font-medium text-[#ff2a57] transition-colors hover:bg-[#ff2a57]/8"
            >
              View All AI Content
            </button>
          </div>
        </div>
      </section>

    </main>
  );
}
