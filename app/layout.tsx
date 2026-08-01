import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import {
  getStorefrontMetaSettings,
  getStorefrontThemeSettings,
} from "@/lib/storefront-admin-tools";
import "./globals.css";

const SOCIAL_PREVIEW_IMAGE = "/goldrian-og.png?v=20260801";

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
      icon: "/legacy/goldrian-logo.png",
      shortcut: "/legacy/goldrian-logo.png",
    },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "GOLDRIAN",
      title: metaSettings.title,
      description: metaSettings.description,
      images: [
        {
          url: SOCIAL_PREVIEW_IMAGE,
          width: 1983,
          height: 793,
          alt: "GOLDRIAN 골드리안",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: metaSettings.title,
      description: metaSettings.description,
      images: [SOCIAL_PREVIEW_IMAGE],
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
      <head>
        <script src="/vendor/postcode.v2.js" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
