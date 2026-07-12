"use client";

import { useEffect } from "react";
import { Shield, AlertTriangle, UserCheck, Lock } from "lucide-react";

export default function TrustAndSafetyPage() {
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
            Trust & Safety
          </h1>
          <p className="text-base md:text-xl text-gray-400 font-light leading-relaxed mb-6 md:mb-8">
            Our commitment to maintaining a safe and trustworthy marketplace.
          </p>

          <div className="border-l-2 border-gray-700 pl-4 md:pl-6 mt-6 md:mt-12">
            <p className="text-sm md:text-lg text-gray-300 font-light leading-relaxed mb-4">
              KAIZORA is committed to fostering a safe, respectful, and creative
              community.
            </p>
            <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
              We've established comprehensive guidelines and safety measures to
              protect both creators and buyers while maintaining a thriving
              marketplace for AI-generated content.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-6 md:py-16 px-3 md:px-6">
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-20">
          {/* Community Guidelines */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-5 md:mb-10 text-white">
              Community Guidelines
            </h2>
            <div className="space-y-6 md:space-y-12">
              {[
                {
                  title: "Respect & Inclusion",
                  intro:
                    "We expect all community members to treat each other with respect. Harassment, hate speech, discrimination, or bullying of any kind will not be tolerated.",
                  items: [
                    "Be respectful in comments and interactions.",
                    "No discriminatory language or imagery.",
                    "No personal attacks or harassment.",
                    "Respect diverse perspectives and backgrounds.",
                  ],
                },
                {
                  title: "Authentic Content",
                  intro:
                    "All content must be genuinely AI-generated and uploaded by the person who created it or has the right to sell it.",
                  items: [
                    "Only upload content you created or have rights to.",
                    "Accurately represent the AI model used.",
                    "Don't claim others' work as your own.",
                    "Don't upload human-created content pretending it's AI-generated.",
                  ],
                },
                {
                  title: "Intellectual Property",
                  intro:
                    "Respect copyright, trademark, and other intellectual property rights.",
                  items: [
                    "Don't upload content that infringes on others' copyrights.",
                    "Don't use trademarked brands without permission.",
                    "Don't create deepfakes or unauthorized likenesses of real people.",
                    "Respond promptly to DMCA notices.",
                  ],
                },
                {
                  title: "Quality & Accuracy",
                  intro:
                    "Provide accurate information about your content and maintain quality standards.",
                  items: [
                    "Write clear, accurate descriptions.",
                    "Use appropriate tags and categories.",
                    "Don't mislead buyers about content quality or capabilities.",
                    "Deliver content as described.",
                  ],
                },
              ].map((section, i) => (
                <div key={i}>
                  <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                    {section.title}
                  </h3>
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
                    {section.intro}
                  </p>
                  <div className="space-y-3">
                    {section.items.map((item, j) => (
                      <div key={j} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                        <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prohibited Content */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg md:text-3xl font-light text-white">
                  Prohibited Content
                </h2>
                <p className="text-xs md:text-lg text-gray-400 font-light mt-1">
                  The following types of content are strictly prohibited on
                  KAIZORA.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Illegal Content",
                  body: "Any content that depicts, promotes, or facilitates illegal activities.",
                },
                {
                  title: "Explicit Adult Content",
                  body: "Sexually explicit or pornographic content of any kind.",
                },
                {
                  title: "Violence & Gore",
                  body: "Graphic violence, gore, or content intended to shock or disturb.",
                },
                {
                  title: "Hate Speech",
                  body: "Content promoting hate, violence, or discrimination against protected groups.",
                },
                {
                  title: "Harmful Misinformation",
                  body: "Content spreading dangerous misinformation about health, safety, or elections.",
                },
                {
                  title: "Child Safety",
                  body: "Any content depicting, sexualizing, or endangering minors.",
                },
                {
                  title: "Malicious Software",
                  body: "Code containing malware, viruses, or malicious scripts.",
                },
                {
                  title: "Scams & Fraud",
                  body: "Fraudulent schemes, phishing attempts, or deceptive practices.",
                },
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <h3 className="text-base md:text-xl font-light mb-2 text-gray-300">
                    {item.title}
                  </h3>
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Reporting & Moderation */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-light text-white self-center">
                Reporting & Moderation
              </h2>
            </div>

            <div className="space-y-5 md:space-y-10">
              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  How to Report Content
                </h3>
                <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
                  If you encounter content that violates our guidelines:
                </p>
                <div className="space-y-3">
                  {[
                    `Click the "Flag" button on the content detail page.`,
                    "Select the reason for flagging (copyright, inappropriate, misleading, etc.).",
                    "Provide additional details if necessary.",
                    "Submit your report — our moderation team will review it promptly.",
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

              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  Moderation Process
                </h3>
                <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
                  Our moderation team reviews all flagged content:
                </p>
                <div className="space-y-3">
                  {[
                    "Reports are reviewed within 24–48 hours.",
                    "Violations result in content removal and potential account warnings.",
                    "Serious or repeated violations may result in account suspension or termination.",
                    "Creators can appeal moderation decisions.",
                  ].map((item, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                      <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-base md:text-xl font-light mb-2 md:mb-4 text-gray-300">
                  DMCA Notices
                </h3>
                <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                  For copyright infringement claims, please submit a formal DMCA
                  notice through our dedicated DMCA process. See our{" "}
                  <a
                    href="/dmca-policy"
                    className="text-gray-300 underline underline-offset-4 hover:text-white transition-colors"
                  >
                    DMCA Policy
                  </a>{" "}
                  for details.
                </p>
              </div>
            </div>
          </div>

          {/* Data Privacy & Security */}
          <div>
            <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
              <div className="flex-shrink-0 w-9 h-9 md:w-12 md:h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-light text-white self-center">
                Data Privacy & Security
              </h2>
            </div>

            <div className="space-y-6">
              {[
                {
                  label: "Your Privacy",
                  body: "We take data privacy seriously. All transactions are encrypted, and we never share your personal information without your consent.",
                },
                {
                  label: "Secure Payments",
                  body: "All payments are processed through Stripe, a PCI-compliant payment processor. We never store your payment information.",
                },
                {
                  label: "Account Security",
                  body: "Enable two-factor authentication, use strong passwords, and never share your account credentials.",
                },
                {
                  label: "Content Security",
                  body: "Your uploaded content is securely stored and only accessible to authorized buyers according to the license terms.",
                },
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    <span className="text-gray-300">{item.label}: </span>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Enforcement Actions */}
          <div>
            <h2 className="text-xl md:text-3xl font-light mb-3 md:mb-6 text-white">
              Enforcement Actions
            </h2>
            <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed mb-3 md:mb-6">
              Violations of our Trust & Safety guidelines may result in:
            </p>
            <div className="space-y-3">
              {[
                "Content removal.",
                "Account warnings.",
                "Temporary suspension of upload privileges.",
                "Temporary or permanent account suspension.",
                "Loss of earnings for fraudulent activity.",
                "Legal action for severe violations.",
              ].map((item, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3 md:pl-6">
                  <p className="text-sm md:text-lg text-gray-400 font-light leading-relaxed">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="pb-8 md:pb-20">
            <h2 className="text-xl md:text-3xl font-light mb-3 md:mb-6 text-white">Contact Us</h2>
            <p className="text-lg text-gray-400 font-light leading-relaxed">
              For trust and safety concerns, please contact our support team.
              For copyright issues, use our DMCA process. We're committed to
              maintaining a safe and thriving community for all creators and
              buyers.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
