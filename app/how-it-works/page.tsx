"use client";

import { useEffect } from "react";
import {
  Upload,
  Search,
  ShoppingCart,
  Sparkles,
  DollarSign,
  Share2,
} from "lucide-react";

export default function HowItWorksPage() {
  useEffect(() => {
    let scrollInterval: NodeJS.Timeout;
    let isAutoScrolling = true;

    const startAutoScroll = () => {
      scrollInterval = setInterval(() => {
        if (isAutoScrolling) {
          window.scrollBy({ top: 1, behavior: "smooth" });
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 10
          ) {
            clearInterval(scrollInterval);
          }
        }
      }, 70);
    };

    const timeout = setTimeout(startAutoScroll, 500);

    const handleUserInteraction = () => {
      isAutoScrolling = false;
      clearInterval(scrollInterval);
    };

    window.addEventListener("wheel", handleUserInteraction, { passive: true });
    window.addEventListener("touchstart", handleUserInteraction, {
      passive: true,
    });
    window.addEventListener("touchmove", handleUserInteraction, {
      passive: true,
    });
    window.addEventListener("keydown", handleUserInteraction);
    window.addEventListener("mousedown", handleUserInteraction);

    return () => {
      clearTimeout(timeout);
      clearInterval(scrollInterval);
      window.removeEventListener("wheel", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      window.removeEventListener("touchmove", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("mousedown", handleUserInteraction);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="pt-16 md:pt-32 pb-10 md:pb-20 px-3 md:px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-5xl font-extralight mb-4 md:mb-6 text-gray-300">
            How KAIZORA Works
          </h1>
          <p className="text-base md:text-xl text-gray-400 font-light leading-relaxed mb-6 md:mb-8">
            Your complete guide to the premium AI content marketplace.
          </p>

          <div className="border-l-2 border-gray-700 pl-4 md:pl-6 mt-6 md:mt-12">
            <p className="text-sm md:text-lg text-gray-300 font-light leading-relaxed">
              KAIZORA is built for creators and buyers who move at the speed of
              AI. Here's everything you need to know to get started.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-6 md:py-16 px-3 md:px-6">
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-20">
          {/* For Sellers */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-5 md:mb-10 text-white">
              For Sellers
            </h2>
            <div className="space-y-5 md:space-y-10">
              {[
                {
                  icon: <Upload className="w-6 h-6 text-white" />,
                  title: "1. Upload Your Content",
                  body: "Navigate to the Upload page and select your AI-generated content. We accept images, videos, audio, text, and code snippets. Add details like the AI model used, original prompt, and a description.",
                },
                {
                  icon: <DollarSign className="w-6 h-6 text-white" />,
                  title: "2. Set Your Price & License",
                  body: "Choose between free or paid content. Select a license type: Creative Commons (free use), Exclusive (one-time purchase), Remixable (allows derivatives), or Paid (standard commercial license). Set your price and you're ready to go!",
                },
                {
                  icon: <Share2 className="w-6 h-6 text-white" />,
                  title: "3. Earn & Track",
                  body: "Once published, your content appears in the marketplace. Track views, purchases, and remixes from your Creator Dashboard. Earnings are automatically calculated and available for withdrawal.",
                },
              ].map((step, i) => (
                <div key={i} className="flex gap-3 md:gap-6">
                  <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="text-base md:text-xl font-light mb-2 md:mb-3 text-gray-300">
                      {step.title}
                    </h3>
                    <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* For Buyers */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-5 md:mb-10 text-white">For Buyers</h2>
            <div className="space-y-5 md:space-y-10">
              {[
                {
                  icon: <Search className="w-6 h-6 text-white" />,
                  title: "1. Browse & Search",
                  body: "Explore the marketplace using filters for content type, AI model, license type, and price range. Use tags to find specific styles or themes. Sort by newest, most remixed, or top sellers.",
                },
                {
                  icon: <ShoppingCart className="w-6 h-6 text-white" />,
                  title: "2. Purchase Content",
                  body: "Click on any content card to view full details, preview the content, and see remix history. Free content is instantly available. Paid content requires a secure checkout via Stripe.",
                },
                {
                  icon: <Sparkles className="w-6 h-6 text-white" />,
                  title: "3. Access & Use",
                  body: "All purchased content is available in your Vault. Download files, favorite items, and organize content into collections. Use according to the license terms—remix it, use it commercially, or build upon it!",
                },
              ].map((step, i) => (
                <div key={i} className="flex gap-3 md:gap-6">
                  <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="text-base md:text-xl font-light mb-2 md:mb-3 text-gray-300">
                      {step.title}
                    </h3>
                    <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remixing */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-3 md:mb-6 text-white">
              Remixing Content
            </h2>
            <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed mb-4 md:mb-8">
              KAIZORA's Remix Studio lets you transform existing content using
              AI. Here's how:
            </p>
            <div className="space-y-4">
              {[
                `Click "Remix" on any remixable content to open the Remix Studio.`,
                "Modify the prompt to describe how you want to evolve the content.",
                "Use AI to generate a new version based on the original.",
                "Save your remix as new content — the parent-child relationship is automatically tracked.",
                "Your remix becomes part of the content's family tree, visible to all future viewers.",
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    <span className="text-gray-300">{i + 1}. </span>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Content Types */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-4 md:mb-8 text-white">
              Content Types Supported
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Images",
                  body: "AI-generated art, photos, illustrations, designs, and visual assets from any image AI model.",
                },
                {
                  title: "Videos",
                  body: "AI-created video clips, animations, motion graphics, and video experiments.",
                },
                {
                  title: "Audio",
                  body: "AI-generated music, voice clips, sound effects, and audio compositions.",
                },
                {
                  title: "Text",
                  body: "AI-written articles, scripts, stories, poems, and written content.",
                },
                {
                  title: "Code",
                  body: "AI-generated code snippets, functions, scripts, and programming solutions.",
                },
              ].map((type, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <h3 className="text-base md:text-xl font-light mb-2 text-gray-300">
                    {type.title}
                  </h3>
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    {type.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Getting Help */}
          <div className="pb-8 md:pb-20">
            <h2 className="text-xl md:text-3xl font-light mb-3 md:mb-6 text-white">
              Getting Help
            </h2>
            <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
              Have questions? Check our Licensing Guide for details on license
              types, review our Trust & Safety guidelines, or read our DMCA
              Policy. For direct support, contact us through the platform.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
