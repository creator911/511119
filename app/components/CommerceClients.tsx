"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartPanel,
  CategoryListing,
  CheckoutPanel,
  LoginPanel,
  MyPagePanel,
  ProductDetail,
  RegisterPanel,
} from "@/app/components/storefront";
import type {
  BreadcrumbItem,
  CartLine,
  CheckoutPayload,
  PaymentMethod,
  ProductDetailData,
  ProductSummary,
} from "@/app/components/storefront";

const CART_KEY = "kg_cart_v1";
const CHECKOUT_KEY = "kg_checkout_v1";
const RECENT_KEY = "kg_recent_v1";
const CUSTOMER_SESSION_EVENT = "kg-customer-session-change";

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "");
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("kg-commerce-change"));
}

function cartLineKey(line: CartLine): string {
  return line.lineKey ?? line.id;
}

function lineFromProduct(
  product: ProductDetailData,
  quantity: number,
  selections: Record<string, string> = {},
): CartLine {
  const selectedValues = (product.options ?? []).flatMap((option) => {
    const selected = option.values.find(
      (value) => value.value === selections[option.id],
    );
    return selected ? [{ option, value: selected }] : [];
  });
  const optionIds = selectedValues.map(({ value }) => value.id).sort();
  const lineKey = optionIds.length
    ? `${product.id}::${optionIds.join(".")}`
    : product.id;
  const optionMaximum = selectedValues.reduce(
    (maximum, { value }) => Math.min(maximum, value.stock ?? 99),
    product.maximumQuantity ?? 99,
  );
  return {
    id: product.id,
    lineKey,
    productId: product.id,
    name: product.name,
    href: product.href,
    image: product.image,
    option: selectedValues.length
      ? selectedValues
          .map(({ option, value }) => `${option.label}: ${value.label}`)
          .join(" / ")
      : undefined,
    optionIds,
    unitPrice:
      product.price +
      selectedValues.reduce(
        (sum, { value }) => sum + (value.priceDelta ?? 0),
        0,
      ),
    quantity,
    points: product.rewardPoints,
    shippingFee: 0,
    maximumQuantity: Math.max(1, optionMaximum),
  };
}

