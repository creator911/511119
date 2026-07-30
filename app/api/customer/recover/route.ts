import { noStoreJson } from "@/lib/http-boundary";

export async function POST() {
  // Automated recovery stays unavailable until a transactional email provider
  // for the new domain is connected. Account existence is never disclosed.
  return noStoreJson(
    {
      ok: false,
      error: "자동 메일 복구 기능을 준비 중입니다. 고객센터로 문의해 주세요.",
    },
    { status: 503 },
  );
}
