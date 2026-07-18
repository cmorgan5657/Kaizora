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

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcuts);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, []);

  return null;
}
