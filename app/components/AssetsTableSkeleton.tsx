"use client";

function SkeletonRow() {
  return (
    <div className="flex gap-4 p-4 border-b border-white/10 animate-pulse">
      {/* Thumbnail */}
      <div className="w-12 h-12 bg-white/10 rounded" />

      {/* Title + description */}
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-3 bg-white/10 rounded w-1/2" />
      </div>

      {/* Right side column */}
      <div className="w-20 h-4 bg-white/10 rounded" />
    </div>
  );
}

export default function AssetsTableSkeleton() {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {[1, 2, 3, 4, 5].map((i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
