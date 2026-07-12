import { ReactNode } from "react";
import { usePlanFeatures } from "../hooks/usePlanFeatures";

type FeatureGateProps = {
  children: ReactNode;
  feature:
    | "upload"
    | "download"
    | "transform"
    | "ai"
    | "marketplace"
    | "analytics"
    | "community";
  fallback?: ReactNode;
};

export function FeatureGate({ children, feature, fallback }: FeatureGateProps) {
  const { features, loading } = usePlanFeatures();

  if (loading) {
    return <div className="animate-pulse bg-white/5 rounded h-10" />;
  }

  const hasAccess = (() => {
    switch (feature) {
      case "upload":
        return features?.can_upload_assets;
      case "download":
        return features?.can_download_assets;
      case "transform":
        return features?.can_use_transform;
      case "ai":
        return features?.can_use_ai_regeneration;
      case "marketplace":
        return features?.can_list_marketplace;
      case "analytics":
        return features?.can_view_analytics;
      case "community":
        return features?.can_access_community;
      default:
        return false;
    }
  })();

  if (!hasAccess) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
