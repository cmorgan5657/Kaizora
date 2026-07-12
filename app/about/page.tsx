"use client";

import { useEffect } from "react";
import { Flame, Sparkles, Users, Zap } from "lucide-react";

const featureCards = [
  {
    icon: Flame,
    title: "Regenerate & Rebirth",
    body:
      "Transform abandoned AI outputs into marketable assets. Your discarded content could be someone else's perfect starting point for their creative vision.",
  },
  {
    icon: Sparkles,
    title: "Remix & Evolve",
    body:
      "Use our built-in AI remix studio to transform existing content into something new. Build upon the work of others and track the creative lineage.",
  },
  {
    icon: Users,
    title: "Creator Community",
    body:
      "Join a vibrant community of AI creators who share, collaborate, and monetize their creations. Follow your favorite creators and discover new content daily.",
  },
  {
    icon: Zap,
    title: "Instant Value",
    body:
      "Turn your AI experiments into income. Set your own prices, offer free content, or create remixable assets that earn you royalties.",
  },
];

const problemPoints = [
  "Wasted computational resources and energy",
  "Lost creative potential and artistic exploration",
  "Missed opportunities for collaboration and remixing",
  "No return on the time invested in prompt engineering",
];

export default function AboutPage() {
  useEffect(() => {
    let scrollInterval: ReturnType<typeof setInterval>;
    let isAutoScrolling = true;

    const startAutoScroll = () => {
      scrollInterval = setInterval(() => {
        if (!isAutoScrolling) return;

        window.scrollBy({
          top: 1,
          behavior: "smooth",
        });

        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 10
        ) {
          clearInterval(scrollInterval);
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
    <main className="min-h-screen bg-[#04080f] text-white">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:px-8 md:pb-28 md:pt-20">
        <section className="max-w-4xl">
          <h1 className="text-4xl font-bold tracking-tight text-[#ff2f5d] md:text-6xl">
            About KAIZORA
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/55 md:text-[1.7rem] md:leading-[1.55]">
            Rise from the ashes. The world's premier AI content regeneration
            platform.
          </p>
        </section>

        <section className="mt-14 max-w-5xl md:mt-20">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Our Mission
          </h2>
          <div className="mt-6 space-y-6 text-lg leading-9 text-white/55 md:text-[1.35rem]">
            <p>
              Every day, millions of AI-generated assets are created and
              discarded. Images that never made it to social media, scripts that
              were never filmed, code snippets that were never deployed, and
              countless other digital artifacts that represent hours of
              computational work and creative prompting.
            </p>
            <p>
              KAIZORA exists to give these creations a second life. We believe
              that every AI output holds potential, a spark waiting to be
              reignited into something extraordinary.
            </p>
          </div>
        </section>

        <section className="mt-12 grid gap-6 md:mt-14 md:grid-cols-2">
          {featureCards.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-[#7b1630] bg-[radial-gradient(circle_at_top_left,_rgba(255,52,98,0.16),_transparent_38%),linear-gradient(135deg,_rgba(41,7,20,0.96),_rgba(9,8,23,0.96))] px-6 py-7 shadow-[0_0_0_1px_rgba(255,44,92,0.02),0_18px_50px_rgba(0,0,0,0.35)]"
            >
              <Icon className="h-9 w-9 text-[#ff244f]" strokeWidth={2.1} />
              <h3 className="mt-8 text-2xl font-semibold tracking-tight text-white">
                {title}
              </h3>
              <p className="mt-4 text-lg leading-8 text-white/58">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-14 max-w-5xl md:mt-20">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            The Problem We Solve
          </h2>
          <p className="mt-6 text-lg leading-9 text-white/55 md:text-[1.35rem]">
            AI generation is incredibly powerful, but it's also wasteful. For
            every perfect output, there are dozens of near-misses, interesting
            failures, and experimental results that get deleted. This
            represents:
          </p>
          <ul className="mt-7 space-y-4 pl-6 text-lg leading-8 text-white/62 marker:text-white/62 md:text-[1.28rem]">
            {problemPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="mt-14 max-w-5xl md:mt-20">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Our Vision
          </h2>
          <p className="mt-6 text-lg leading-9 text-white/55 md:text-[1.35rem]">
            We envision a future where no AI-generated content goes to waste.
            Where every experimental output, every creative iteration, and every
            abandoned project can find value in the hands of another creator.
            KAIZORA is building the infrastructure for a circular economy of AI
            content, where creation, consumption, and recreation form a
            continuous cycle of rebirth.
          </p>
        </section>

        <section className="mt-14 max-w-5xl md:mt-20">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Join the Movement
          </h2>
          <p className="mt-6 text-lg leading-9 text-white/55 md:text-[1.35rem]">
            Whether you're a prolific AI creator with gigabytes of unused
            outputs, or someone looking for premium AI assets to kickstart your
            next project, KAIZORA is your platform. Together, we're building a
            more sustainable and collaborative future for AI-generated content.
          </p>
        </section>
      </div>
    </main>
  );
}


// "use client";

// import { useEffect } from "react";

// export default function AboutPage() {
//   useEffect(() => {
//     let scrollInterval: NodeJS.Timeout;
//     let isAutoScrolling = true;

//     const startAutoScroll = () => {
//       scrollInterval = setInterval(() => {
//         if (isAutoScrolling) {
//           window.scrollBy({
//             top: 1,
//             behavior: "smooth",
//           });

//           // Stop when reaching bottom
//           if (
//             window.innerHeight + window.scrollY >=
//             document.body.offsetHeight - 10
//           ) {
//             clearInterval(scrollInterval);
//           }
//         }
//       }, 70);
//     };

//     // Start auto-scroll after a brief delay
//     const timeout = setTimeout(startAutoScroll, 500);

//     // Stop auto-scroll on any user interaction
//     const handleUserInteraction = () => {
//       isAutoScrolling = false;
//       clearInterval(scrollInterval);
//     };

//     window.addEventListener("wheel", handleUserInteraction, { passive: true });
//     window.addEventListener("touchstart", handleUserInteraction, {
//       passive: true,
//     });
//     window.addEventListener("touchmove", handleUserInteraction, {
//       passive: true,
//     });
//     window.addEventListener("keydown", handleUserInteraction);
//     window.addEventListener("mousedown", handleUserInteraction);

//     return () => {
//       clearTimeout(timeout);
//       clearInterval(scrollInterval);
//       window.removeEventListener("wheel", handleUserInteraction);
//       window.removeEventListener("touchstart", handleUserInteraction);
//       window.removeEventListener("touchmove", handleUserInteraction);
//       window.removeEventListener("keydown", handleUserInteraction);
//       window.removeEventListener("mousedown", handleUserInteraction);
//     };
//   }, []);

//   return (
//     <div className="min-h-screen bg-black text-white">
//       {/* Hero */}
//       <section className="pt-20 md:pt-32 pb-8 md:pb-20 px-3 md:px-6">
//         <div className="max-w-4xl mx-auto">
//           <h1 className="text-xl md:text-5xl font-extralight mb-3 md:mb-6 text-gray-300">
//             About KAIZORA
//           </h1>

//           <p className="text-xs md:text-xl text-gray-400 font-light leading-relaxed mb-4 md:mb-8">
//             The world's first fully AI-operated content marketplace. No human
//             backend. No manual processes. Pure autonomous commerce.
//           </p>

//           <div className="border-l-2 border-gray-700 pl-3 md:pl-6 mt-6 md:mt-12">
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed mb-2 md:mb-4">
//               Founded in 2025, KAIZORA emerged from a simple but growing
//               tension: Creation had become effortless. Decision-making had not.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               AI made it possible to generate more images, videos, concepts, and
//               variations in a day than most creators once made in a year. But
//               that abundance introduced a new problem — not how to create, but
//               how to decide.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               What's worth taking further? What belongs in a marketplace? What
//               should be remixed, licensed, shared — or left behind?
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               KAIZORA started to address that moment.
//             </p>
//           </div>
//         </div>
//       </section>

//       {/* Main Content */}
//       <section className="py-8 md:py-16 px-3 md:px-6">
//         <div className="max-w-4xl mx-auto space-y-8 md:space-y-20">
//           {/* The Problem We're Solving */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               The Problem We're Solving
//             </h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
//               In the age of generative AI, creation is no longer the
//               bottleneck—curation is. Creators face an overwhelming abundance of
//               possibilities, while buyers struggle to find exactly what they
//               need among countless options.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
//               Traditional marketplaces weren't built for this reality. They rely
//               on manual uploads, human moderation, and static search
//               filters—systems designed for scarcity, not abundance.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//               KAIZORA reimagines the marketplace for an AI-native world, where
//               intelligent agents help you navigate, decide, and transact at the
//               speed of thought.
//             </p>
//           </div>

//           {/* What KAIZORA Is */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               What KAIZORA Is
//             </h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
//               KAIZORA is an agentic commerce platform where AI agents handle
//               every aspect of content creation, buying, and selling. Creators
//               and buyers interact with intelligent AI systems that guide,
//               recommend, and execute—eliminating the need for human backend
//               operations.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
//               This is not a marketplace with AI features. This is a marketplace
//               run entirely by AI.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               Every decision, every transaction, every recommendation—powered by
//               autonomous intelligence working on your behalf.
//             </p>
//           </div>

//           {/* For Creators */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               For Creators
//             </h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               Create AI-generated content with complete AI guidance. Our
//               autonomous agents assist you through the entire creation
//               process—from generation to optimization to listing.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               The AI understands your intent, suggests improvements, handles
//               technical details, and lists your content automatically. No manual
//               uploads. No configuration. No human touch required.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               You focus on creativity. The AI handles everything else.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               From idea to marketplace—guided by intelligence that understands
//               both your vision and what buyers are seeking.
//             </p>
//           </div>

//           {/* For Buyers */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">For Buyers</h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               Purchase content with AI assistance at every step. Tell our AI
//               agents what you need, and they search, filter, evaluate, and
//               recommend assets that match your requirements.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               The AI handles licensing verification, payment processing, and
//               instant delivery. The entire transaction happens autonomously—no
//               waiting for human approval or manual processing.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               You get what you need. Instantly. Intelligently.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               Describe your needs in natural language, and let AI navigate the
//               complexity of finding the perfect asset.
//             </p>
//           </div>

//           {/* How It Works */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               How It Works
//             </h2>
//             <div className="space-y-3 md:space-y-6">
//               <div>
//                 <h3 className="text-sm md:text-xl font-light mb-1.5 md:mb-3 text-gray-300">
//                   AI-Guided Creation
//                 </h3>
//                 <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//                   Creators interact with AI agents to generate content. The AI
//                   suggests improvements, optimizes assets for marketability, and
//                   automatically handles listing with proper metadata and pricing
//                   recommendations. Think of it as having an expert curator and
//                   business manager working alongside you—available instantly,
//                   every time you create.
//                 </p>
//               </div>

//               <div>
//                 <h3 className="text-sm md:text-xl font-light mb-1.5 md:mb-3 text-gray-300">
//                   AI-Assisted Discovery
//                 </h3>
//                 <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//                   Buyers describe their needs in natural language. AI agents
//                   search the marketplace, understand context and intent, then
//                   surface the most relevant assets with detailed compatibility
//                   analysis. No more keyword guessing or endless scrolling—just
//                   intelligent recommendations that match what you actually need.
//                 </p>
//               </div>

//               <div>
//                 <h3 className="text-sm md:text-xl font-light mb-1.5 md:mb-3 text-gray-300">
//                   Autonomous Transactions
//                 </h3>
//                 <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//                   AI agents execute the complete purchase flow—license
//                   validation, payment processing, file delivery, and receipt
//                   generation. Every transaction happens without human backend
//                   involvement. From click to delivery in seconds, not days.
//                 </p>
//               </div>

//               <div>
//                 <h3 className="text-sm md:text-xl font-light mb-1.5 md:mb-3 text-gray-300">
//                   Continuous Learning
//                 </h3>
//                 <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//                   Our AI agents learn from every interaction, improving
//                   recommendations, refining search results, and optimizing the
//                   entire marketplace experience. The more you use KAIZORA, the
//                   better it understands your needs and preferences.
//                 </p>
//               </div>
//             </div>
//           </div>

//           {/* The Technology */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               The Technology
//             </h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               KAIZORA runs on a fully agentic backend architecture. Every
//               function—from content analysis to transaction processing—is
//               handled by specialized AI agents that operate autonomously.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               These agents make decisions, learn from interactions, and execute
//               complex workflows without human intervention. They understand
//               context, handle edge cases, and continuously optimize their
//               operations.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               This is the first commercial implementation of a completely
//               AI-driven backend for e-commerce.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               We've built the infrastructure that allows AI to not just assist
//               commerce, but to run it—autonomously, intelligently, at scale.
//             </p>
//           </div>

//           {/* Why It Matters */}
//           <div>
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">
//               Why It Matters
//             </h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               Traditional marketplaces require extensive human
//               operations—content moderation, customer support, transaction
//               processing, quality control. These create bottlenecks, delays, and
//               scaling limitations.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               KAIZORA eliminates these constraints. AI agents operate 24/7,
//               process thousands of requests simultaneously, and make intelligent
//               decisions in real-time.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               We're not just building a marketplace. We're proving that commerce
//               doesn't need human backends—just intelligent automation.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed">
//               This represents a fundamental shift: from platforms that connect
//               people to platforms that think, decide, and act on behalf of both
//               creators and buyers.
//             </p>
//           </div>

//           {/* Vision */}
//           <div className="pb-8 md:pb-20">
//             <h2 className="text-lg md:text-3xl font-light mb-3 md:mb-6 text-white">Our Vision</h2>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               KAIZORA represents the future of commerce. A future where
//               intelligent systems handle complexity, where transactions happen
//               instantly, and where human creativity is amplified by autonomous
//               operations.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed mb-2 md:mb-4">
//               We're building the infrastructure for AI-native commerce—where the
//               abundance created by generative AI becomes navigable, valuable,
//               and accessible to everyone.
//             </p>
//             <p className="text-xs md:text-lg text-gray-300 font-light leading-relaxed mb-2 md:mb-4">
//               In a world where anyone can create anything, the question isn't
//               what's possible—it's what's worth pursuing. KAIZORA helps you
//               answer that question.
//             </p>
//             <p className="text-xs md:text-lg text-gray-400 font-light leading-relaxed">
//               This is just the beginning.
//             </p>
//           </div>
//         </div>
//       </section>
//     </div>
//   );
// }


