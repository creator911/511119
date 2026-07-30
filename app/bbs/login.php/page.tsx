import type { Metadata } from "next";
import { CustomerLoginClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedReturnUrl = Array.isArray(params.return_url)
    ? params.return_url[0]
    : params.return_url;
  const returnUrl = safeReturnUrl(requestedReturnUrl);
  return (
    <SiteFrame>
      <CustomerLoginClient returnUrl={returnUrl} />
    </SiteFrame>
  );
}

function safeReturnUrl(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/shop/mypage.php";
  }
  try {
    const parsed = new URL(value, "https://kiel-gold.local");
    if (parsed.origin !== "https://kiel-gold.local") {
      return "/shop/mypage.php";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/shop/mypage.php";
  }
}
