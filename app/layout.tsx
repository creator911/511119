import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import {
  getStorefrontMetaSettings,
  getStorefrontThemeSettings,
} from "@/lib/storefront-admin-tools";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [requestHeaders, metaSettings] = await Promise.all([
    headers(),
    getStorefrontMetaSettings(),
  ]);
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestedHost = forwardedHost || requestHeaders.get("host") || "";
  const safeHost = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u.test(requestedHost)
    ? requestedHost
    : "localhost";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : safeHost.startsWith("localhost") || safeHost.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return {
    metadataBase: new URL(`${protocol}://${safeHost}`),
    title: {
      default: metaSettings.title,
      template: `%s | ${metaSettings.title}`,
    },
    description: metaSettings.description,
    keywords: metaSettings.keywords,
    robots: metaSettings.robots,
    referrer: "same-origin",
    icons: {
      icon: "/legacy/logo.png",
      shortcut: "/legacy/logo.png",
    },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "KIEL GOLD",
      title: metaSettings.title,
      description: metaSettings.description,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "KIEL GOLD 키엘골드",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: metaSettings.title,
      description: metaSettings.description,
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeSettings = await getStorefrontThemeSettings();
  const themeStyle = themeSettings.enabled
      ? ({
          "--site-primary-color": themeSettings.primaryColor,
          "--site-primary-color-dark": themeSettings.primaryColorDark,
          "--brand-indigo": themeSettings.primaryColor,
        } as CSSProperties)
    : undefined;

  return (
    <html
      lang="ko"
      data-site-theme={themeSettings.enabled ? themeSettings.theme : undefined}
      style={themeStyle}
    >
      <body>{children}</body>
    </html>
  );
}
