"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getLicenseRule } from "@/lib/licenses";
type AgentMode = "AUTO" | "SUGGEST";
type TabType = "automation" | "ai-agents" | "licenses" | "payouts";

export default function CreatorSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("automation");
  const [mode, setMode] = useState<AgentMode>("AUTO");
  const [updating, setUpdating] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [aiUpdating, setAiUpdating] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingAIState, setPendingAIState] = useState<boolean | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationUpdating, setAutomationUpdating] = useState(false);
  // License preferences state
  const [licenseTypes, setLicenseTypes] = useState<any[]>([]);
  const [autoLicensePrefs, setAutoLicensePrefs] = useState<
    Record<string, boolean>
  >({});
  const [licenseUpdating, setLicenseUpdating] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  // Add this after the stripeConnected state
  useEffect(() => {
    console.log("💡 stripeConnected state changed to:", stripeConnected);
  }, [stripeConnected]);
  useEffect(() => {
    async function loadSettings() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Load AI global switch
      const { data: aiControl } = await supabase
        .from("ai_controls")
        .select("enabled")
        .eq("key", "agents_enabled")
        .single();

      if (aiControl) {
        setAiEnabled(aiControl.enabled);
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("automation_enabled, auto_license_preferences")
        .eq("id", user.id)
        .single();
      if (profile) {
        setAutomationEnabled(profile.automation_enabled ?? false);
        setAutoLicensePrefs(
          profile.auto_license_preferences || { personal: true }
        );
      }

      // Load license types
      const { data: licenses } = await supabase
        .from("license_types")
        .select("*")
        .eq("is_active", true)
        .order("price_multiplier", { ascending: true });

      if (licenses) {
        setLicenseTypes(licenses);
      }
      const { data: assets } = await supabase
        .from("assets")
        .select("agent_mode")
        .eq("owner_id", user.id);

      if (assets && assets.length > 0) {
        const autoCount = assets.filter((a) => a.agent_mode === "AUTO").length;
        const suggestCount = assets.filter(
          (a) => a.agent_mode === "SUGGEST"
        ).length;
        setMode(autoCount >= suggestCount ? "AUTO" : "SUGGEST");
      }

      setLoading(false);
    }

    loadSettings();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const payout = params.get("payout");

    if (payout === "success") {
      setActiveTab("payouts");
      setStripeConnected(true);
      setNotification({
        type: "success",
        message: "Stripe connected successfully. You can now receive payouts.",
      });

      window.history.replaceState({}, "", window.location.pathname);
    }

    if (payout === "retry") {
      setActiveTab("payouts");
      setStripeConnected(false);
      setNotification({
        type: "error",
        message: "Stripe setup incomplete. Please try again.",
      });

      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  //
  useEffect(() => {
    if (activeTab !== "payouts") return;

    let mounted = true;

    async function checkStripeStatus() {
      try {
        console.log("🔍 Starting Stripe status check...");

        const { data } = await supabase.auth.getSession();
        console.log("📧 Session exists?", !!data.session);

        if (!data.session || !mounted) {
          console.log("⚠️ No session or unmounted");
          return;
        }

        console.log("📡 Fetching /api/stripe/check-status...");

        const res = await fetch("/api/stripe/check-status", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });

        console.log("📊 Response status:", res.status);
        console.log("📊 Response OK?", res.ok);

        const json = await res.json();
        console.log("📦 Response JSON:", json);

        if (mounted) {
          const isConnected = json.status === "completed";
          console.log("✅ Setting stripeConnected to:", isConnected);
          setStripeConnected(isConnected);
        }
      } catch (error) {
        console.error("❌ Stripe status check failed:", error);
      }
    }

    checkStripeStatus();

    return () => {
      mounted = false;
    };
  }, [activeTab]);
  //
  async function updateGlobalMode(newMode: AgentMode) {
    if (mode === newMode) return;

    setUpdating(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setNotification({ type: "error", message: "User not found" });
        return;
      }

      const { error } = await supabase
        .from("assets")
        .update({ agent_mode: newMode })
        .eq("owner_id", user.id);

      if (error) throw error;

      setMode(newMode);
      setNotification({
        type: "success",
        message: `Mode changed to ${newMode}`,
      });
    } catch (error) {
      console.error(error);
      setNotification({
        type: "error",
        message: "Failed to update mode",
      });
    } finally {
      setUpdating(false);
    }
  }

  async function updateAIGlobalSwitch(newValue: boolean) {
    if (aiEnabled === newValue) return;

    setAiUpdating(true);

    try {
      const { error } = await supabase
        .from("ai_controls")
        .update({ enabled: newValue })
        .eq("key", "agents_enabled");

      if (error) throw error;

      setAiEnabled(newValue);
      setNotification({
        type: "success",
        message: `AI agents ${newValue ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error(error);
      setNotification({
        type: "error",
        message: "Failed to update AI setting",
      });
    } finally {
      setAiUpdating(false);
    }
  }

  function handleAIToggle(newValue: boolean) {
    if (!newValue && aiEnabled) {
      setPendingAIState(newValue);
      setShowConfirmation(true);
    } else {
      updateAIGlobalSwitch(newValue);
    }
  }

  function confirmAIToggle() {
    if (pendingAIState !== null) {
      updateAIGlobalSwitch(pendingAIState);
    }
    setShowConfirmation(false);
    setPendingAIState(null);
  }

  function cancelConfirmation() {
    setShowConfirmation(false);
    setPendingAIState(null);
  }

  async function updateAutomationEnabled(newValue: boolean) {
    setAutomationUpdating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNotification({ type: "error", message: "User not found" });
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ automation_enabled: newValue })
        .eq("id", user.id);

      if (error) throw error;

      setAutomationEnabled(newValue);
      setNotification({
        type: "success",
        message: `Creator automation ${newValue ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error(error);
      setNotification({ type: "error", message: "Failed to update" });
    } finally {
      setAutomationUpdating(false);
    }
  }
  //
  async function updateLicensePreferences(slug: string, checked: boolean) {
    setLicenseUpdating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newPrefs = { ...autoLicensePrefs, [slug]: checked };
      setAutoLicensePrefs(newPrefs);

      const { error } = await supabase
        .from("profiles")
        .update({ auto_license_preferences: newPrefs })
        .eq("id", user.id);

      if (error) throw error;

      setNotification({
        type: "success",
        message: "License preferences updated",
      });
    } catch (error) {
      console.error(error);
      setNotification({ type: "error", message: "Failed to update" });
    } finally {
      setLicenseUpdating(false);
    }
  }
  //

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-2 md:px-4">
        <Skeleton className="h-10 w-64 bg-white/10 mb-4" />
        <Skeleton className="h-4 w-96 bg-white/10 mb-8" />

        <div className="space-y-4">
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-6 border border-white/10 transition-all duration-500 overflow-hidden">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600" />
            <Skeleton className="h-6 w-48 bg-white/10 mb-2" />
            <Skeleton className="h-4 w-80 bg-white/10 mb-4" />
            <Skeleton className="w-11 h-6 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 md:px-4 relative">
      {/* Background gradient orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none animate-pulse -z-10" />

      {/* Header */}
      <div className="mb-6 md:mb-12">
        <h1 className="text-xl md:text-5xl font-extralight mb-3 tracking-tight">
          <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
            Creator Control Center
          </span>
        </h1>
      </div>
      {/* Tab Navigation */}
      <div className="flex gap-1 md:gap-2 mb-4 md:mb-8 border-b border-white/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab("automation")}
          className={`px-3 md:px-6 py-2 md:py-3 text-xs md:text-sm whitespace-nowrap font-light transition-all duration-300 border-b-2 ${
            activeTab === "automation"
              ? "border-red-500 text-red-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Creator Automation
        </button>
        <button
          onClick={() => setActiveTab("ai-agents")}
          className={`px-3 md:px-6 py-2 md:py-3 text-xs md:text-sm whitespace-nowrap font-light transition-all duration-300 border-b-2 ${
            activeTab === "ai-agents"
              ? "border-red-500 text-red-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          AI Agents
        </button>
        <button
          onClick={() => setActiveTab("payouts")}
          className={`px-3 md:px-6 py-2 md:py-3 text-xs md:text-sm whitespace-nowrap font-light transition-all duration-300 border-b-2 ${
            activeTab === "payouts"
              ? "border-red-500 text-red-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Payouts
        </button>
      </div>
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-20 right-4 p-2 md:p-3 text-xs md:text-sm font-light rounded border shadow-lg z-50 animate-slide-in backdrop-blur-sm ${
            notification.type === "success"
              ? "bg-green-500/20 border-green-500 text-green-400"
              : "bg-red-500/20 border-red-500 text-red-400"
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={cancelConfirmation}
        >
          <div
            className="relative bg-gradient-to-br from-zinc-900/95 to-black/95 backdrop-blur-xl border border-red-500/30 p-5 md:p-8 max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-red-500 to-red-600" />

            <h3 className="text-lg md:text-xl font-light mb-3 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              Disable AI Agents?
            </h3>
            <p className="text-sm text-gray-400 font-light mb-8 leading-relaxed">
              This will stop all AI agents from running across your entire
              system. No automatic pricing changes will be applied.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelConfirmation}
                className="px-5 py-2.5 text-xs md:text-sm border border-white/20 text-gray-400 hover:bg-white/5 hover:border-white/30 transition-all duration-300 font-light"
              >
                Cancel
              </button>
              <button
                onClick={confirmAIToggle}
                className="px-5 py-2.5 text-xs md:text-sm bg-gradient-to-r from-red-600 to-red-700 text-white hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 font-light"
              >
                Disable AI
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 md:space-y-4">
        {/* Automation Tab */}
        {activeTab === "automation" && (
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-3 md:p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm md:text-lg font-light mb-1 text-white">
                    Creator Automation
                  </h2>
                  <p className="text-xs md:text-sm text-gray-400 font-light">
                    Auto-publish assets when you upload files
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      automationEnabled
                        ? "bg-red-500 shadow-lg shadow-red-500/50"
                        : "bg-gray-600"
                    }`}
                  />
                  <span className="text-xs font-light text-gray-400">
                    {automationEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <span
                  className={`text-xs font-light ${
                    !automationEnabled ? "text-red-400" : "text-gray-500"
                  }`}
                >
                  Manual
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={automationEnabled}
                    onChange={(e) => updateAutomationEnabled(e.target.checked)}
                    disabled={automationUpdating}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-red-600 peer-checked:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg peer-checked:shadow-red-500/30" />
                  {automationUpdating && (
                    <Loader2 className="w-4 h-4 animate-spin ml-3 text-red-400" />
                  )}
                </label>
                <span
                  className={`text-xs font-light ${
                    automationEnabled ? "text-red-400" : "text-gray-500"
                  }`}
                >
                  Automatic
                </span>
              </div>

              <div className="p-4 bg-black/40 backdrop-blur-sm border border-red-500/20">
                <p className="text-xs text-gray-400 font-light leading-relaxed">
                  {automationEnabled ? (
                    <>
                      <span className="text-red-400 font-medium">AUTO:</span>{" "}
                      Upload files → Assets published automatically
                    </>
                  ) : (
                    <>
                      <span className="text-gray-300 font-medium">MANUAL:</span>{" "}
                      Upload files → You fill details & publish manually
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
        {/* AI Agents Tab */}
        {activeTab === "ai-agents" && (
          <>
            {/* AI Global Control Card */}
            <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group">
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-light mb-1 text-white">
                      AI Agent Control
                    </h2>
                    <p className="text-sm text-gray-400 font-light">
                      Enable or disable all AI agents system-wide
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        aiEnabled
                          ? "bg-red-500 shadow-lg shadow-red-500/50"
                          : "bg-gray-600"
                      }`}
                    />
                    <span className="text-xs font-light text-gray-400">
                      {aiEnabled ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`text-xs font-light ${
                      !aiEnabled ? "text-red-400" : "text-gray-500"
                    }`}
                  >
                    OFF
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiEnabled}
                      onChange={(e) => handleAIToggle(e.target.checked)}
                      disabled={aiUpdating}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-red-600 peer-checked:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg peer-checked:shadow-red-500/30" />
                    {aiUpdating && (
                      <Loader2 className="w-4 h-4 animate-spin ml-3 text-red-400" />
                    )}
                  </label>
                  <span
                    className={`text-xs font-light ${
                      aiEnabled ? "text-red-400" : "text-gray-500"
                    }`}
                  >
                    ON
                  </span>
                </div>

                <div className="p-4 bg-black/40 backdrop-blur-sm border border-red-500/20">
                  <p className="text-xs text-gray-400 font-light leading-relaxed">
                    {aiEnabled
                      ? "✓ AI agents are running and analyzing your content automatically."
                      : "✗ AI agents are fully disabled system-wide."}
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing Mode Card */}
            <div
              className={`relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group ${
                !aiEnabled ? "opacity-50" : ""
              }`}
            >
              <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <div className="mb-5">
                  <h2 className="text-lg font-light mb-1 text-white">
                    AI Pricing Mode
                  </h2>
                  <p className="text-sm text-gray-400 font-light">
                    Control how AI agents apply pricing changes
                  </p>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`text-xs font-light ${
                      mode === "SUGGEST" ? "text-red-400" : "text-gray-500"
                    }`}
                  >
                    SUGGEST
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mode === "AUTO"}
                      onChange={(e) =>
                        updateGlobalMode(e.target.checked ? "AUTO" : "SUGGEST")
                      }
                      disabled={!aiEnabled || updating}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-red-600 peer-checked:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg peer-checked:shadow-red-500/30" />
                    {updating && (
                      <Loader2 className="w-4 h-4 animate-spin ml-3 text-red-400" />
                    )}
                  </label>
                  <span
                    className={`text-xs font-light ${
                      mode === "AUTO" ? "text-red-400" : "text-gray-500"
                    }`}
                  >
                    AUTO
                  </span>
                </div>

                <div className="p-4 bg-black/40 backdrop-blur-sm border border-red-500/20">
                  <p className="text-xs text-gray-400 font-light leading-relaxed">
                    {mode === "AUTO" ? (
                      <>
                        <span className="text-red-400 font-medium">AUTO:</span>{" "}
                        AI agents automatically apply pricing changes to all
                        assets without manual approval.
                      </>
                    ) : (
                      <>
                        <span className="text-gray-300 font-medium">
                          SUGGEST:
                        </span>{" "}
                        AI agents only log pricing recommendations. You must
                        manually review and apply changes.
                      </>
                    )}
                  </p>
                </div>

                {!aiEnabled && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                    <p className="text-xs text-red-400 font-light">
                      ⚠ Enable AI agents above to change this setting
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {/* Licenses Tab */}
        {activeTab === "licenses" && (
          <div className="relative bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl p-6 border border-white/10 hover:border-red-500/50 transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 left-0 w-0 h-px bg-gradient-to-r from-red-500 to-red-600 group-hover:w-full transition-all duration-700" />

            <div className="relative z-10">
              <div className="mb-5">
                <h2 className="text-lg font-light mb-1 text-white">
                  Auto-Select Licenses
                </h2>
                <p className="text-sm text-gray-400 font-light">
                  Choose which licenses are automatically selected when
                  automation is enabled
                </p>
              </div>

              <div className="space-y-3">
                {licenseTypes.map((license) => (
                  <label
                    key={license.id}
                    className="flex items-center gap-3 p-4 bg-black/40 border border-white/10 hover:border-red-500/30 transition-all cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={autoLicensePrefs[license.slug] || false}
                      onChange={(e) =>
                        updateLicensePreferences(license.slug, e.target.checked)
                      }
                      disabled={licenseUpdating}
                      className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-light text-white">
                          {license.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          ×{license.price_multiplier}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-light">
                        {license.description}
                      </p>
                    </div>
                    {(() => {
                      const rule = getLicenseRule(license.slug);
                      if (!rule || rule.slug === "personal") return null;
                      return (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                          Commercial
                        </span>
                      );
                    })()}
                  </label>
                ))}
              </div>

              {!automationEnabled && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30">
                  <p className="text-xs text-yellow-400 font-light">
                    ⚠ Creator Automation must be enabled for these preferences
                    to take effect
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === "payouts" && (
          <div className="bg-gradient-to-br from-zinc-900/80 to-black/80 p-6 border border-white/10">
            <h2 className="text-lg font-light mb-2 text-white">
              Stripe Payout Setup
            </h2>

            {stripeConnected ? (
              // FULLY CONNECTED
              <div className="p-4 bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-400 font-light">
                  ✅ Stripe is connected. You will receive payouts when your
                  assets are sold.
                </p>
              </div>
            ) : (
              <>
                {/* INCOMPLETE OR NOT STARTED */}
                <div className="mb-6">
                  {stripeConnected === false ? (
                    // INCOMPLETE - Show what's missing
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 mb-4">
                      <p className="text-sm text-yellow-400 font-light mb-2">
                        ⚠️ Your Stripe setup is incomplete
                      </p>
                      <p className="text-xs text-yellow-300/80 font-light">
                        Stripe needs additional information to activate payouts.
                        This usually includes your business category and address
                        details.
                      </p>
                    </div>
                  ) : null}

                  <p className="text-sm text-gray-400">
                    {stripeConnected === false
                      ? "Click below to complete the required information and activate your account."
                      : "Connect your Stripe account to receive payments when your assets are sold."}
                  </p>
                </div>

                <button
                  className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
                  onClick={async () => {
                    try {
                      const { data } = await supabase.auth.getSession();

                      if (!data.session) {
                        setNotification({
                          type: "error",
                          message: "Please sign in first",
                        });
                        return;
                      }

                      // This will create a NEW onboarding link for the existing account
                      const res = await fetch("/api/stripe/connect", {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${data.session.access_token}`,
                        },
                      });

                      if (!res.ok) {
                        throw new Error("Failed to initiate Stripe connection");
                      }

                      const json = await res.json();

                      if (json.url) {
                        // Redirect to Stripe onboarding
                        window.location.href = json.url;
                      } else {
                        throw new Error("No redirect URL received");
                      }
                    } catch (error) {
                      console.error("Stripe connect error:", error);
                      setNotification({
                        type: "error",
                        message: "Failed to connect Stripe. Please try again.",
                      });
                    }
                  }}
                >
                  {stripeConnected === false
                    ? "Complete Stripe Setup"
                    : "Connect Stripe"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
