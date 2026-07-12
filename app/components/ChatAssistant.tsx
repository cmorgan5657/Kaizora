"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  displayedContent?: string;
  recommendedAssets?: string[];
  isTyping?: boolean;
}

interface ChatAssistantProps {
  listings: any[];
}

const CardSkeleton = () => (
  <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 animate-pulse">
    <div className="w-12 h-12 bg-white/10 flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-white/10 w-3/4" />
      <div className="h-2 bg-white/10 w-1/2" />
    </div>
  </div>
);

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-1.5">
      <div
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <div
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <div
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  </div>
);

export default function ChatAssistant({ listings }: ChatAssistantProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm here to help you find the perfect asset. What are you looking for today?",
      displayedContent:
        "Hi! I'm here to help you find the perfect asset. What are you looking for today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTypingEffect, setIsTypingEffect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const showTimer = setTimeout(() => setShowPopup(true), 2000);
    const hideTimer = setTimeout(() => setShowPopup(false), 7000);
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

  const getListingById = (id: string) => listings.find((l) => l.id === id);

  const handleListingClick = (id: string) => {
    router.push(`/assets/${id}`);
  };

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
              recommendedAssets: recommendedAssets,
            };
          }
          return updated;
        });
        setIsTypingEffect(false);
      }
    }, 15);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || isTypingEffect) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      displayedContent: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          listings: listings,
        }),
      });

      const data = await response.json();

      if (data.message) {
        const newMessageIndex = messages.length + 1;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            displayedContent: "",
            isTyping: true,
            recommendedAssets: [],
          },
        ]);
        setIsLoading(false);
        typeMessage(
          data.message,
          newMessageIndex,
          data.recommendedAssets || [],
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, something went wrong.",
            displayedContent: "Sorry, something went wrong.",
          },
        ]);
        setIsLoading(false);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Couldn't process your request.",
          displayedContent: "Couldn't process your request.",
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {showPopup && !isOpen && (
        <div className="fixed bottom-20 right-6 bg-red-600 rounded-xl text-white px-4 py-3 shadow-xl z-50 max-w-xs">
          <p className="text-sm font-light">Need help finding an asset?</p>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-red-600 rounded-full text-white p-3 shadow-lg hover:bg-red-500 transition-all z-50"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[520px] bg-black border border-white/15 shadow-2xl flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-red-500" />
              <span className="text-white text-sm font-light">Assistant</span>
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" data-lenis-prevent>
            {messages.map((msg, index) => (
              <div key={index}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-red-600 text-white"
                        : "bg-white/5 text-gray-300 border border-white/10"
                    }`}
                  >
                    {msg.displayedContent || msg.content}
                    {msg.isTyping && (
                      <span className="inline-block w-px h-3.5 bg-gray-400 ml-0.5 animate-pulse" />
                    )}
                  </div>
                </div>

                {msg.role === "assistant" &&
                  msg.isTyping &&
                  msg.content.length > 30 && (
                    <div className="mt-2 space-y-1.5">
                      <CardSkeleton />
                    </div>
                  )}

                {msg.recommendedAssets &&
                  msg.recommendedAssets.length > 0 &&
                  !msg.isTyping && (
                    <div className="mt-2 space-y-1.5">
                      {msg.recommendedAssets.map((id, cardIndex) => {
                        const listing = getListingById(id);
                        if (!listing) return null;

                        return (
                          <div
                            key={id}
                            onClick={() => handleListingClick(id)}
                            className="flex items-center gap-3 p-2.5 bg-white/[0.03] border border-white/10 hover:border-red-500/40 cursor-pointer transition-all group/card"
                            style={{
                              animation: `fadeIn 0.25s ease-out ${cardIndex * 0.1}s both`,
                            }}
                          >
                            <div className="w-11 h-11 bg-zinc-900 overflow-hidden flex-shrink-0 border border-white/5">
                              {listing.assets?.thumbnail_path ||
                              listing.assets?.storage_path ? (
                                <img
                                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${listing.assets.thumbnail_path || listing.assets.storage_path}`}
                                  alt={listing.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-700 text-[8px]">
                                  —
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs truncate group-hover/card:text-red-400 transition-colors">
                                {listing.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-gray-600 text-[10px]">
                                  {listing.category || "—"}
                                </span>
                                <span className="text-gray-800 text-[10px]">
                                  ·
                                </span>
                                <span className="text-red-400/60 text-[10px]">
                                  {listing.profiles?.display_name || "Unknown"}
                                </span>
                              </div>
                            </div>

                            <ExternalLink className="w-3 h-3 text-gray-700 group-hover/card:text-red-400 transition-colors flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            ))}

            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={isLoading || isTypingEffect}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:border-red-500/50 focus:outline-none disabled:opacity-40 transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || isTypingEffect || !input.trim()}
                className="px-3 py-2 bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <style jsx>{`
            @keyframes fadeIn {
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
