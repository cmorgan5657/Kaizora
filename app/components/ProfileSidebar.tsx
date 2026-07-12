import { useState } from "react";
import {
  ChatCircle,
  GridFour,
  EnvelopeSimple,
  UserPlus,
  Users,
  CaretLeft,
  Star,
  CaretRight,
} from "phosphor-react";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "rejected";
}

interface PendingRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface ConnectionProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ProfileSidebarProps {
  profile: Profile;
  isOwnProfile: boolean;
  connection: Connection | null;
  connecting: boolean;
  activeTab: "works" | "inbox" | "requests" | "connections" | "reviews";
  pendingRequests: PendingRequest[];
  connections: ConnectionProfile[];
  reviews: any[];
  hasUnreadReviews: boolean;
  worksCount: number;
  unreadMessagesCount: number;
  onTabChange: (tab: "works" | "inbox" | "connections" | "reviews") => void;
  onConnect: () => void;
  getInitials: (name: string) => string;
  getConnectionButtonText: () => string;
  isConnectDisabled: () => boolean;
  getConnectionButtonStyle: () => string;
}

export default function ProfileSidebar({
  profile,
  isOwnProfile,
  connection,
  connecting,
  activeTab,
  pendingRequests,
  connections,
  reviews,
  hasUnreadReviews,
  worksCount,
  unreadMessagesCount,
  onTabChange,
  onConnect,
  getInitials,
  getConnectionButtonText,
  isConnectDisabled,
  getConnectionButtonStyle,
}: ProfileSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabs = [
    {
      id: "works" as const,
      label: "Works",
      icon: <GridFour className="w-4 h-4 md:w-5 md:h-5 shrink-0" weight="duotone" />,
      badge: null,
    },
    ...(isOwnProfile
      ? [
          {
            id: "inbox" as const,
            label: "Inbox",
            icon: <EnvelopeSimple className="w-4 h-4 md:w-5 md:h-5 shrink-0" weight="duotone" />,
            badge: unreadMessagesCount > 0 ? unreadMessagesCount : null,
          },
        ]
      : []),
    {
      id: "connections" as const,
      label: "Connections",
      icon: <Users className="w-4 h-4 md:w-5 md:h-5 shrink-0" weight="duotone" />,
      badge: isOwnProfile && pendingRequests.length > 0 ? pendingRequests.length : null,
    },
    {
      id: "reviews" as const,
      label: "Reviews",
      icon: <Star className="w-4 h-4 md:w-5 md:h-5 shrink-0" weight="duotone" />,
      badge: isOwnProfile && hasUnreadReviews && reviews.length > 0 ? reviews.length : null,
    },
  ];

  return (
    <>
      {/* ── MOBILE: horizontal top bar ── */}
      <div className="md:hidden w-full bg-black/95 border-b border-white/10 flex-shrink-0">
        {/* Profile strip */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <img
            src={
              profile.avatar_url ||
              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(profile.id)}`
            }
            alt={profile.display_name || "User"}
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-light truncate capitalize">
              {profile.display_name || "Anonymous User"}
            </h2>
            <div className="flex gap-3 text-[10px] text-gray-500 font-light mt-0.5">
              <span>{worksCount} works</span>
              <span>{connections.length} connections</span>
            </div>
          </div>
          {!isOwnProfile && connection?.status !== "accepted" && (
            <button
              onClick={onConnect}
              disabled={isConnectDisabled()}
              className={`px-2 py-1 text-[10px] font-light transition-all duration-300 rounded shrink-0 ${getConnectionButtonStyle()}`}
            >
              {getConnectionButtonText()}
            </button>
          )}
        </div>

        {/* Tabs row */}
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-light whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-red-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== null && (
                <span className="w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── DESKTOP: vertical sidebar ── */}
      <div
        className={`hidden md:block sticky top-16 h-screen bg-black/95 border-r border-white/10 transition-all duration-300 ease-in-out relative flex-shrink-0 ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute top-3 right-3 z-10 p-1.5 hover:bg-white/10 rounded transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <CaretRight className="w-4 h-4" weight="bold" />
            ) : (
              <CaretLeft className="w-4 h-4" weight="bold" />
            )}
          </button>

          {/* Profile Header */}
          <div
            className={`p-3 border-b border-white/10 transition-all ${
              isCollapsed ? "opacity-0 h-0 overflow-hidden p-0 border-0" : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <img
                src={
                  profile.avatar_url ||
                  `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(profile.id)}`
                }
                alt={profile.display_name || "User"}
                className="w-12 h-12 rounded-full object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-light truncate capitalize">
                  {profile.display_name || "Anonymous User"}
                </h2>
              </div>
            </div>

            {!isOwnProfile && connection?.status !== "accepted" && (
              <button
                onClick={onConnect}
                disabled={isConnectDisabled()}
                className={`w-full py-1.5 text-xs font-light transition-all duration-300 rounded ${getConnectionButtonStyle()}`}
              >
                {getConnectionButtonText()}
              </button>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <div
              className={`p-3 border-b border-white/10 transition-all ${
                isCollapsed ? "opacity-0 h-0 overflow-hidden p-0 border-0" : "opacity-100"
              }`}
            >
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Stats */}
          <div
            className={`grid grid-cols-2 gap-2 p-3 border-b border-white/10 transition-all ${
              isCollapsed ? "opacity-0 h-0 overflow-hidden p-0 border-0" : "opacity-100"
            }`}
          >
            <div className="text-center">
              <div className="text-lg font-light text-red-500">{worksCount}</div>
              <div className="text-xs text-gray-400">Works</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-light text-red-500">{connections.length}</div>
              <div className="text-xs text-gray-400">Connections</div>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className={`flex-1 p-2 space-y-1 ${isCollapsed ? "pt-12" : ""}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 text-xs font-light rounded transition-all ${
                  activeTab === tab.id
                    ? "bg-red-600/20 border border-red-500/50 text-white"
                    : "hover:bg-white/5 text-gray-300"
                } ${isCollapsed ? "justify-center relative" : ""}`}
                title={isCollapsed ? tab.label : ""}
              >
                {tab.icon}
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left">{tab.label}</span>
                    {tab.badge !== null && (
                      <span className="text-[10px] text-red-400">{tab.badge}</span>
                    )}
                  </>
                )}
                {isCollapsed && tab.badge !== null && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
