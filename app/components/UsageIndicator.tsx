import { usePlanFeatures } from "../hooks/usePlanFeatures";

type UsageIndicatorProps = {
  type: "downloads" | "uploads" | "ai";
};

export function UsageIndicator({ type }: UsageIndicatorProps) {
  const { features, loading } = usePlanFeatures();

  if (loading || !features) {
    return <div className="animate-pulse bg-white/5 rounded h-4 w-32" />;
  }

  const { current, max } = (() => {
    switch (type) {
      case "downloads":
        return {
          current: features.current_downloads,
          max: features.max_downloads_per_month,
        };
      case "uploads":
        return {
          current: features.current_uploads,
          max: features.max_uploads_per_month,
        };
      case "ai":
        return {
          current: features.current_ai_generations,
          max: features.max_ai_generations_per_month,
        };
    }
  })();

  const isUnlimited = max === null;
  const percentage = isUnlimited ? 0 : (current / max) * 100;
  const isNearLimit = percentage > 80;

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400 capitalize">{type}</span>
        <span className={isNearLimit ? "text-red-400" : "text-gray-300"}>
          {current} / {isUnlimited ? "∞" : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div
            className={`h-full transition-all rounded-full ${
              isNearLimit ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
