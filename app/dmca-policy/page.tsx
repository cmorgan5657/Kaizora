"use client";

import { useState } from "react";

const EMPTY = {
  complainant_name: "",
  complainant_email: "",
  complainant_phone: "",
  complainant_address: "",
  copyrighted_work: "",
  infringing_url: "",
  signature: "",
};

const INPUT =
  "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-light text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 transition-colors";

export default function DMCAPage() {
  const [form, setForm] = useState({ ...EMPTY });
  const [goodFaith, setGoodFaith] = useState(false);
  const [accuracy, setAccuracy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (
      !form.complainant_name.trim() ||
      !form.complainant_email.trim() ||
      !form.complainant_address.trim() ||
      !form.copyrighted_work.trim() ||
      !form.infringing_url.trim() ||
      !form.signature.trim()
    ) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!goodFaith || !accuracy) {
      setError("You must confirm both statements to submit a notice.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dmca/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          good_faith: goodFaith,
          accuracy: accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="pt-16 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs text-gray-600 uppercase tracking-widest">Legal</span>
            <span className="w-8 h-px bg-white/10" />
            <span className="text-xs text-gray-600">17 U.S.C. § 512</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extralight mb-4 tracking-tight">DMCA Policy</h1>
          <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xl">
            Digital Millennium Copyright Act compliance, takedown, and counter-notice procedure.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto space-y-0">

          {/* Copyright Policy */}
          <div className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06]">
            <div className="shrink-0 w-8" />
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Copyright Policy</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                KAIZORA respects the intellectual property rights of others and complies with the Digital Millennium Copyright Act (17 U.S.C. § 512). We respond promptly to valid notices of claimed infringement on our service.
              </p>
            </div>
          </div>

          {/* Designated Agent */}
          <div className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06]">
            <div className="shrink-0 w-8 text-right">
              <span className="text-xs text-gray-700 font-mono">01</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Designated DMCA Agent</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed mb-4">
                Per 17 U.S.C. § 512(c)(2), copyright owners must direct notices to our designated agent:
              </p>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <span className="text-gray-600 w-20 shrink-0">Email</span>
                  <a href="mailto:dmca@kaizora.app" className="text-red-400 hover:text-red-300 transition-colors">dmca@kaizora.app</a>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-600 w-20 shrink-0">Response</span>
                  <span className="text-gray-400">Within 48 hours</span>
                </div>
              </div>
            </div>
          </div>

          {/* File a Notice — FUNCTIONAL FORM */}
          <div className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06]">
            <div className="shrink-0 w-8 text-right">
              <span className="text-xs text-gray-700 font-mono">02</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">File a DMCA Takedown Notice</h2>

              {done ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
                  <p className="text-green-400 text-sm font-light mb-1">
                    Your DMCA takedown notice has been submitted.
                  </p>
                  <p className="text-xs text-gray-500 font-light">
                    Our designated agent will review it and respond within 48 hours.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-400 font-light leading-relaxed mb-5">
                    Complete the form below to submit a valid takedown notice. All fields except phone are required.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Full legal name *</label>
                        <input
                          className={INPUT}
                          value={form.complainant_name}
                          onChange={(e) => set("complainant_name", e.target.value)}
                          placeholder="Jane Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Email *</label>
                        <input
                          type="email"
                          className={INPUT}
                          value={form.complainant_email}
                          onChange={(e) => set("complainant_email", e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Phone (optional)</label>
                        <input
                          className={INPUT}
                          value={form.complainant_phone}
                          onChange={(e) => set("complainant_phone", e.target.value)}
                          placeholder="+1 555 000 0000"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Mailing address *</label>
                        <input
                          className={INPUT}
                          value={form.complainant_address}
                          onChange={(e) => set("complainant_address", e.target.value)}
                          placeholder="Street, City, Country"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">
                        Copyrighted work you claim has been infringed *
                      </label>
                      <textarea
                        rows={3}
                        className={`${INPUT} resize-none`}
                        value={form.copyrighted_work}
                        onChange={(e) => set("copyrighted_work", e.target.value)}
                        placeholder="Describe the original work and your ownership of it."
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">
                        URL of the infringing material on KAIZORA *
                      </label>
                      <input
                        className={INPUT}
                        value={form.infringing_url}
                        onChange={(e) => set("infringing_url", e.target.value)}
                        placeholder="https://kaizora.app/assets/..."
                      />
                    </div>

                    {/* Statements */}
                    <button
                      type="button"
                      onClick={() => { setGoodFaith((v) => !v); setError(""); }}
                      className="flex items-start gap-3 text-left w-full"
                    >
                      <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${goodFaith ? "bg-red-600 border-red-600" : "border-white/20"}`}>
                        {goodFaith && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 font-light leading-relaxed">
                        I have a good-faith belief that use of the material described is not authorized by the copyright owner, its agent, or the law.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setAccuracy((v) => !v); setError(""); }}
                      className="flex items-start gap-3 text-left w-full"
                    >
                      <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${accuracy ? "bg-red-600 border-red-600" : "border-white/20"}`}>
                        {accuracy && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 font-light leading-relaxed">
                        The information in this notice is accurate, and under penalty of perjury, I am the copyright owner or am authorized to act on behalf of the owner.
                      </span>
                    </button>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">
                        Electronic signature (type your full legal name) *
                      </label>
                      <input
                        className={INPUT}
                        value={form.signature}
                        onChange={(e) => set("signature", e.target.value)}
                        placeholder="Jane Doe"
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-red-400 font-light">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-light hover:bg-gray-100 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting…" : "Submit Takedown Notice"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* Counter Notice */}
          <div className="flex gap-6 md:gap-10 py-8 md:py-10 border-b border-white/[0.06]">
            <div className="shrink-0 w-8 text-right">
              <span className="text-xs text-gray-700 font-mono">03</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Counter-Notification</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                If your content was removed and you believe this was the result of mistake or misidentification, you may file a counter-notice by emailing{" "}
                <a href="mailto:dmca@kaizora.app" className="text-red-400 hover:text-red-300 transition-colors">dmca@kaizora.app</a>.
                Once we receive a valid counter-notice, we will forward it to the original complainant. If they do not file suit within 10–14 business days, we may restore the content per 17 U.S.C. § 512(g).
              </p>
            </div>
          </div>

          {/* Repeat Infringer */}
          <div className="flex gap-6 md:gap-10 py-8 md:py-10">
            <div className="shrink-0 w-8 text-right">
              <span className="text-xs text-gray-700 font-mono">04</span>
            </div>
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-light text-white mb-3">Repeat Infringer Policy</h2>
              <p className="text-sm text-gray-400 font-light leading-relaxed">
                KAIZORA terminates, in appropriate circumstances, the accounts of repeat infringers. After three (3) confirmed takedowns, accounts are automatically suspended and all associated content is hidden pending review.
              </p>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
