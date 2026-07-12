"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Sparkles, Users, Zap } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  displayedContent?: string;
  isTyping?: boolean;
  isProactive?: boolean;
}

interface CommunityAssistantProps {
  assets: any[];
  users: any[];
  challenges: any[];
  focusedUser?: any | null;
  currentUser?: any;
}

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-white/5 border border-white/10 px-3 py-2.5 flex items-center gap-1.5 rounded-lg">
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

const QUICK_PROMPTS = [
  "What's trending right now?",
  "Who are the top creators?",
  "Any active challenges?",
  "What content types are popular?",
  "Who should I connect with?",
  "Show me free posts",
];

export default function CommunityAssistant({
  assets,
  users,
  challenges,
  focusedUser,
  currentUser,
}: CommunityAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your KAIZORA Community Assistant. Ask me anything about the community — trending posts, top creators, active challenges, or who to connect with.",
      displayedContent:
        "Hi! I'm your KAIZORA Community Assistant. Ask me anything about the community — trending posts, top creators, active challenges, or who to connect with.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTypingEffect, setIsTypingEffect] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const proactiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevFocusedUserRef = useRef<string | null>(null);
  const lastProactiveTimeRef = useRef<number>(0);
  // Pending type job: {content, index} set synchronously inside setMessages, consumed by useEffect
  const pendingTypeRef = useRef<{ content: string; index: number } | null>(
    null,
  );

  // Popup hint
  useEffect(() => {
    const show = setTimeout(() => setShowPopup(true), 2500);
    const hide = setTimeout(() => setShowPopup(false), 7500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    // Consume pending type job AFTER state has settled
    if (pendingTypeRef.current) {
      const { content, index } = pendingTypeRef.current;
      pendingTypeRef.current = null;
      startTyping(content, index);
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    };
  }, []);

  // No scroll lock — panel is fixed-position overlay, page scroll stays active

  // Proactive hover trigger
  useEffect(() => {
    if (!focusedUser) return;
    // Debounce: same user OR too soon after last proactive (10s cooldown)
    if (prevFocusedUserRef.current === focusedUser.id) return;
    const now = Date.now();
    if (now - lastProactiveTimeRef.current < 10000) return;

    prevFocusedUserRef.current = focusedUser.id;
    lastProactiveTimeRef.current = now;

    if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    proactiveTimerRef.current = setTimeout(() => {
      setIsOpen(true);
      triggerProactiveInsight(focusedUser);
    }, 1000);

    return () => {
      if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    };
  }, [focusedUser]);

  const buildSnapshots = useCallback(() => {
    const feedSnapshot = assets.slice(0, 50).map((a: any) => ({
      title: a.title || "Untitled",
      type: a.content_type || "post",
      creator: a.profiles?.display_name || "Unknown",
      price:
        a.price_cents > 0 ? `$${(a.price_cents / 100).toFixed(2)}` : "Free",
      date: new Date(a.created_at).toLocaleDateString(),
    }));
    const creatorsSnapshot = users.slice(0, 40).map((u: any) => ({
      name: u.display_name || "Anonymous",
      bio: u.bio || "",
      assetCount: u.assetCount ?? 0,
      rating: u.averageRating > 0 ? u.averageRating.toFixed(1) : null,
      reviews: u.reviewCount || 0,
      joinedYear: u.created_at ? new Date(u.created_at).getFullYear() : null,
    }));
    const challengesSnapshot = (challenges || []).map((c: any) => ({
      title: c.title,
      theme: c.theme || "",
      prize: c.prize || "TBD",
      entries: c.entries_count || 0,
      deadline: c.deadline ? new Date(c.deadline).toLocaleDateString() : "TBD",
      status: c.status,
    }));
    return { feedSnapshot, creatorsSnapshot, challengesSnapshot };
  }, [assets, users, challenges]);

  // Core typing engine — writes character by character into message at given index
  const startTyping = useCallback(
    (fullContent: string, messageIndex: number) => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
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
          clearInterval(typingIntervalRef.current!);
          typingIntervalRef.current = null;
          setIsTypingEffect(false);
        }
      }, 10);
    },
    [],
  );

  const triggerProactiveInsight = async (user: any) => {
    if (isLoading || isTypingEffect) return;
    setIsLoading(true);
    setShowQuickPrompts(false);
    const { feedSnapshot, creatorsSnapshot, challengesSnapshot } =
      buildSnapshots();
    const proactivePrompt = `The user just hovered on ${user.display_name || "a creator"}'s card. Give a sharp 2-sentence insight: bio: "${user.bio || "none"}", assets: ${user.assetCount ?? 0}, rating: ${user.averageRating > 0 ? `★${user.averageRating} from ${user.reviewCount} reviews` : "no reviews yet"}, joined: ${user.created_at ? new Date(user.created_at).getFullYear() : "unknown"}. Is this creator worth connecting with?`;
    try {
      const res = await fetch("/api/community-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: proactivePrompt }],
          feedSnapshot,
          creatorsSnapshot,
          challengesSnapshot,
          focusedUser: user,
          isProactive: true,
        }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => {
          const newIndex = prev.length;
          // Schedule typing job — will be consumed by useEffect after render
          pendingTypeRef.current = { content: data.message, index: newIndex };
          return [
            ...prev,
            {
              role: "assistant",
              content: data.message,
              displayedContent: "",
              isTyping: true,
              isProactive: true,
            },
          ];
        });
      }
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const text = (overrideInput || input).trim();
    if (!text || isLoading || isTypingEffect) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      displayedContent: text,
    };
    let snapshotMessages: Message[] = [];

    setMessages((prev) => {
      snapshotMessages = [...prev, userMessage];
      return snapshotMessages;
    });

    setInput("");
    setIsLoading(true);
    setShowQuickPrompts(false);
    const { feedSnapshot, creatorsSnapshot, challengesSnapshot } =
      buildSnapshots();

    try {
      const res = await fetch("/api/community-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...snapshotMessages].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          feedSnapshot,
          creatorsSnapshot,
          challengesSnapshot,
          focusedUser: focusedUser || null,
        }),
      });
      const data = await res.json();
      const reply = data.message || "Sorry, something went wrong.";

      setMessages((prev) => {
        const newIndex = prev.length;
        pendingTypeRef.current = { content: reply, index: newIndex };
        return [
          ...prev,
          {
            role: "assistant",
            content: reply,
            displayedContent: "",
            isTyping: true,
          },
        ];
      });
    } catch {
      const errMsg = "Couldn't reach the assistant. Try again.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errMsg,
          displayedContent: errMsg,
          isTyping: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Popup hint */}
      {showPopup && !isOpen && (
        <div className="fixed bottom-16 right-3 md:bottom-20 md:right-6 bg-[#0e0e0e] border border-red-500/30 text-white px-3 py-2 shadow-xl shadow-red-500/10 z-50 max-w-[190px] rounded-xl">
          <p className="text-[11px] text-gray-300 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-red-400 flex-shrink-0" />
            Ask me about the community
          </p>
        </div>
      )}

      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-3 right-3 md:bottom-6 md:right-6 bg-red-600 rounded-full text-white p-3 shadow-lg shadow-red-500/30 hover:bg-red-500 hover:scale-105 transition-all duration-200 z-50"
          aria-label="Open Community Assistant"
        >
          <Users className="w-5 h-5" />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed bottom-0 right-0 left-0 md:bottom-6 md:right-6 md:left-auto md:w-[370px] bg-[#0a0a0a] border-t md:border border-white/[0.1] shadow-2xl shadow-black/60 flex flex-col z-50 md:rounded-2xl overflow-hidden"
          style={{ height: "55dvh", maxHeight: "540px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-gradient-to-r from-red-600/10 to-transparent shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-red-600/20 border border-red-500/30 rounded-full flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
              </div>
              <div>
                <span className="text-white text-[13px] font-semibold block leading-tight">
                  Community Assistant
                </span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                  Powered by Gemini
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            data-lenis-prevent
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] px-3 py-2 text-[12px] leading-relaxed rounded-xl ${
                    msg.role === "user"
                      ? "bg-red-600 text-white rounded-br-sm"
                      : "bg-white/[0.05] text-gray-200 border border-white/[0.08] rounded-bl-sm"
                  }`}
                >
                  {msg.isProactive && (
                    <div className="flex items-center gap-1 mb-1.5 text-[10px] text-red-400/80">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Creator insight</span>
                    </div>
                  )}
                  {msg.displayedContent || msg.content}
                  {msg.isTyping && (
                    <span className="inline-block w-px h-3 bg-gray-400 ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            ))}

            {isLoading && <TypingIndicator />}

            {/* Quick Prompts */}
            {showQuickPrompts && messages.length <= 1 && (
              <div className="space-y-2 pt-1">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider px-1">
                  Quick questions
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="text-left px-2.5 py-2 bg-white/[0.03] border border-white/[0.08] hover:border-red-500/35 hover:bg-red-500/[0.05] text-[11px] text-gray-500 hover:text-white transition-all rounded-lg leading-snug"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-white/[0.08] shrink-0">
            <div className="flex gap-2 items-center bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 focus-within:border-red-500/40 transition-colors">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => e.target.scrollIntoView({ block: "nearest" })}
                placeholder="Ask about the community…"
                disabled={isLoading || isTypingEffect}
                autoComplete="off"
                enterKeyHint="send"
                className="flex-1 bg-transparent text-[12px] text-white placeholder-gray-600 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || isTypingEffect || !input.trim()}
                className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
