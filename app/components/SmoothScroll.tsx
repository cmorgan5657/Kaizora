"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";

export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/creator")) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
    });

    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    // Pause Lenis whenever a fixed modal/overlay is open so the
    // modal's own scroll container works normally.
    function handleWheel(e: WheelEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      // Walk up the DOM — if we hit an element that is scrollable and
      // is NOT the document root, let the browser handle it (pause Lenis).
      const scrollable = target.closest(
        "[data-lenis-prevent], [data-modal], .overflow-y-auto, .overflow-y-scroll"
      );
      if (scrollable && scrollable !== document.documentElement) {
        lenis.stop();
        // Resume after the wheel interaction ends.
        clearTimeout((handleWheel as any)._resume);
        (handleWheel as any)._resume = setTimeout(() => lenis.start(), 300);
        // Do NOT prevent default — let the element scroll normally.
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      lenis.destroy();
      window.removeEventListener("wheel", handleWheel);
    };
  }, [pathname]);

  return <>{children}</>;
}