export function ProductCommerceClient({
  product,
  breadcrumbs,
  previousProduct,
  nextProduct,
  relatedProducts,
}: {
  product: ProductDetailData;
  breadcrumbs?: BreadcrumbItem[];
  previousProduct?: Pick<ProductSummary, "name" | "href">;
  nextProduct?: Pick<ProductSummary, "name" | "href">;
  relatedProducts?: ProductSummary[];
}) {
  const [wished, setWished] = useState(false);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      void fetch("/api/customer/wishlist", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return [] as string[];
          const payload = (await response.json()) as { productIds?: string[] };
          return Array.isArray(payload.productIds) ? payload.productIds : [];
        })
        .then((ids) => {
          if (!disposed) setWished(ids.includes(product.id));
        })
        .catch(() => {
          if (!disposed) setWished(false);
        });
        const current = readJson<ProductSummary[]>(RECENT_KEY, []);
        const next = [
          product,
          ...current.filter((item) => item.id !== product.id),
        ].slice(0, 8);
        writeJson(RECENT_KEY, next);
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [product]);

  function addToCart(
    quantity: number,
    buyNow = false,
    options: Record<string, string> = {},
  ) {
    const nextLine = lineFromProduct(product, quantity, options);
    const cart = readJson<CartLine[]>(CART_KEY, []);
    const existing = cart.find(
      (line) => cartLineKey(line) === cartLineKey(nextLine),
    );
    const next = existing
      ? cart.map((line) =>
          cartLineKey(line) === cartLineKey(nextLine)
            ? {
                ...line,
                quantity: Math.min(
                  line.maximumQuantity ??
                    nextLine.maximumQuantity ??
                    product.maximumQuantity ??
                    99,
                  line.quantity + quantity,
                ),
              }
            : line,
        )
      : [...cart, nextLine];
    writeJson(CART_KEY, next);
    if (buyNow) {
      writeJson(CHECKOUT_KEY, [nextLine]);
      window.location.assign("/shop/orderform.php");
    } else {
      window.alert("상품을 장바구니에 담았습니다.");
    }
  }

  async function toggleWish(id: string, nextWished: boolean) {
    try {
      const response = await fetch("/api/customer/wishlist", {
        method: nextWished ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: id }),
      });
      if (response.status === 401) {
        window.location.assign(
          `/bbs/login.php?return_url=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        return;
      }
      if (!response.ok) {
        window.alert("위시리스트를 변경하지 못했습니다.");
        return;
      }
      setWished(nextWished);
      window.dispatchEvent(new CustomEvent("kg-wishlist-change"));
    } catch {
      window.alert("위시리스트를 변경하지 못했습니다.");
    }
  }

  return (
    <ProductDetail
      product={product}
      breadcrumbs={breadcrumbs}
      previousProduct={previousProduct}
      nextProduct={nextProduct}
      relatedProducts={relatedProducts}
      initiallyWished={wished}
      onAddToCart={({ quantity, options }) =>
        addToCart(quantity, false, options)
      }
      onBuyNow={({ quantity, options }) =>
        addToCart(quantity, true, options)
      }
      onToggleWish={toggleWish}
    />
  );
}

export function CartClient() {
  const [items, setItems] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(readJson<CartLine[]>(CART_KEY, []));
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!loaded) return <div className="empty-card">장바구니를 불러오는 중입니다.</div>;

  return (
    <CartPanel
      items={items}
      onItemsChange={(next) => {
        setItems(next);
        writeJson(CART_KEY, next);
      }}
      onCheckout={(selected) => {
        writeJson(CHECKOUT_KEY, selected);
        window.location.assign("/shop/orderform.php");
      }}
    />
  );
}

export function CheckoutClient({
  bankLabel = "주문 확인 후 입금계좌 안내",
  paymentMethods = ["bank"],
  pointUseEnabled = true,
  pointUseMinimum = 1_000,
  pointUseMaximum = 100_000_000,
  pointUseUnit = 100,
  shippingFee = 0,
  shippingCarrier = "",
  customerServicePhone = "",
}: {
  bankLabel?: string;
  paymentMethods?: PaymentMethod[];
  pointUseEnabled?: boolean;
  pointUseMinimum?: number;
  pointUseMaximum?: number;
  pointUseUnit?: number;
  shippingFee?: number;
  shippingCarrier?: string;
  customerServicePhone?: string;
}) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [pointAccount, setPointAccount] = useState({
    loaded: false,
    authenticated: false,
    balance: 0,
  });
  const [defaultBuyer, setDefaultBuyer] = useState<
    Partial<CheckoutPayload["buyer"]>
  >({});
  const [buyerLoaded, setBuyerLoaded] = useState(false);
  const requestKey = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(readJson<CartLine[]>(CHECKOUT_KEY, []));
      setItemsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/customer/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          user?: { points?: number; coupons?: number } | null;
        };
        const balance =
          result.user &&
          typeof result.user.points === "number" &&
          Number.isFinite(result.user.points)
            ? Math.max(0, Math.trunc(result.user.points))
            : 0;
        setPointAccount({
          loaded: true,
          authenticated: Boolean(result.user),
          balance,
        });
        if (result.user) {
          const profileResponse = await fetch("/api/customer/profile", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (profileResponse.ok) {
            const profileResult = (await profileResponse.json()) as {
              profile?: {
                name?: string;
                email?: string;
                phone?: string;
                postcode?: string;
                address1?: string;
                address2?: string;
              };
            };
            if (profileResult.profile) {
              setDefaultBuyer({
                name: profileResult.profile.name ?? "",
                email: profileResult.profile.email ?? "",
                phone: profileResult.profile.phone ?? "",
                postcode: profileResult.profile.postcode ?? "",
                address1: profileResult.profile.address1 ?? "",
                address2: profileResult.profile.address2 ?? "",
              });
            }
          }
        }
        setBuyerLoaded(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPointAccount({
          loaded: true,
          authenticated: false,
          balance: 0,
        });
        setBuyerLoaded(true);
      });
    return () => controller.abort();
  }, []);

  async function submit(payload: CheckoutPayload) {
    if (sending) return;
    setSending(true);
    setError("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestKey.current,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        orderId?: string;
        lookupToken?: string;
        error?: string;
        priceChanged?: boolean;
        quoteItems?: CartLine[];
        pointsChanged?: boolean;
        availablePoints?: number;
      };
      if (
        response.status === 409 &&
        result.priceChanged &&
        result.quoteItems?.length
      ) {
        setItems(result.quoteItems);
        writeJson(CHECKOUT_KEY, result.quoteItems);
        const quotedById = new Map(
          result.quoteItems.map((item) => [cartLineKey(item), item]),
        );
        writeJson(
          CART_KEY,
          readJson<CartLine[]>(CART_KEY, []).map(
            (item) => quotedById.get(cartLineKey(item)) ?? item,
          ),
        );
        setError(
          result.error ??
            "상품 가격이 변경되었습니다. 주문 내용을 다시 확인해 주세요.",
        );
        setSending(false);
        return;
      }
      if (
        response.status === 409 &&
        result.pointsChanged &&
        typeof result.availablePoints === "number"
      ) {
        setPointAccount((current) => ({
          ...current,
          loaded: true,
          balance: Math.max(0, Math.trunc(result.availablePoints ?? 0)),
        }));
        setError(
          result.error ??
            "보유 포인트가 변경되었습니다. 사용 포인트를 다시 확인해 주세요.",
        );
        setSending(false);
        return;
      }
      if (!response.ok || !result.orderId) {
        throw new Error(result.error || "주문을 접수하지 못했습니다.");
      }
      const purchased = new Set(
        payload.items.map((item) => cartLineKey(item)),
      );
      writeJson(
        CART_KEY,
        readJson<CartLine[]>(CART_KEY, []).filter(
          (line) => !purchased.has(cartLineKey(line)),
        ),
      );
      window.localStorage.removeItem(CHECKOUT_KEY);
      window.location.assign(
        `/shop/orderinquiry.php?order_id=${encodeURIComponent(result.orderId)}${
          result.lookupToken
            ? `#token=${encodeURIComponent(result.lookupToken)}`
            : ""
        }`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "주문 처리 중 오류가 발생했습니다.");
      setSending(false);
    }
  }

  if (!itemsLoaded) {
    return <div className="empty-card">주문 상품을 불러오는 중입니다.</div>;
  }

  if (!items.length) {
    return (
      <main id="main-content" className="simple-form-page">
        <div className="empty-card">
          주문할 상품이 없습니다. <a href="/shop/cart.php">장바구니로 이동</a>
        </div>
      </main>
    );
  }

  if (!buyerLoaded) {
    return <div className="empty-card">주문자 정보를 불러오는 중입니다.</div>;
  }

  return (
    <>
      {error ? <p className="commerce-error" role="alert">{error}</p> : null}
      {sending ? <p className="commerce-notice">주문을 안전하게 접수하고 있습니다.</p> : null}
      <CheckoutPanel
        items={items}
        defaultBuyer={defaultBuyer}
        paymentMethods={paymentMethods}
        banks={[{ value: "manual", label: bankLabel }]}
        onSubmit={submit}
        submitting={sending}
        availablePoints={pointAccount.balance}
        canUsePoints={pointAccount.loaded && pointAccount.authenticated}
        pointUseEnabled={pointUseEnabled}
        pointUseMinimum={pointUseMinimum}
        pointUseMaximum={pointUseMaximum}
        pointUseUnit={pointUseUnit}
        shippingFee={shippingFee}
        shippingCarrier={shippingCarrier}
        customerServicePhone={customerServicePhone}
      />
    </>
  );
}

export function WishlistClient({ products }: { products: ProductSummary[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/customer/wishlist", {
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.assign(
            "/bbs/login.php?return_url=%2Fshop%2Fwishlist.php",
          );
          return;
        }
        if (!response.ok) {
          throw new Error("위시리스트를 불러오지 못했습니다.");
        }
        const payload = (await response.json()) as { productIds?: string[] };
        if (!disposed) {
          setIds(Array.isArray(payload.productIds) ? payload.productIds : []);
          setError("");
          setLoaded(true);
        }
      } catch {
        if (!disposed) {
          setError("위시리스트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setLoaded(true);
        }
      }
    };
    const handleRefresh = () => void refresh();
    void refresh();
    window.addEventListener("kg-wishlist-change", handleRefresh);
    return () => {
      disposed = true;
      window.removeEventListener("kg-wishlist-change", handleRefresh);
    };
  }, []);
  const wished = useMemo(
    () => products.filter((product) => ids.includes(product.id)),
    [ids, products],
  );
  return (
    <>
      {error ? (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      ) : null}
      <CategoryListing
        title="위시리스트"
        products={loaded ? wished : []}
      />
    </>
  );
}

export function CustomerLoginClient({
  returnUrl = "/shop/mypage.php",
}: {
  returnUrl?: string;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  return (
    <LoginPanel
      errorMessage={error}
      submitting={submitting}
      onSubmit={async (payload) => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        setError("");
        setSubmitting(true);
        try {
          const response = await fetch("/api/customer/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = (await response.json()) as {
            error?: string;
            role?: "admin" | "member";
          };
          if (!response.ok) {
            setError(result.error || "아이디 또는 비밀번호를 확인해 주세요.");
            return;
          }
          window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EVENT));
          window.location.assign(
            result.role === "admin" ? "/shop" : returnUrl,
          );
        } catch {
          setError("로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
          submittingRef.current = false;
          setSubmitting(false);
        }
      }}
    />
  );
}

export function CustomerRegisterClient({
  termsBody = "",
  privacyBody = "",
}: {
  termsBody?: string;
  privacyBody?: string;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  return (
    <>
      {message ? <p className="commerce-error" role="alert">{message}</p> : null}
      <RegisterPanel
        submitting={submitting}
        termsContent={
          <p style={{ whiteSpace: "pre-wrap" }}>{termsBody}</p>
        }
        privacyContent={
          <p style={{ whiteSpace: "pre-wrap" }}>{privacyBody}</p>
        }
        onSubmit={async (payload) => {
          if (submittingRef.current) return;
          submittingRef.current = true;
          setMessage("");
          setSubmitting(true);
          try {
            const response = await fetch("/api/customer/register", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) {
              setMessage(result.error || "회원가입을 완료하지 못했습니다.");
              return;
            }
            window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EVENT));
            window.location.assign("/shop/mypage.php");
          } catch {
            setMessage(
              "회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            );
          } finally {
            submittingRef.current = false;
            setSubmitting(false);
          }
        }}
      />
    </>
  );
}

export function MyPageClient() {
  const [member, setMember] = useState({
    name: "회원",
    points: 0,
    coupons: 0,
    email: "",
    phone: "",
    postcode: "",
    address1: "",
    address2: "",
    lastLoginAt: "",
    joinedAt: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [orders, setOrders] = useState<
    Array<{ id: string; orderedAt: string; label: string; amount: number; status: string }>
  >([]);
  const [pointHistory, setPointHistory] = useState<
    Array<{
      id: string;
      delta: number;
      balanceAfter: number;
      reason: string;
      expiresAt: string;
      createdAt: string;
    }>
  >([]);
  const [wishlist, setWishlist] = useState<
    Array<ProductSummary & { wishedAt: string }>
  >([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/customer/session", { cache: "no-store" }),
      fetch("/api/customer/wishlist", { cache: "no-store" }),
    ])
      .then(async ([sessionResponse, wishlistResponse]) => {
        const sessionResult = (await sessionResponse.json()) as {
          user?: {
            name?: string;
            points?: number;
            coupons?: number;
            email?: string;
            phone?: string;
            postcode?: string;
            address1?: string;
            address2?: string;
            lastLoginAt?: string;
            joinedAt?: string;
          };
          orders?: typeof orders;
          pointHistory?: typeof pointHistory;
        };
        if (!sessionResult.user) {
          window.location.assign(
            "/bbs/login.php?return_url=%2Fshop%2Fmypage.php",
          );
          return;
        }
        const user = sessionResult.user;
        setMember({
          name: user.name || "회원",
          points:
            typeof user.points === "number" && Number.isFinite(user.points)
              ? Math.max(0, Math.trunc(user.points))
              : 0,
          coupons:
            typeof user.coupons === "number" && Number.isFinite(user.coupons)
              ? Math.max(0, Math.trunc(user.coupons))
              : 0,
          email: user.email ?? "",
          phone: user.phone ?? "",
          postcode: user.postcode ?? "",
          address1: user.address1 ?? "",
          address2: user.address2 ?? "",
          lastLoginAt: user.lastLoginAt ?? "",
          joinedAt: user.joinedAt ?? "",
        });
        if (Array.isArray(sessionResult.orders)) {
          setOrders(sessionResult.orders);
        }
        if (Array.isArray(sessionResult.pointHistory)) {
          setPointHistory(sessionResult.pointHistory);
        }
        if (wishlistResponse.ok) {
          const wishlistResult = (await wishlistResponse.json()) as {
            products?: Array<ProductSummary & { wishedAt?: string }>;
          };
          if (Array.isArray(wishlistResult.products)) {
            setWishlist(
              wishlistResult.products.map((product) => ({
                ...product,
                wishedAt: product.wishedAt ?? "",
              })),
            );
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoadError("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLoaded(true);
      });
  }, []);

  if (!loaded) {
    return <div className="empty-card">회원 정보를 불러오는 중입니다.</div>;
  }

  if (loadError) {
    return (
      <main id="main-content" className="simple-form-page">
        <p className="commerce-error" role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <MyPagePanel
      memberName={member.name}
      memberEmail={member.email}
      memberPhone={member.phone}
      memberPostcode={member.postcode}
      memberAddress1={member.address1}
      memberAddress2={member.address2}
      lastLoginAt={member.lastLoginAt}
      joinedAt={member.joinedAt}
      points={member.points}
      coupons={member.coupons}
      orders={orders}
      pointHistory={pointHistory}
      wishlist={wishlist}
    />
  );
}

interface OrderLookupResult {
  id: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  trackingNumber: string;
  canCancel: boolean;
  subtotal: number;
  shippingFee: number;
  pointsUsed: number;
  couponDiscount: number;
  couponCode: string;
  earnedPoints: number;
  reversedPoints: number;
  total: number;
  recipientName: string;
  payment?: {
    method: string;
    depositor: string;
    instruction: string;
  };
  items: Array<{
    productId: string;
    productName: string;
    productImage: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

async function requestOrderLookup(
  orderId: string,
  email: string,
  token: string,
) {
  const response = await fetch("/api/orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, email, token }),
  });
  return {
    ok: response.ok,
    body: (await response.json()) as {
      order?: OrderLookupResult;
      error?: string;
    },
  };
}

export function OrderInquiryClient({
  initialOrderId = "",
  initialToken = "",
  shippingCarrier = "",
  customerServicePhone = "",
}: {
  initialOrderId?: string;
  initialToken?: string;
  shippingCarrier?: string;
  customerServicePhone?: string;
}) {
  const [orderId, setOrderId] = useState(initialOrderId);
  const [email, setEmail] = useState("");
  const [lookupToken, setLookupToken] = useState(initialToken);
  const [order, setOrder] = useState<OrderLookupResult | null>(null);
  const [message, setMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const lookupPendingRef = useRef(false);

  async function lookup(
    id = orderId,
    lookupEmail = email,
    token = lookupToken,
  ) {
    if (!id || lookupPendingRef.current) return;
    lookupPendingRef.current = true;
    setMessage("");
    setLookingUp(true);
    try {
      const { ok, body } = await requestOrderLookup(id, lookupEmail, token);
      if (!ok || !body.order) {
        setOrder(null);
        setMessage(body.error || "주문 정보를 확인할 수 없습니다.");
        return;
      }
      setOrder(body.order);
    } catch {
      setOrder(null);
      setMessage("주문 조회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      lookupPendingRef.current = false;
      setLookingUp(false);
    }
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    const token = initialToken || hash.get("token") || "";
    if (token) {
      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }
    const timer =
      token
        ? window.setTimeout(
            () => {
              setLookupToken(token);
              if (initialOrderId) {
                void requestOrderLookup(initialOrderId, "", token)
                  .then(({ ok, body }) => {
                    if (ok && body.order) setOrder(body.order);
                    else {
                      setMessage(
                        body.error || "주문 정보를 확인할 수 없습니다.",
                      );
                    }
                  })
                  .catch(() => setMessage("주문 정보를 확인할 수 없습니다."));
              }
            },
            0,
          )
        : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initialOrderId, initialToken]);

  return (
    <main id="main-content" className="simple-form-page order-lookup">
      <h1>주문/배송조회</h1>
      {shippingCarrier || customerServicePhone ? (
        <p className="commerce-notice">
          {shippingCarrier ? `기본 택배사: ${shippingCarrier}` : null}
          {shippingCarrier && customerServicePhone ? " · " : null}
          {customerServicePhone ? (
            <>
              배송 문의:{" "}
              <a href={`tel:${customerServicePhone}`}>
                {customerServicePhone}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <form
        className="plain-form"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <label>
          <span>주문번호</span>
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <label>
          <span>주문자 이메일</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required={!lookupToken}
            autoComplete="email"
          />
        </label>
        <button type="submit" disabled={lookingUp}>
          {lookingUp ? "조회 중" : "조회하기"}
        </button>
      </form>
      {message ? <p className="commerce-error" role="alert">{message}</p> : null}
      {order ? (
        <section className="order-result">
          <h2>주문번호 {order.id}</h2>
          <dl>
            <div><dt>주문상태</dt><dd>{order.status}</dd></div>
            <div><dt>결제상태</dt><dd>{order.paymentStatus}</dd></div>
            {order.trackingNumber ? (
              <>
                {shippingCarrier ? (
                  <div><dt>택배사</dt><dd>{shippingCarrier}</dd></div>
                ) : null}
                <div><dt>송장번호</dt><dd>{order.trackingNumber}</dd></div>
              </>
            ) : null}
            <div><dt>상품금액</dt><dd>{order.subtotal.toLocaleString("ko-KR")}원</dd></div>
            {order.shippingFee > 0 ? (
              <div><dt>배송비</dt><dd>{order.shippingFee.toLocaleString("ko-KR")}원</dd></div>
            ) : null}
            {order.couponDiscount > 0 ? (
              <div>
                <dt>쿠폰 할인{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                <dd>-{order.couponDiscount.toLocaleString("ko-KR")}원</dd>
              </div>
            ) : null}
            {order.pointsUsed > 0 ? (
              <div><dt>사용 포인트</dt><dd>-{order.pointsUsed.toLocaleString("ko-KR")}P</dd></div>
            ) : null}
            {order.earnedPoints > 0 ? (
              <div><dt>적립 포인트</dt><dd>{order.earnedPoints.toLocaleString("ko-KR")}P</dd></div>
            ) : null}
            {order.reversedPoints > 0 ? (
              <div><dt>반품 회수 포인트</dt><dd>-{order.reversedPoints.toLocaleString("ko-KR")}P</dd></div>
            ) : null}
            <div><dt>최종 결제금액</dt><dd>{order.total.toLocaleString("ko-KR")}원</dd></div>
            {order.payment ? (
              <>
                <div><dt>결제수단</dt><dd>{order.payment.method}</dd></div>
                <div><dt>입금자명</dt><dd>{order.payment.depositor}</dd></div>
              </>
            ) : null}
          </dl>
          {order.canCancel ? (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("이 주문을 취소하시겠습니까?")) return;
                void fetch(
                  `/api/orders/${encodeURIComponent(order.id)}/cancel`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token: lookupToken }),
                  },
                )
                  .then(async (response) => ({
                    ok: response.ok,
                    body: (await response.json()) as { error?: string },
                  }))
                  .then(({ ok, body }) => {
                    if (!ok) {
                      setMessage(body.error || "주문을 취소하지 못했습니다.");
                      return;
                    }
                    setOrder((current) =>
                      current
                        ? {
                            ...current,
                            status: "주문취소",
                            paymentStatus: "결제취소",
                            canCancel: false,
                          }
                        : current,
                    );
                    setMessage("주문이 취소되었습니다.");
                  })
                  .catch(() => setMessage("주문을 취소하지 못했습니다."));
              }}
            >
              주문취소
            </button>
          ) : null}
          {order.payment?.instruction ? (
            <p className="commerce-notice">{order.payment.instruction}</p>
          ) : null}
          <ul>
            {order.items.map((item) => (
              <li key={`${order.id}-${item.productId}`}>
                {item.productImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.productImage} alt="" />
                ) : null}
                <span>{item.productName}</span>
                <strong>
                  {item.quantity}개 · {item.lineTotal.toLocaleString("ko-KR")}원
                </strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

export function CustomerRecoveryClient() {
  return (
    <main id="main-content" className="simple-form-page">
      <h1>아이디·비밀번호 찾기</h1>
      <div className="empty-card">
        <p>
          새 도메인의 자동 메일 발송 계정이 연결되기 전에는 온라인
          비밀번호 재설정을 제공하지 않습니다.
        </p>
        <p>
          가입하신 이메일과 성함을 적어{" "}
          <a href="mailto:goldrian@naver.com">goldrian@naver.com</a>으로
          문의해 주세요. 본인 확인 후 안전하게 안내해 드립니다.
        </p>
      </div>
    </main>
  );
}
