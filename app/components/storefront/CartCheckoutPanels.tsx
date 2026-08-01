"use client";

/* eslint-disable @next/next/no-img-element -- local legacy paths are supplied at runtime */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./Storefront.module.css";
import type { CartLine } from "./types";
import { QuantitySelector } from "./QuantitySelector";
import {
  EmptyState,
  Panel,
  PriceSummary,
} from "./StorefrontPrimitives";
import { classNames, formatKRW } from "./utils";
import { openPostcodeSearch } from "@/app/components/daum-postcode";
import {
  defaultShopOperationSettings,
  maximumSelectablePoints,
  pointUseFailureMessage,
  validatePointUse,
} from "@/lib/shop-settings";

function cartLineKey(line: CartLine): string {
  return line.lineKey ?? line.id;
}

function CheckoutSteps({ active }: { active: 1 | 2 | 3 | 4 }) {
  const steps = [
    { number: 1, label: "상품선택", icon: "\uf25a" },
    { number: 2, label: "장바구니", icon: "\uf291" },
    { number: 3, label: "주문/결제", icon: "\uf09d" },
    { number: 4, label: "주문완료", icon: "\uf00c" },
  ];

  return (
    <ol className={styles.checkoutSteps} aria-label="주문 단계">
      {steps.map((step) => (
        <li
          key={step.number}
          className={step.number === active ? styles.checkoutStepActive : undefined}
          aria-current={step.number === active ? "step" : undefined}
        >
          <div className={styles.checkoutStepIcon} aria-hidden="true">
            {step.number === active ? (
              <span className={styles.checkoutStepMarker}>
                <span className={styles.checkoutStepAlarm} />
                <span className={styles.checkoutStepPoint} />
              </span>
            ) : null}
            <i>{step.icon}</i>
          </div>
          <strong className={styles.checkoutStepCaption}>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

export interface CartPanelProps {
  items: CartLine[];
  continueHref?: string;
  onItemsChange?: (items: CartLine[]) => void;
  onCheckout?: (selectedItems: CartLine[]) => void;
}

export function CartPanel({
  items,
  continueHref = "/shop",
  onItemsChange,
  onCheckout,
}: CartPanelProps) {
  const [lines, setLines] = useState(() => items);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(items.map(cartLineKey)),
  );

  const selectedLines = useMemo(
    () => lines.filter((line) => selected.has(cartLineKey(line))),
    [lines, selected],
  );
  const productTotal = selectedLines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const shippingTotal = selectedLines.reduce(
    (sum, line) => sum + (line.shippingFee ?? 0),
    0,
  );
  const pointTotal = selectedLines.reduce(
    (sum, line) => sum + (line.points ?? 0) * line.quantity,
    0,
  );

  function commit(next: CartLine[]) {
    setLines(next);
    onItemsChange?.(next);
  }

  function updateQuantity(id: string, quantity: number) {
    commit(
      lines.map((line) =>
        cartLineKey(line) === id ? { ...line, quantity } : line,
      ),
    );
  }

  function remove(ids: Set<string>) {
    commit(lines.filter((line) => !ids.has(cartLineKey(line))));
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(lines.map(cartLineKey)) : new Set());
  }

  return (
    <main id="main-content" className={styles.formPage}>
      <div className={styles.container}>
        <header className={styles.formPageHeader}>
          <h1>장바구니</h1>
        </header>
        <CheckoutSteps active={2} />

        <Panel
          title="상품 전체"
          actions={
            lines.length > 0 ? (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => remove(selected)}
                disabled={selected.size === 0}
              >
                선택삭제
              </button>
            ) : null
          }
        >
          {lines.length > 0 ? (
            <>
              <div className={styles.cartTable}>
                <div className={styles.cartTableHeader}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.size === lines.length && lines.length > 0}
                      onChange={(event) => toggleAll(event.target.checked)}
                      aria-label="상품 전체 선택"
                    />
                  </label>
                  <span>상품명</span>
                  <span>총수량</span>
                  <span>판매가</span>
                  <span>포인트</span>
                  <span>배송비</span>
                  <span>소계</span>
                </div>
                {lines.map((line) => {
                  const lineKey = cartLineKey(line);
                  const productId = line.productId ?? line.id;
                  return (
                  <article className={styles.cartTableRow} key={lineKey}>
                    <label className={styles.cartSelect}>
                      <input
                        type="checkbox"
                        checked={selected.has(lineKey)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(lineKey);
                            else next.delete(lineKey);
                            return next;
                          })
                        }
                        aria-label={`${line.name} 선택`}
                      />
                    </label>
                    <div className={styles.cartProduct}>
                      <a
                        href={
                          line.href ??
                          `/shop/item.php?it_id=${encodeURIComponent(productId)}`
                        }
                      >
                        <img src={line.image} alt="" />
                      </a>
                      <div>
                        <a
                          href={
                            line.href ??
                            `/shop/item.php?it_id=${encodeURIComponent(productId)}`
                          }
                        >
                          {line.name}
                        </a>
                        {line.option ? <small>{line.option}</small> : null}
                        <button
                          type="button"
                          onClick={() => remove(new Set([lineKey]))}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className={styles.cartQuantity}>
                      <span className={styles.cartMobileLabel}>수량</span>
                      <QuantitySelector
                        compact
                        value={line.quantity}
                        maximum={line.maximumQuantity ?? 99}
                        onChange={(quantity) => updateQuantity(lineKey, quantity)}
                      />
                    </div>
                    <span data-label="판매가">{formatKRW(line.unitPrice)}</span>
                    <span data-label="포인트">
                      {formatKRW((line.points ?? 0) * line.quantity)}
                    </span>
                    <span data-label="배송비">
                      {(line.shippingFee ?? 0) > 0
                        ? formatKRW(line.shippingFee ?? 0)
                        : "무료"}
                    </span>
                    <strong data-label="소계">
                      {formatKRW(line.unitPrice * line.quantity)}
                    </strong>
                  </article>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              title="장바구니에 담긴 상품이 없습니다."
              action={
                <a className={styles.secondaryFormButton} href={continueHref}>
                  쇼핑 계속하기
                </a>
              }
            />
          )}
        </Panel>

        {lines.length > 0 ? (
          <div className={styles.cartSummaryLayout}>
            <PriceSummary
              rows={[
                { label: "선택 상품금액", value: productTotal },
                { label: "배송비", value: shippingTotal },
                { label: "회원 적립 예정 포인트", value: pointTotal, muted: true },
              ]}
              total={productTotal + shippingTotal}
            />
            <div className={styles.cartActions}>
              <a href={continueHref} className={styles.secondaryFormButton}>
                쇼핑 계속하기
              </a>
              <button
                type="button"
                className={styles.primaryFormButton}
                disabled={selectedLines.length === 0}
                onClick={() => onCheckout?.(selectedLines)}
              >
                선택상품 주문하기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export type PaymentMethod =
  | "card"
  | "bank"
  | "transfer"
  | "virtual"
  | "mobile"
  | "points";

export interface CheckoutContact {
  name: string;
  phone: string;
  email?: string;
  postcode: string;
  address1: string;
  address2: string;
}

export interface CheckoutPayload {
  items: CartLine[];
  buyer: CheckoutContact;
  recipient: CheckoutContact;
  deliveryMemo: string;
  paymentMethod: PaymentMethod;
  depositor?: string;
  bankCode?: string;
  cashReceiptNumber?: string;
  couponCode: string;
  pointsUsed: number;
  agreePurchase: boolean;
}

export interface CheckoutPanelProps {
  items: CartLine[];
  defaultBuyer?: Partial<CheckoutContact>;
  paymentMethods?: PaymentMethod[];
  banks?: Array<{ value: string; label: string }>;
  onSubmit?: (payload: CheckoutPayload) => void;
  onPostcodeSearch?: (target: "buyer" | "recipient") => void;
  submitting?: boolean;
  submitLabel?: string;
  availablePoints?: number;
  canUsePoints?: boolean;
  pointUseEnabled?: boolean;
  pointUseMinimum?: number;
  pointUseMaximum?: number;
  pointUseUnit?: number;
  shippingFee?: number;
  shippingCarrier?: string;
  customerServicePhone?: string;
}

const paymentLabels: Record<PaymentMethod, string> = {
  card: "신용카드",
  bank: "실시간계좌이체",
  transfer: "실시간 계좌이체",
  virtual: "가상계좌",
  mobile: "휴대폰결제",
  points: "포인트 전액결제",
};

const blankContact: CheckoutContact = {
  name: "",
  phone: "",
  email: "",
  postcode: "",
  address1: "",
  address2: "",
};

interface AppliedCoupon {
  code: string;
  name: string;
  discount: number;
}

export function CheckoutPanel({
  items,
  defaultBuyer,
  paymentMethods = ["card", "bank"],
  banks = [],
  onSubmit,
  onPostcodeSearch,
  submitting = false,
  submitLabel,
  availablePoints = 0,
  canUsePoints = false,
  pointUseEnabled = defaultShopOperationSettings.pointUseEnabled,
  pointUseMinimum = defaultShopOperationSettings.pointUseMinimum,
  pointUseMaximum = defaultShopOperationSettings.pointUseMaximum,
  pointUseUnit = defaultShopOperationSettings.pointUseUnit,
  shippingFee,
  shippingCarrier = "",
  customerServicePhone = "",
}: CheckoutPanelProps) {
  const [buyer, setBuyer] = useState<CheckoutContact>({
    ...blankContact,
    ...defaultBuyer,
  });
  const [recipient, setRecipient] = useState<CheckoutContact>(blankContact);
  const [sameAsBuyer, setSameAsBuyer] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [pointsUsed, setPointsUsed] = useState(0);
  const [pointError, setPointError] = useState("");
  const [pointUseSelected, setPointUseSelected] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] =
    useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [buyerMobile, setBuyerMobile] = useState("");
  const [recipientMobile, setRecipientMobile] = useState("");
  const [shippingLabel, setShippingLabel] = useState("");
  const [saveShippingAddress, setSaveShippingAddress] = useState(false);

  const productTotal = items.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const baseShippingTotal =
    shippingFee === undefined
      ? items.reduce((sum, line) => sum + (line.shippingFee ?? 0), 0)
      : Math.max(0, Math.trunc(shippingFee));
  const [shippingQuote, setShippingQuote] = useState({
    totalFee: baseShippingTotal,
    additionalFee: 0,
    ruleName: "",
  });
  const [shippingQuoteError, setShippingQuoteError] = useState("");
  const hasShippingDestination = Boolean(
    recipient.postcode.trim() || recipient.address1.trim(),
  );
  const shippingTotal = hasShippingDestination
    ? shippingQuote.totalFee
    : baseShippingTotal;
  const shippingAdditionalFee = hasShippingDestination
    ? shippingQuote.additionalFee
    : 0;
  const shippingRuleName = hasShippingDestination
    ? shippingQuote.ruleName
    : "";
  const couponDiscount = Math.min(
    productTotal,
    Math.max(0, appliedCoupon?.discount ?? 0),
  );
  const orderTotal = Math.max(
    0,
    productTotal + shippingTotal - couponDiscount,
  );
  const pointSettings = {
    ...defaultShopOperationSettings,
    pointUseEnabled,
    pointUseMinimum,
    pointUseMaximum,
    pointUseUnit,
  };
  const maximumUsablePoints = canUsePoints
    ? maximumSelectablePoints({
        orderTotal,
        availablePoints,
        settings: pointSettings,
      })
    : 0;
  const requestedPoints = pointUseSelected ? pointsUsed : 0;
  const pointValidation = validatePointUse({
    pointsUsed: requestedPoints,
    orderTotal,
    availablePoints,
    authenticated: canUsePoints,
    settings: pointSettings,
  });
  const appliedPoints = pointValidation.ok ? requestedPoints : 0;
  const amountDue = Math.max(0, orderTotal - appliedPoints);
  const effectivePaymentMethod: PaymentMethod | null =
    amountDue === 0 && (appliedPoints > 0 || couponDiscount > 0)
      ? "points"
      : paymentMethod || null;
  const canSelectPoints =
    canUsePoints &&
    pointUseEnabled &&
    maximumUsablePoints >= pointUseMinimum;
  const hasAvailablePaymentMethod =
    effectivePaymentMethod !== null &&
    (effectivePaymentMethod === "points" ||
      paymentMethods.includes(effectivePaymentMethod));

  useEffect(() => {
    const postcode = recipient.postcode.trim();
    const address1 = recipient.address1.trim();
    if (!postcode && !address1) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postcode, address1 }),
        signal: controller.signal,
      })
        .then(async (response) => ({
          ok: response.ok,
          body: (await response.json()) as {
            error?: string;
            quote?: {
              totalFee?: number;
              additionalFee?: number;
              ruleName?: string;
            };
          },
        }))
        .then(({ ok, body }) => {
          if (
            !ok ||
            !body.quote ||
            !Number.isSafeInteger(body.quote.totalFee) ||
            !Number.isSafeInteger(body.quote.additionalFee)
          ) {
            setShippingQuote({
              totalFee: baseShippingTotal,
              additionalFee: 0,
              ruleName: "",
            });
            setShippingQuoteError(
              body.error ??
                "추가배송비를 미리 확인하지 못했습니다. 주문 시 다시 계산됩니다.",
            );
            return;
          }
          setShippingQuote({
            totalFee: Math.max(0, body.quote.totalFee ?? baseShippingTotal),
            additionalFee: Math.max(0, body.quote.additionalFee ?? 0),
            ruleName: body.quote.ruleName ?? "",
          });
          setShippingQuoteError("");
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          setShippingQuote({
            totalFee: baseShippingTotal,
            additionalFee: 0,
            ruleName: "",
          });
          setShippingQuoteError(
            "추가배송비를 미리 확인하지 못했습니다. 주문 시 다시 계산됩니다.",
          );
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [baseShippingTotal, recipient.address1, recipient.postcode]);

  function updateContact(
    target: "buyer" | "recipient",
    field: keyof CheckoutContact,
    value: string,
  ) {
    if (target === "buyer") {
      const nextBuyer = { ...buyer, [field]: value };
      setBuyer(nextBuyer);
      if (sameAsBuyer) setRecipient({ ...nextBuyer });
      return;
    }
    setRecipient((current) => ({ ...current, [field]: value }));
  }

  function copyBuyer(checked: boolean) {
    setSameAsBuyer(checked);
    if (checked) {
      setRecipient({ ...buyer });
      setRecipientMobile(buyerMobile);
      return;
    }
    setRecipient({ ...blankContact });
    setRecipientMobile("");
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setAppliedCoupon(null);
      setCouponError("쿠폰코드를 입력해 주세요.");
      return;
    }
    if (couponChecking) return;
    setCouponChecking(true);
    setCouponError("");
    try {
      const response = await fetch("/api/coupons/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, subtotal: productTotal }),
      });
      const result = (await response.json()) as {
        error?: string;
        coupon?: {
          code?: string;
          name?: string;
          discount?: number;
        };
      };
      if (
        !response.ok ||
        !result.coupon?.code ||
        !result.coupon.name ||
        !Number.isSafeInteger(result.coupon.discount)
      ) {
        setAppliedCoupon(null);
        setCouponError(result.error ?? "쿠폰을 적용하지 못했습니다.");
        return;
      }
      setCouponCode(result.coupon.code);
      setAppliedCoupon({
        code: result.coupon.code,
        name: result.coupon.name,
        discount: Math.max(0, result.coupon.discount ?? 0),
      });
      setCouponError("");
    } catch {
      setAppliedCoupon(null);
      setCouponError("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setCouponChecking(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (couponCode.trim() && !appliedCoupon) {
      setCouponError("쿠폰 적용 버튼을 눌러 쿠폰을 확인해 주세요.");
      return;
    }
    if (!pointValidation.ok && pointValidation.failure) {
      setPointError(
        pointUseFailureMessage(pointValidation.failure, pointSettings),
      );
      return;
    }
    if (!hasAvailablePaymentMethod || !effectivePaymentMethod) return;
    setPointError("");
    const form = new FormData(event.currentTarget);
    onSubmit?.({
      items,
      buyer,
      recipient,
      deliveryMemo: String(form.get("deliveryMemo") ?? ""),
      paymentMethod: effectivePaymentMethod,
      depositor: String(form.get("depositor") ?? ""),
      bankCode: String(form.get("bankCode") ?? ""),
      cashReceiptNumber: String(form.get("cashReceiptNumber") ?? ""),
      couponCode: appliedCoupon?.code ?? "",
      pointsUsed: appliedPoints,
      agreePurchase: true,
    });
  }

  const renderContactFields = (
    target: "buyer" | "recipient",
    contact: CheckoutContact,
  ) => (
    <div className={styles.fieldTable}>
      <label className={styles.formRow}>
        <span>
          이름 <em>*</em>
        </span>
        <div>
          <input
            className={styles.legacyRequiredInput}
            type="text"
            value={contact.name}
            onChange={(event) => updateContact(target, "name", event.target.value)}
            autoComplete={target === "buyer" ? "name" : "shipping name"}
            required
          />
        </div>
      </label>
      <label className={styles.formRow}>
        <span>
          전화번호 <em>*</em>
        </span>
        <div>
          <input
            className={styles.legacyRequiredInput}
            type="tel"
            value={contact.phone}
            onChange={(event) => updateContact(target, "phone", event.target.value)}
            autoComplete={target === "buyer" ? "tel" : "shipping tel"}
            required
          />
        </div>
      </label>
      <label className={styles.formRow}>
        <span>핸드폰</span>
        <div>
          <input
            type="tel"
            value={target === "buyer" ? buyerMobile : recipientMobile}
            onChange={(event) => {
              if (target === "buyer") setBuyerMobile(event.currentTarget.value);
              else setRecipientMobile(event.currentTarget.value);
            }}
            autoComplete={target === "buyer" ? "tel" : "shipping tel"}
          />
        </div>
      </label>
      <div className={classNames(styles.formRow, styles.addressRow)}>
        <span>
          주소 <em>*</em>
        </span>
        <div>
          <div className={styles.inlineField}>
            <input
              className={styles.legacyRequiredInput}
              type="text"
              value={contact.postcode}
              onChange={(event) =>
                updateContact(target, "postcode", event.target.value)
              }
              placeholder="우편번호"
              required
            />
            <button
              type="button"
              onClick={() => {
                if (onPostcodeSearch) {
                  onPostcodeSearch(target);
                  return;
                }
                void openPostcodeSearch(({ postcode, address }) => {
                  updateContact(target, "postcode", postcode);
                  updateContact(target, "address1", address);
                }).catch(() => {
                  window.alert("주소검색 서비스를 불러오지 못했습니다.");
                });
              }}
            >
              주소검색
            </button>
          </div>
          <input
            className={styles.legacyRequiredInput}
            type="text"
            value={contact.address1}
            onChange={(event) =>
              updateContact(target, "address1", event.target.value)
            }
            placeholder="기본주소"
            required
          />
          <input
            type="text"
            value={contact.address2}
            onChange={(event) =>
              updateContact(target, "address2", event.target.value)
            }
            placeholder="상세주소"
          />
        </div>
      </div>
      {target === "buyer" ? (
        <label className={styles.formRow}>
          <span>
            E-mail <em>*</em>
          </span>
          <div>
            <input
              className={styles.legacyRequiredInput}
              type="email"
              value={contact.email ?? ""}
              onChange={(event) => updateContact(target, "email", event.target.value)}
              autoComplete="email"
              required
            />
          </div>
        </label>
      ) : null}
    </div>
  );

  return (
    <main id="main-content" className={styles.legacyCheckoutPage}>
      <div className={styles.container}>
        <CheckoutSteps active={3} />
        <form onSubmit={submit} className={styles.legacyCheckoutForm}>
          <section
            className={styles.legacyCheckoutProducts}
            aria-label={`주문상품 ${items.length}개`}
          >
            <div className={styles.legacyCheckoutProductHeader}>
              <strong>상품명</strong>
              <strong>총수량</strong>
              <strong>판매가</strong>
              <strong>소계</strong>
              <strong>포인트</strong>
              <strong>배송비</strong>
            </div>
            {items.map((line) => (
              <article
                className={styles.legacyCheckoutProductRow}
                key={cartLineKey(line)}
              >
                <div>
                  <img src={line.image} alt="" />
                  <span>
                    <strong>
                      {line.name.includes("요약정보 및 구매")
                        ? line.name
                        : `${line.name} 요약정보 및 구매`}
                    </strong>
                    {line.option ? <small>{line.option}</small> : null}
                    <small>
                      {line.name.includes("요약정보 및 구매")
                        ? line.name
                        : `${line.name} 요약정보 및 구매`} {line.quantity}개 (+0원)
                    </small>
                  </span>
                </div>
                <span data-label="총수량">{line.quantity}</span>
                <span data-label="판매가">
                  {line.unitPrice.toLocaleString("ko-KR")}
                </span>
                <strong data-label="소계">
                  {(line.unitPrice * line.quantity).toLocaleString("ko-KR")}
                </strong>
                <span data-label="포인트">
                  {((line.points ?? 0) * line.quantity).toLocaleString("ko-KR")}
                </span>
                <span data-label="배송비">선불</span>
              </article>
            ))}
          </section>

          <div className={styles.checkoutLayout}>
            <div className={styles.checkoutMain}>
              <section className={styles.legacyCheckoutSection}>
                <header className={styles.legacyCheckoutSectionHeader}>
                  <h2>주문하시는 분</h2>
                </header>
                <div className={styles.legacyCheckoutSectionBody}>
                  {renderContactFields("buyer", buyer)}
                </div>
              </section>

              <section className={styles.legacyCheckoutSection}>
                <header className={styles.legacyCheckoutSectionHeader}>
                  <h2>받으시는 분</h2>
                </header>
                <div className={styles.legacyCheckoutSectionBody}>
                  <div className={styles.fieldTable}>
                    <div className={styles.formRow}>
                      <span>배송지선택</span>
                      <div className={styles.legacyShippingChoices}>
                        <label>
                          <input
                            type="radio"
                            name="shippingChoice"
                            checked={sameAsBuyer}
                            onChange={() => copyBuyer(true)}
                          />
                          주문자와 동일
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="shippingChoice"
                            checked={!sameAsBuyer}
                            onChange={() => copyBuyer(false)}
                          />
                          신규배송지
                        </label>
                        <button type="button" onClick={() => copyBuyer(true)}>
                          배송지목록
                        </button>
                      </div>
                    </div>
                    <label className={styles.formRow}>
                      <span>배송지명</span>
                      <div className={styles.legacyShippingName}>
                        <input
                          type="text"
                          value={shippingLabel}
                          onChange={(event) => setShippingLabel(event.currentTarget.value)}
                        />
                        <label>
                          <input
                            type="checkbox"
                            checked={saveShippingAddress}
                            onChange={(event) => setSaveShippingAddress(event.currentTarget.checked)}
                          />
                          기본배송지로 설정
                        </label>
                      </div>
                    </label>
                  </div>
                  {renderContactFields("recipient", recipient)}
                  <input name="deliveryMemo" type="hidden" value="" />
                  {shippingAdditionalFee > 0 ? (
                    <p className={styles.checkoutPaymentNotice} role="status">
                      {shippingRuleName ? `${shippingRuleName} 지역 ` : ""}
                      추가배송비 {shippingAdditionalFee.toLocaleString("ko-KR")}원이 적용됩니다.
                    </p>
                  ) : null}
                  {hasShippingDestination && shippingQuoteError ? (
                    <p className={styles.checkoutPointError} role="status">
                      {shippingQuoteError}
                    </p>
                  ) : null}
                  {shippingCarrier || customerServicePhone ? (
                    <p className={styles.legacyCheckoutDeliveryHelp}>
                      {shippingCarrier ? `기본 택배사 ${shippingCarrier}` : null}
                      {shippingCarrier && customerServicePhone ? " · " : null}
                      {customerServicePhone ? `배송 문의 ${customerServicePhone}` : null}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <aside className={styles.checkoutAside}>
              <div className={styles.checkoutAsideSticky}>
                <section className={styles.legacyCheckoutSummary} aria-label="주문 금액 요약">
                  <div className={styles.legacyCheckoutEquation}>
                    <div>
                      <span>주문</span>
                      <strong>{productTotal.toLocaleString("ko-KR")}<small>원</small></strong>
                    </div>
                    <span className={styles.legacyCheckoutOperator} aria-hidden="true">−</span>
                    <div>
                      <span>쿠폰 할인</span>
                      <strong>{couponDiscount.toLocaleString("ko-KR")}<small>원</small></strong>
                    </div>
                    <button
                      type="button"
                      className={styles.legacyCheckoutOperator}
                      aria-label="쿠폰 사용"
                      aria-expanded={couponPanelOpen}
                      onClick={() => setCouponPanelOpen((current) => !current)}
                    >
                      +
                    </button>
                    <div>
                      <span>배송비</span>
                      <strong>{shippingTotal.toLocaleString("ko-KR")}<small>원</small></strong>
                    </div>
                  </div>
                  {couponPanelOpen ? (
                    <div className={styles.legacyCheckoutCompactTool}>
                      <div>
                        <input
                          type="text"
                          value={couponCode}
                          maxLength={40}
                          autoCapitalize="characters"
                          spellCheck={false}
                          placeholder="쿠폰코드 입력"
                          onChange={(event) => {
                            setCouponCode(event.currentTarget.value.toUpperCase());
                            setAppliedCoupon(null);
                            setCouponError("");
                          }}
                        />
                        <button type="button" disabled={couponChecking} onClick={() => void applyCoupon()}>
                          {couponChecking ? "확인 중" : "적용"}
                        </button>
                      </div>
                      {appliedCoupon ? (
                        <p role="status">
                          {appliedCoupon.name} · {appliedCoupon.discount.toLocaleString("ko-KR")}원 할인
                        </p>
                      ) : null}
                      {couponError ? <p role="alert">{couponError}</p> : null}
                    </div>
                  ) : null}
                  <div className={classNames(styles.legacyCheckoutSummaryRow, styles.legacyCheckoutSummaryTotal)}>
                    <span>총계</span>
                    <strong>{amountDue.toLocaleString("ko-KR")}<small>원</small></strong>
                  </div>
                  <div className={styles.legacyCheckoutSummaryRow}>
                    <span>보유 포인트</span>
                    <strong>{availablePoints.toLocaleString("ko-KR")}<small>원</small></strong>
                  </div>
                </section>

                <section className={styles.legacyCheckoutPaymentInfo}>
                  <h2>결제정보</h2>
                  <div>
                    <span>추가배송비</span>
                    <strong>{shippingAdditionalFee.toLocaleString("ko-KR")}<small>원</small></strong>
                  </div>
                  <p><em>*</em> 지역에 따라 추가되는 도선료 등의 배송비입니다.</p>
                </section>
                <div className={styles.legacyCheckoutGrandTotal}>
                  <strong>총 주문금액</strong>
                  <b>{amountDue.toLocaleString("ko-KR")}<small>원</small></b>
                </div>

                <section className={styles.legacyCheckoutPayment}>
                  <h2>결제수단</h2>
                  {paymentMethods.length > 0 || pointUseEnabled ? (
                    <>
                    <div className={styles.paymentMethods} role="group" aria-label="결제수단 선택">
                      {paymentMethods.map((method) => (
                        <label
                          key={method}
                          className={paymentMethod === method ? styles.paymentMethodActive : undefined}
                        >
                          <input
                            type="checkbox"
                            name="paymentMethod"
                            value={method}
                            checked={paymentMethod === method}
                            onChange={(event) =>
                              setPaymentMethod(event.currentTarget.checked ? method : "")
                            }
                          />
                          <span>{paymentLabels[method]}</span>
                        </label>
                      ))}
                      {pointUseEnabled ? (
                        <label
                          className={classNames(
                            styles.legacyPointPaymentOption,
                            pointUseSelected ? styles.paymentMethodActive : undefined,
                          )}
                        >
                          <input
                            type="checkbox"
                            name="usePoints"
                            checked={pointUseSelected}
                            disabled={!canSelectPoints}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setPointUseSelected(checked);
                              if (!checked) setPointsUsed(0);
                              setPointError("");
                            }}
                          />
                          <span>포인트사용</span>
                        </label>
                      ) : null}
                    </div>
                    {pointUseSelected ? (
                      <div className={classNames(styles.legacyCheckoutCompactTool, styles.legacyCheckoutPointTool)}>
                        <div>
                          <input
                            type="number"
                            min={0}
                            max={maximumUsablePoints}
                            step={pointUseUnit}
                            inputMode="numeric"
                            value={pointsUsed}
                            disabled={!canSelectPoints}
                            aria-label="사용할 포인트"
                            aria-invalid={Boolean(pointError) || undefined}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value);
                              setPointsUsed(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
                              setPointError("");
                            }}
                          />
                          <button
                            type="button"
                            disabled={!canSelectPoints}
                            onClick={() => {
                              setPointsUsed(maximumUsablePoints);
                              setPointError("");
                            }}
                          >
                            전액
                          </button>
                        </div>
                        <p>
                          {pointUseMinimum.toLocaleString("ko-KR")}P 이상 · {pointUseUnit.toLocaleString("ko-KR")}P 단위
                        </p>
                        {pointError ? <p role="alert">{pointError}</p> : null}
                      </div>
                    ) : null}
                    {effectivePaymentMethod === "points" ? (
                      <p className={styles.checkoutPaymentNotice}>
                        쿠폰과 포인트로 전액 결제됩니다.
                      </p>
                    ) : null}
                    </>
                  ) : (
                    <p className={styles.checkoutPointError} role="alert">현재 사용할 수 있는 결제수단이 없습니다.</p>
                  )}

                  {effectivePaymentMethod === "bank" ? (
                    <div className={styles.bankFields}>
                      <div className={styles.legacyBankAccount}>
                        <span>입금할 계좌</span>
                        {banks.length === 1 ? (
                          <>
                            <input name="bankCode" type="hidden" value={banks[0].value} />
                            <strong>{banks[0].label}</strong>
                          </>
                        ) : (
                          <select name="bankCode" required defaultValue="">
                            <option value="">계좌를 선택해 주세요.</option>
                            {banks.map((bank) => (
                              <option key={bank.value} value={bank.value}>{bank.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <label className={styles.legacyDepositorField}>
                        <span>입금자명</span>
                        <input name="depositor" type="text" defaultValue={buyer.name} required />
                      </label>
                      <input name="cashReceiptNumber" type="hidden" value="" />
                    </div>
                  ) : null}
                </section>

                <button
                  type="submit"
                  className={styles.primaryFormButton}
                  disabled={submitting || !hasAvailablePaymentMethod}
                >
                  {submitting ? "주문 접수 중…" : submitLabel ?? "주문하기"}
                </button>
                <a className={styles.legacyCheckoutCancel} href="/shop/cart.php">취소</a>
              </div>
            </aside>
          </div>
        </form>
      </div>
    </main>
  );
}
