"use client";

import { useEffect } from "react";

export function ThemePreviewBridge({
  theme,
}: {
  theme: "kiel" | "kiel-mobile";
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.siteTheme;
    root.dataset.siteTheme = theme;
    return () => {
      if (previous) root.dataset.siteTheme = previous;
      else delete root.dataset.siteTheme;
    };
  }, [theme]);
  return null;
}
