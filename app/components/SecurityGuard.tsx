"use client";

import { useEffect } from "react";

export default function SecurityGuard() {
  useEffect(() => {
    // Block right-click
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();

    // Block keyboard shortcuts
    const blockShortcuts = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (DevTools)
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) {
        e.preventDefault();
        return;
      }
      // Ctrl+U (View source)
      if (e.ctrlKey && e.key.toUpperCase() === "U") {
        e.preventDefault();
        return;
      }
      // Ctrl+S (Save page)
      if (e.ctrlKey && e.key.toUpperCase() === "S") {
        e.preventDefault();
        return;
      }
    };

    // DevTools open detection via window size difference
    const detectDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        document.body.innerHTML = "";
      }
    };

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcuts);

    const devToolsInterval = setInterval(detectDevTools, 1000);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
      clearInterval(devToolsInterval);
    };
  }, []);

  return null;
}
