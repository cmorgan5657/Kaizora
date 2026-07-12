"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import CreatorSidebar from "../components/CreatorSidebar";

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/login?redirectTo=${pathname}`);
      } else {
        setLoading(false);
      }
    }
    check();
  }, []);

  // Lock body scroll while in creator dashboard so only the inner main scrolls
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-black text-white h-[calc(100vh-4rem)] overflow-hidden p-3">
        <Skeleton className="h-10 w-64 bg-white/10 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full bg-white/10" />
          <Skeleton className="h-32 w-full bg-white/10" />
          <Skeleton className="h-32 w-full bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-black text-white h-[calc(100vh-4rem)] overflow-hidden">
      <CreatorSidebar />
      <main
        data-lenis-prevent
        className="flex-1 min-w-0 overflow-y-auto h-full"
      >
        <div className="h-full">{children}</div>
      </main>
    </div>
  );
}
