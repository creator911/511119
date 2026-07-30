import { getCustomerSession } from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import {
  createWalletRequest,
  getMemberWalletOverview,
  WalletInputError,
} from "@/lib/wallet";

const MAX_WALLET_BODY_BYTES = 16_384;

export async function GET(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const overview = await getMemberWalletOverview(session.userId);
    return noStoreJson({ ok: true, ...overview });
  } catch (error) {
    return walletErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const input = await readBoundedJson<unknown>(
      request,
      MAX_WALLET_BODY_BYTES,
    );
    const walletRequest = await createWalletRequest(session.userId, input);
    return noStoreJson(
      { ok: true, request: walletRequest },
      { status: 201 },
    );
  } catch (error) {
    return walletErrorResponse(error);
  }
}

function walletErrorResponse(error: unknown) {
  if (error instanceof WalletInputError) {
    return noStoreJson(
      { error: error.message },
      {
        status: error.status,
        ...(error.retryAfterSeconds
          ? {
              headers: {
                "Retry-After": String(error.retryAfterSeconds),
              },
            }
          : {}),
      },
    );
  }
  if (error instanceof HttpBoundaryError) {
    return noStoreJson(
      {
        error:
          error.status === 413
            ? "요청 내용이 너무 큽니다."
            : "JSON 요청 형식을 확인해 주세요.",
      },
      { status: error.status },
    );
  }
  return noStoreJson(
    { error: "충전·출금 요청을 처리하지 못했습니다." },
    { status: 500 },
  );
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return request.headers.get("sec-fetch-site") !== "cross-site";
  }
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
