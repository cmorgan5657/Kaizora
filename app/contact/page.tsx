"use client";
import { useState } from "react";

type SubmitStatus = "success" | "error" | null;

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    topic: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitStatus("success");
        setFormData({
          name: "",
          email: "",
          topic: "",
          message: "",
        });
        setTimeout(() => setSubmitStatus(null), 5000);
      } else {
        setSubmitStatus("error");
        setTimeout(() => setSubmitStatus(null), 5000);
      }
    } catch (error) {
      console.error("Error:", error);
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation Spacer */}
      <div className="h-6 md:h-12"></div>

      {/* Hero Section */}
      <section className="px-3 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl md:text-5xl font-light mb-2 md:mb-4 text-red-500">
            Contact KAIZORA
          </h1>
          <p className="text-xs md:text-lg text-gray-400 font-light pb-3 md:pb-6">
            We read every message. Tell us what's on your mind.
          </p>
        </div>
      </section>

      {/* Description */}
      <section className="pb-3 md:pb-6 px-3 md:px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs md:text-base text-gray-400 font-extralight leading-relaxed">
            Whether you have questions about the platform, want early access to
            new features, are exploring partnerships or collaborations, have
            feedback on workflows or decisions, or simply want to say hello —
            we're here to listen. Press inquiries welcome.
          </p>
        </div>
      </section>

      {/* Toast Notifications */}
      {submitStatus === "success" && (
        <div
          className="fixed bottom-6 right-6 bg-green-900/90 border border-green-500 rounded p-4 shadow-lg z-50"
          style={{
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <p className="text-green-400">
            Message sent successfully! We'll get back to you soon.
          </p>
          <style jsx>{`
            @keyframes slideIn {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      {submitStatus === "error" && (
        <div
          className="fixed bottom-6 right-6 bg-red-900/90 border border-red-500 rounded p-4 shadow-lg z-50"
          style={{
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <p className="text-red-400">
            Failed to send message. Please try again.
          </p>
          <style jsx>{`
            @keyframes slideIn {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      {/* Contact Form */}
      <section className="pb-6 px-3 md:px-6">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-2.5 md:space-y-4">
            {/* Name Field */}
            <div>
              <label
                htmlFor="name"
                className="block text-xs md:text-sm text-gray-300 mb-1 md:mb-2"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
                required
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-transparent border border-gray-800 rounded focus:outline-none focus:border-red-500 text-xs md:text-base text-white placeholder-gray-600 transition-colors"
              />
            </div>

            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs md:text-sm text-gray-300 mb-1 md:mb-2"
              >
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your@email.com"
                required
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-transparent border border-gray-800 rounded focus:outline-none focus:border-red-500 text-xs md:text-base text-white placeholder-gray-600 transition-colors"
              />
            </div>

            {/* Topic Field */}
            <div>
              <label
                htmlFor="topic"
                className="block text-xs md:text-sm text-gray-300 mb-1 md:mb-2"
              >
                Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="topic"
                name="topic"
                value={formData.topic}
                onChange={handleChange}
                placeholder="What is this about?"
                required
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-transparent border border-gray-800 rounded focus:outline-none focus:border-red-500 text-xs md:text-base text-white placeholder-gray-600 transition-colors"
              />
            </div>

            {/* Message Field */}
            <div>
              <label
                htmlFor="message"
                className="block text-xs md:text-sm text-gray-300 mb-1 md:mb-2"
              >
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="What's on your mind?"
                required
                rows={5}
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-transparent border border-gray-800 rounded focus:outline-none focus:border-red-500 text-xs md:text-base text-white placeholder-gray-600 transition-colors resize-none md:rows-8"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-500 hover:bg-red-600 text-white text-xs md:text-base px-5 md:px-8 py-2 md:py-3 rounded font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending..." : "Send message"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
