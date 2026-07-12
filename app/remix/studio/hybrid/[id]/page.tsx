"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function HybridStudio() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string;

  useEffect(() => {
    // Redirect to transform first
    router.push(`/remix/studio/transform/${assetId}`);
  }, [assetId, router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-xs font-light text-gray-400">Redirecting...</p>
    </div>
  );
}
