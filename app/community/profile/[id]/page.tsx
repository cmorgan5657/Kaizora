"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChatCircle,
  GridFour,
  EnvelopeSimple,
  UserPlus,
  Users,
  PaperPlaneRight,
  Star,
  X,
  Eye,
  ShoppingCart,
  Package,
} from "phosphor-react";
import { supabase } from "@/lib/supabaseClient";
import ProfileSidebar from "../../../components/ProfileSidebar";

export default function CommunityProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [connection, setConnection] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "works" | "inbox" | "connections" | "reviews"
  >("works");
  const [publicWorksCount, setPublicWorksCount] = useState(0);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const isOwnProfile = currentUser?.id === userId;
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [userHasReviewed, setUserHasReviewed] = useState(false);
  const [hasUnreadReviews, setHasUnreadReviews] = useState(false);
  const [assets, setAssets] = useState<any[]>([]); // ADD
  const [currentUserConnections, setCurrentUserConnections] = useState<
    string[]
  >([]);
  const [outgoingPendingRequests, setOutgoingPendingRequests] = useState<
    string[]
  >([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadProfile();
      loadWorks();
      loadReviews();
      loadCurrentUserConnections();
      loadUnreadMessagesCount();
    }
  }, [userId, currentUser]);

  // Real-time messages subscription
  useEffect(() => {
    if (!selectedChat || !currentUser) return;

    const channel = supabase
      .channel("community_messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.new.sender_id === selectedChat.id) {
            setMessages((prev) => [...prev, payload.new]);
          }
          // ✅ ADD THIS - Update unread count
          loadUnreadMessagesCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat, currentUser]);

  // Handle opening chat after navigation
  useEffect(() => {
    if (!isOwnProfile) return;

    const chatUserId = sessionStorage.getItem("openChatWith");
    if (chatUserId && connections.length > 0) {
      const chatConnection = connections.find((c) => c.id === chatUserId);
      if (chatConnection) {
        sessionStorage.removeItem("openChatWith");
        setActiveTab("inbox");
        setSelectedChat(chatConnection);
        loadMessages(chatConnection.id);
      }
    }
  }, [isOwnProfile, connections]);
  //
  // Auto-scroll to bottom when messages change
  // Auto-scroll chat area to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);
  //
  async function checkAuth() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login"); // same pattern as feed-style protection
      return;
    }

    setCurrentUser(user);
  }
  //
  useEffect(() => {
    if (activeTab === "reviews" && hasUnreadReviews && isOwnProfile) {
      setHasUnreadReviews(false);
      // Mark as viewed in localStorage
      localStorage.setItem(`reviews_viewed_${userId}`, "true");
    }
  }, [activeTab, hasUnreadReviews, isOwnProfile, userId]);
  //
  async function loadProfile() {
    if (!currentUser) return;

    try {
      setLoading(true);

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (currentUser) {
        const { data: connData } = await supabase
          .from("community_connections")
          .select("*")
          .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`,
          )
          .maybeSingle();

        setConnection(connData);

        if (currentUser.id === userId) {
          const { data: requestsData } = await supabase
            .from("community_connections")
            .select("id, sender_id, receiver_id, status, created_at")
            .eq("receiver_id", userId)
            .eq("status", "pending");

          if (requestsData && requestsData.length > 0) {
            const senderIds = requestsData.map((r) => r.sender_id);
            const { data: sendersData } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .in("id", senderIds);

            const requestsWithSenders = requestsData.map((request) => {
              const sender = sendersData?.find(
                (s) => s.id === request.sender_id,
              );
              return {
                ...request,
                sender: sender || {
                  id: request.sender_id,
                  display_name: "Unknown User",
                  avatar_url: null,
                 
                },
              };
            });

            setPendingRequests(requestsWithSenders);
          } else {
            setPendingRequests([]);
          }
        }
      }

      const { data: connectionsData } = await supabase
        .from("community_connections")
        .select("id, sender_id, receiver_id, status")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq("status", "accepted");

      if (connectionsData) {
        const connectedUserIds = connectionsData.map((conn) =>
          conn.sender_id === userId ? conn.receiver_id : conn.sender_id,
        );

        const { data: connectedProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", connectedUserIds);

        setConnections(connectedProfiles || []);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error loading profile:", error);
      setLoading(false);
    }
  }
  //
  async function loadCurrentUserConnections() {
    if (!currentUser) return;

    try {
      // Load accepted connections
      const { data: connectionsData } = await supabase
        .from("community_connections")
        .select("id, sender_id, receiver_id, status")
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .eq("status", "accepted");

      if (connectionsData) {
        const connectedUserIds = connectionsData.map((conn) =>
          conn.sender_id === currentUser.id ? conn.receiver_id : conn.sender_id,
        );
        setCurrentUserConnections(connectedUserIds);
      }

      // Load outgoing pending requests
      const { data: pendingData } = await supabase
        .from("community_connections")
        .select("receiver_id")
        .eq("sender_id", currentUser.id)
        .eq("status", "pending");

      if (pendingData) {
        const pendingUserIds = pendingData.map((req) => req.receiver_id);
        setOutgoingPendingRequests(pendingUserIds);
      }
    } catch (error) {
      console.error("Error loading current user connections:", error);
    }
  }
  //
  async function loadUnreadMessagesCount() {
    if (!currentUser) return;

    try {
      const { count, error } = await supabase
        .from("community_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", currentUser.id)
        .eq("is_read", false);

      if (error) {
        console.error("Error loading unread count:", error);
        return;
      }

      setUnreadMessagesCount(count || 0);
    } catch (error) {
      console.error("Error loading unread count:", error);
    }
  }
  //
  async function handleConnect() {
    if (!currentUser) {
      alert("Please log in to connect");
      return;
    }

    try {
      setConnecting(true);

      const { data, error } = await supabase
        .from("community_connections")
        .insert({
          sender_id: currentUser.id,
          receiver_id: userId,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Connection error:", error);
        alert("Failed to send connection request");
        return;
      }

      setConnection(data);
      setConnecting(false);
    } catch (error) {
      console.error("Error connecting:", error);
      setConnecting(false);
    }
  }

  async function handleConnectionRequest(
    requestId: string,
    action: "accept" | "reject",
  ) {
    try {
      const { error } = await supabase
        .from("community_connections")
        .update({ status: action === "accept" ? "accepted" : "rejected" })
        .eq("id", requestId);

      if (error) {
        console.error("Error updating request:", error);
        return;
      }

      loadProfile();
    } catch (error) {
      console.error("Error handling request:", error);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function getConnectionButtonText() {
    if (!connection) return "Connect";
    if (connection.status === "pending") return "Pending";
    if (connection.status === "accepted") return "Connected";
    return "Connect";
  }

  function isConnectDisabled() {
    if (connecting) return true;
    if (!connection) return false;
    return connection.status === "pending" || connection.status === "accepted";
  }

  function getConnectionButtonStyle() {
    if (connection?.status === "accepted") {
      return "bg-green-600/20 border border-green-500/50 text-green-400 cursor-default";
    }
    if (connection?.status === "pending") {
      return "bg-yellow-600/20 border border-yellow-500/50 text-yellow-400 cursor-default";
    }
    return "bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg hover:shadow-red-500/30";
  }

  async function openChat(connection: any) {
    if (!isOwnProfile) {
      sessionStorage.setItem("openChatWith", connection.id);
      router.push(`/community/${currentUser?.id}`);
      return;
    }

    setActiveTab("inbox");
    setSelectedChat(connection);
    await loadMessages(connection.id);
  }

  async function loadMessages(connectionId: string) {
    if (!currentUser) return;

    try {
      const { data, error } = await supabase
        .from("community_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${connectionId}),and(sender_id.eq.${connectionId},receiver_id.eq.${currentUser.id})`,
        )
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading messages:", error);
        return;
      }

      setMessages(data || []);

      // ✅ ADD THIS - Mark messages as read
      await supabase
        .from("community_messages")
        .update({ is_read: true })
        .eq("receiver_id", currentUser.id)
        .eq("sender_id", connectionId)
        .eq("is_read", false);

      // ✅ ADD THIS - Reload unread count
      loadUnreadMessagesCount();
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }
  async function sendMessage() {
    if (!newMessage.trim() || !currentUser || !selectedChat) return;

    try {
      const { error } = await supabase.from("community_messages").insert({
        sender_id: currentUser.id,
        receiver_id: selectedChat.id,
        message: newMessage.trim(),
      });

      if (error) {
        console.error("Error sending message:", error);
        return;
      }

      setNewMessage("");
      await loadMessages(selectedChat.id);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }
  //
  async function loadReviews() {
    try {
      const { data, error } = await supabase
        .from("user_reviews")
        .select(
          `
        *,
reviewer:reviewer_id(id, display_name, avatar_url)
      `,
        )
        .eq("reviewed_user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading reviews:", error);
        return;
      }

      setReviews(data || []);

      // Check if reviews have been viewed before
      const hasViewed =
        localStorage.getItem(`reviews_viewed_${userId}`) === "true";

      // Set unread indicator only if there are reviews AND not viewed before
      if (data && data.length > 0 && !hasViewed) {
        setHasUnreadReviews(true);
        const avg =
          data.reduce((sum, review) => sum + review.rating, 0) / data.length;
        setAverageRating(avg);

        const hasReviewed = data.some(
          (review) => review.reviewer_id === currentUser?.id,
        );
        setUserHasReviewed(hasReviewed);
      } else {
        setHasUnreadReviews(false); // Changed from true to false
        if (data && data.length > 0) {
          const avg =
            data.reduce((sum, review) => sum + review.rating, 0) / data.length;
          setAverageRating(avg);

          const hasReviewed = data.some(
            (review) => review.reviewer_id === currentUser?.id,
          );
          setUserHasReviewed(hasReviewed);
        } else {
          setAverageRating(0);
          setUserHasReviewed(false);
        }
      }
    } catch (error) {
      console.error("Error loading reviews:", error);
    }
  }
  async function submitReview() {
    if (!currentUser || !reviewRating) {
      alert("Please select a rating");
      return;
    }

    try {
      setSubmittingReview(true);

      const { error } = await supabase.from("user_reviews").insert({
        reviewer_id: currentUser.id,
        reviewed_user_id: userId,
        rating: reviewRating,
        review_text: reviewText.trim() || null,
      });

      if (error) {
        console.error("Error submitting review:", error);
        alert("Failed to submit review");
        return;
      }

      // Reset form and reload
      setReviewRating(0);
      setReviewText("");
      setSubmittingReview(false);
      await loadReviews();
    } catch (error) {
      console.error("Error submitting review:", error);
      setSubmittingReview(false);
    }
  }
  //

  //
  async function loadWorks() {
    const { count: publicAssetsCount } = await supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("is_public", true);
    setPublicWorksCount(publicAssetsCount || 0);

    try {
      // Load assets
      let assetsQuery = supabase
        .from("assets")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (!isOwnProfile) {
        assetsQuery = assetsQuery.eq("is_public", true);
      }

      const { data: assetsData, error: assetsError } = await assetsQuery;

      if (assetsError) {
        console.error("Error loading assets:", assetsError);
      } else {
        const assetsWithThumbs = (assetsData || []).map((asset) => {
          const pathToUse =
            asset.thumbnail_path ||
            (asset.content_type === "image" ? asset.storage_path : null);

          let thumbnailUrl = null;
          if (pathToUse) {
            const { data } = supabase.storage
              .from("assets")
              .getPublicUrl(pathToUse);
            thumbnailUrl = data.publicUrl;
          }

          return {
            ...asset,
            thumbnail_url: thumbnailUrl,
          };
        });

        setAssets(assetsWithThumbs);
      }
    } catch (error) {
      console.error("Error loading works:", error);
    }
  }
  //
  async function handleConnectFromConnectionsTab(receiverId: string) {
    if (!currentUser) {
      alert("Please log in to connect");
      return;
    }

    try {
      // First, check if a connection already exists
      const { data: existingConnection } = await supabase
        .from("community_connections")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUser.id})`,
        )
        .maybeSingle();

      if (existingConnection) {
        alert("Connection request already exists");
        return;
      }

      // Create connection request
      const { data, error } = await supabase
        .from("community_connections")
        .insert({
          sender_id: currentUser.id,
          receiver_id: receiverId,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Connection error:", error);
        alert("Failed to send connection request");
        return;
      }

      // Reload BOTH profile AND current user connections
      await loadProfile();
      await loadCurrentUserConnections();
    } catch (error) {
      console.error("Error connecting:", error);
      alert("An error occurred while connecting");
    }
  }
  //
  // 2. ADD THIS FUNCTION to check connection status
  function getConnectionStatusForUser(userId: string): string {
    // Don't show status for current user themselves
    if (userId === currentUser?.id) return "self";

    // Check if current user is connected to this person
    if (currentUserConnections.includes(userId)) return "connected";

    // Check for incoming pending request
    const pendingReceived = pendingRequests.find((r) => r.sender_id === userId);
    if (pendingReceived) return "pending_received";

    // Check for outgoing pending request
    if (outgoingPendingRequests.includes(userId)) return "pending_sent";

    return "none";
  }
  //
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
        {/* Mobile skeleton */}
        <div className="md:hidden w-full border-b border-white/10 p-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-white/10 rounded-full animate-pulse shrink-0" />
          <div className="flex-1">
            <div className="h-3 w-24 bg-white/10 animate-pulse mb-1" />
            <div className="h-2.5 w-16 bg-white/5 animate-pulse" />
          </div>
        </div>
        {/* Desktop sidebar skeleton */}
        <div className="hidden md:block w-64 border-r border-white/10 p-6">
          <div className="w-16 h-16 bg-white/10 rounded-full animate-pulse mb-4 mx-auto" />
          <div className="h-5 w-32 bg-white/10 animate-pulse mb-2 mx-auto" />
          <div className="h-4 w-24 bg-white/10 animate-pulse mx-auto" />
        </div>
        <div className="flex-1 p-4 md:p-8">
          <div className="h-8 md:h-10 w-24 bg-white/10 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400 font-light">Profile not found</p>
      </div>
    );
  }
  const displayConnections = connections.filter(
    (conn) => conn.id !== currentUser?.id,
  );
  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      <ProfileSidebar
        profile={profile}
        isOwnProfile={isOwnProfile}
        connection={connection}
        connecting={connecting}
        activeTab={activeTab}
        pendingRequests={pendingRequests}
        connections={connections}
        reviews={reviews}
        hasUnreadReviews={hasUnreadReviews}
        worksCount={publicWorksCount} // ✅ REQUIRED
        unreadMessagesCount={unreadMessagesCount}
        onTabChange={setActiveTab}
        onConnect={handleConnect}
        getInitials={getInitials}
        getConnectionButtonText={getConnectionButtonText}
        isConnectDisabled={isConnectDisabled}
        getConnectionButtonStyle={getConnectionButtonStyle}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4" data-lenis-prevent>
        {/* Works Tab */}
        {activeTab === "works" && (
          <div className="space-y-4 md:space-y-8">
            {/* Assets Section */}
            <div>
              <h3 className="text-sm md:text-lg font-light mb-3 md:mb-4">
                My Assets ({assets.length})
              </h3>

              {assets.length === 0 ? (
                <div className="text-center py-6 md:py-12 bg-white/5 border border-white/10 rounded">
                  <GridFour
                    className="w-12 h-12 mx-auto mb-4 text-gray-600"
                    weight="duotone"
                  />
                  <p className="text-gray-400 text-sm font-light">
                    No assets created yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="bg-white/5 border border-white/10 rounded hover:border-red-500/50 transition-all cursor-pointer overflow-hidden"
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-gradient-to-br from-gray-900 to-black relative">
                        {asset.thumbnail_url ? (
                          <img
                            src={asset.thumbnail_url}
                            alt={asset.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <GridFour
                              className="w-12 h-12 text-gray-600"
                              weight="duotone"
                            />
                          </div>
                        )}

                        {/* Content Type Badge */}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-xs">
                          {asset.content_type}
                        </div>

                        {/* Price Badge */}
                        {asset.price_cents > 0 && (
                          <div className="absolute top-2 right-2 px-2 py-1 bg-green-600/80 backdrop-blur-sm rounded text-xs">
                            ${(asset.price_cents / 100).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <h4 className="text-sm font-light truncate mb-2">
                          {asset.title || "Untitled Asset"}
                        </h4>

                        {/* Stats */}
                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {asset.views_count || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" />
                            {asset.purchases_count || 0}
                          </span>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inbox Tab */}
        {activeTab === "inbox" && isOwnProfile && (
          <div className="flex flex-col md:flex-row gap-2 min-h-[60vh] md:h-[calc(100vh-8rem)]">
            {/* Connections List — full width on mobile when no chat selected */}
            <div className={`md:w-60 border border-white/10 rounded overflow-y-auto ${selectedChat ? "hidden md:block" : "block"}`}>
              {connections.length === 0 ? (
                <div className="text-center py-8 md:py-20">
                  <EnvelopeSimple
                    className="w-12 h-12 mx-auto mb-4 text-gray-600"
                    weight="duotone"
                  />
                  <p className="text-gray-400 text-sm font-light">
                    No connections yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      onClick={() => {
                        setSelectedChat(conn);
                        loadMessages(conn.id);
                      }}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-all ${
                        selectedChat?.id === conn.id
                          ? "bg-red-600/20 border border-red-500/50"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <img
                        src={
                          conn.avatar_url ||
                          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(conn.id)}`
                        }
                        alt={conn.display_name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-light truncate">
                          {conn.display_name || "Anonymous User"}
                        </h3>
                      
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Area */}
            <div className={`flex-1 border border-white/10 rounded flex flex-col ${!selectedChat ? "hidden md:flex" : "flex"}`}>
              {!selectedChat ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <ChatCircle
                      className="w-12 h-12 mx-auto mb-4 text-gray-600"
                      weight="duotone"
                    />
                    <p className="text-gray-400 text-sm font-light">
                      Select a connection to start chatting
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat Header */}
                  <div className="flex items-center gap-3 p-3 md:p-4 border-b border-white/10">
                    {/* Back button — mobile only */}
                    <button
                      onClick={() => setSelectedChat(null)}
                      className="md:hidden p-1 text-gray-500 hover:text-white transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <img
                      src={
                        selectedChat.avatar_url ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(selectedChat.id)}`
                      }
                      alt={selectedChat.display_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="font-light">
                        {selectedChat.display_name}
                      </h3>
                   
                    </div>
                  </div>

                  {/* Messages Area */}
                  {/* Messages Area */}
                  <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4" data-lenis-prevent
                  >
                    {messages.length === 0 ? (
                      <div className="text-center py-8 md:py-20">
                        <ChatCircle
                          className="w-12 h-12 mx-auto mb-4 text-gray-600"
                          weight="duotone"
                        />
                        <p className="text-gray-400 text-sm font-light">
                          No messages yet. Start the conversation!
                        </p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isOwn = msg.sender_id === currentUser?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${
                              isOwn ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[75%] px-4 py-2 rounded-lg ${
                                isOwn
                                  ? "bg-red-600 text-white"
                                  : "bg-white/10 text-white"
                              }`}
                            >
                              <p className="text-sm font-light">
                                {msg.message}
                              </p>
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(msg.created_at).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <div className="p-2 border-t border-white/10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") sendMessage();
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-white/5 border border-white/10 px-4 py-3 text-sm font-light focus:outline-none focus:border-red-500 transition-colors rounded"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded"
                      >
                        <PaperPlaneRight className="w-5 h-5" weight="fill" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Connections Tab */}

        {activeTab === "connections" && (
          <div>
            {/* Pending Requests Section - Only for own profile */}
            {isOwnProfile && pendingRequests.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-light mb-3 text-gray-400">
                  Pending Requests ({pendingRequests.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl border border-yellow-500/30 p-4 rounded"
                    >
                      <div
                        onClick={() =>
                          router.push(`/community/profile/${request.sender.id}`)
                        }
                        className="flex items-center gap-3 mb-3 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={
                            request.sender.avatar_url ||
                            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(request.sender.id)}`
                          }
                          alt={request.sender.display_name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-light truncate">
                            {request.sender.display_name || "Anonymous User"}
                          </h3>
                        
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectionRequest(request.id, "accept");
                          }}
                          className="flex-1 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-xs font-light hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 rounded"
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectionRequest(request.id, "reject");
                          }}
                          className="flex-1 py-1.5 bg-white/5 border border-white/10 text-xs font-light hover:bg-white/10 transition-all duration-300 rounded"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div className="border-t border-white/10 my-6"></div>
              </div>
            )}

            {/* Connections List */}
            <div>
              <h3 className="text-sm font-light mb-3 text-gray-400">
                All Connections ({displayConnections.length})
              </h3>
              {displayConnections.length === 0 ? (
                <div className="text-center py-8 md:py-20">
                  <Users
                    className="w-12 h-12 mx-auto mb-4 text-gray-600"
                    weight="duotone"
                  />
                  <p className="text-gray-400 text-sm font-light">
                    No connections yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                  {displayConnections.map((conn) => {
                    const connectionStatus = getConnectionStatusForUser(
                      conn.id,
                    );
                    const canConnect =
                      !isOwnProfile &&
                      conn.id !== currentUser?.id &&
                      connectionStatus === "none";
                    return (
                      <div
                        key={conn.id}
                        className="bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-xl border border-white/10 p-6 hover:border-red-500/50 transition-all duration-300 rounded"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            onClick={() =>
                              router.push(`/community/profile/${conn.id}`)
                            }
                            className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={
                                conn.avatar_url ||
                                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(conn.id)}`
                              }
                              alt={conn.display_name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                            <div className="flex-1">
                              <h3 className="text-base font-light">
                                {conn.display_name || "Anonymous User"}
                              </h3>
                            
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2">
                            {/* Message button - only show if it's own profile OR already connected */}
                            {(isOwnProfile ||
                              connectionStatus === "connected") &&
                              conn.id !== currentUser?.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openChat(conn);
                                  }}
                                  className="p-2 hover:bg-red-600/20 rounded-full transition-colors cursor-pointer"
                                  title="Message"
                                >
                                  <PaperPlaneRight
                                    className="w-5 h-5 text-red-500"
                                    weight="duotone"
                                  />
                                </button>
                              )}

                            {canConnect && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConnectFromConnectionsTab(conn.id);
                                }}
                                className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 text-xs font-light rounded flex items-center gap-1.5"
                              >
                                <UserPlus
                                  className="w-4 h-4"
                                  weight="duotone"
                                />
                                Connect
                              </button>
                            )}

                            {!isOwnProfile &&
                              connectionStatus === "pending_sent" && (
                                <span className="px-2 py-1 bg-yellow-600/20 border border-yellow-500/50 text-yellow-400 text-xs rounded text-center">
                                  Pending
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Reviews Tab */}
        {activeTab === "reviews" && (
          <div className="h-full">
            {!isOwnProfile && (
              <div className="bg-white/5 border border-white/10 rounded p-3 mb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Quick Rating */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-light">
                      Rate:
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setReviewRating(star)}
                          className="transition-transform hover:scale-125 focus:outline-none"
                        >
                          <Star
                            className="w-6 h-6"
                            weight={star <= reviewRating ? "fill" : "regular"}
                            color={star <= reviewRating ? "#fbbf24" : "#6b7280"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Text Input */}
                  <input
                    type="text"
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Quick review (optional)..."
                    className="flex-1 min-w-[200px] bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-light focus:outline-none focus:border-red-500/50 transition-colors rounded placeholder:text-gray-600"
                    maxLength={500}
                  />

                  {/* Quick Submit */}
                  <button
                    onClick={submitReview}
                    disabled={!reviewRating || submittingReview}
                    className="px-4 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-light whitespace-nowrap"
                  >
                    {submittingReview ? (
                      <span className="flex items-center gap-1.5">
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Posting...
                      </span>
                    ) : (
                      "Post Review"
                    )}
                  </button>
                </div>

                {/* Character Count - Only show when typing */}
                {reviewText.length > 0 && (
                  <p className="text-xs text-gray-600 mt-2 font-light">
                    {reviewText.length}/500 characters
                  </p>
                )}
              </div>
            )}
            {/* Reviews Grid - Ultra Compact */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-light">
                  Reviews ({reviews.length})
                </h3>
                {reviews.length > 0 && averageRating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500" weight="fill" />
                    <span className="text-xs font-light text-amber-500">
                      {averageRating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              {reviews.length === 0 ? (
                <div className="text-center py-6 md:py-12 bg-white/5 border border-white/10 rounded">
                  <Star
                    className="w-8 h-8 mx-auto mb-2 text-gray-600"
                    weight="duotone"
                  />
                  <p className="text-gray-400 text-xs font-light">
                    Be the first to review
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="bg-white/5 border border-white/10 rounded p-2.5 hover:border-white/20 transition-colors"
                    >
                      {/* Reviewer Info - Compact */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <img
                          src={
                            review.reviewer.avatar_url ||
                            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(review.reviewer.id)}`
                          }
                          alt={review.reviewer.display_name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-light truncate">
                            {review.reviewer.display_name || "Anonymous"}
                          </h4>
                        </div>
                        {/* Stars beside name */}
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className="w-2.5 h-2.5"
                              weight="fill"
                              color={
                                star <= review.rating ? "#fbbf24" : "#4b5563"
                              }
                            />
                          ))}
                        </div>
                      </div>

                      {/* Review Text */}
                      {review.review_text && (
                        <p className="text-xs text-gray-300 font-light leading-relaxed line-clamp-2 mb-1">
                          {review.review_text}
                        </p>
                      )}

                      {/* Date - Small */}
                      <p className="text-[10px] text-gray-500">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
