"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  AdditionalShippingRule,
  AdminCouponRecord,
  CouponType,
} from "@/lib/commerce-promotions";
import styles from "./promotion-tools.module.css";

type FieldErrors = Record<string, string | undefined>;

interface CouponApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  coupon?: AdminCouponRecord;
}

interface ShippingApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  rule?: AdditionalShippingRule;
}

interface CouponFormState {
  code: string;
  name: string;
  type: CouponType;
  amount: number;
  minimumOrder: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  zoneEnabled: boolean;
}

const blankCoupon = (zoneOnly: boolean): CouponFormState => ({
  code: "",
  name: "",
  type: "fixed",
  amount: 0,
  minimumOrder: 0,
  startsAt: "",
  endsAt: "",
  active: true,
  zoneEnabled: zoneOnly,
});

export function CouponAdminManager({
  initialCoupons,
  zoneOnly,
}: {
  initialCoupons: AdminCouponRecord[];
  zoneOnly: boolean;
}) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [form, setForm] = useState(() => blankCoupon(zoneOnly));
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = useMemo(() => coupons.length, [coupons]);
  const [searchField, setSearchField] = useState<
    "member" | "name" | "code"
  >(
    "member",
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCouponIds, setSelectedCouponIds] = useState<Set<string>>(
    () => new Set(),
  );
  const filteredCoupons = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase("ko-KR");
    if (!needle) return coupons;
    return coupons.filter((coupon) => {
      const value =
        searchField === "member"
          ? ""
          : searchField === "name"
          ? coupon.name
          : coupon.code;
      return value.toLocaleLowerCase("ko-KR").includes(needle);
    });
  }, [coupons, searchField, searchQuery]);

  function change<Key extends keyof CouponFormState>(
    key: Key,
    value: CouponFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function reset() {
    setEditingId("");
    setForm(blankCoupon(zoneOnly));
    setFieldErrors({});
    setShowForm(false);
  }

  function create() {
    setEditingId("");
    setForm(blankCoupon(zoneOnly));
    setFieldErrors({});
    setMessage("");
    setFailed(false);
    setShowForm(true);
  }

  function edit(coupon: AdminCouponRecord) {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      amount: coupon.amount,
      minimumOrder: coupon.minimumOrder,
      startsAt: coupon.startsAt.slice(0, 10),
      endsAt: coupon.endsAt.slice(0, 10),
      active: coupon.active,
      zoneEnabled: zoneOnly ? true : coupon.zoneEnabled,
    });
    setMessage("");
    setFailed(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setFieldErrors({});
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/coupons/${encodeURIComponent(editingId)}`
          : "/api/admin/coupons",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...form,
            zoneEnabled: zoneOnly ? true : form.zoneEnabled,
          }),
        },
      );
      const result = (await response.json()) as CouponApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.coupon) {
        setFieldErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(result.message ?? "쿠폰을 저장하지 못했습니다.");
        return;
      }
      setCoupons((current) =>
        editingId
          ? current.map((coupon) =>
              coupon.id === result.coupon!.id ? result.coupon! : coupon,
            )
          : [result.coupon!, ...current],
      );
      setMessage(editingId ? "쿠폰을 수정했습니다." : "쿠폰을 등록했습니다.");
      reset();
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(coupon: AdminCouponRecord) {
    if (!window.confirm("선택한 쿠폰을 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/coupons/${encodeURIComponent(coupon.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as CouponApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? "쿠폰을 삭제하지 못했습니다.");
        return;
      }
      setCoupons((current) =>
        current.filter((item) => item.id !== coupon.id),
      );
      if (editingId === coupon.id) reset();
      setMessage("쿠폰을 삭제했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function removeSelectedCoupons(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = coupons.filter((coupon) =>
      selectedCouponIds.has(coupon.id),
    );
    if (targets.length === 0) {
      window.alert("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      for (const coupon of targets) {
        const response = await fetch(
          `/api/admin/coupons/${encodeURIComponent(coupon.id)}`,
          { method: "DELETE" },
        );
        const result = (await response.json()) as CouponApiResult;
        if (response.status === 401) {
          window.location.assign("/adm/login");
          return;
        }
        if (!response.ok) {
          throw new Error(result.message ?? "쿠폰을 삭제하지 못했습니다.");
        }
      }
      const removedIds = new Set(targets.map((coupon) => coupon.id));
      setCoupons((current) =>
        current.filter((coupon) => !removedIds.has(coupon.id)),
      );
      setSelectedCouponIds(new Set());
      if (editingId && removedIds.has(editingId)) reset();
      setMessage(
        `선택한 쿠폰 ${targets.length.toLocaleString("ko-KR")}개를 삭제했습니다.`,
      );
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error ? cause.message : "쿠폰을 삭제하지 못했습니다.",
      );
    }
  }

  return (
    <>
      {showForm ? <div className={`local_desc01 local_desc ${styles.couponIntro}`}>
        <p>
          {zoneOnly
            ? "고객이 쿠폰존에서 다운로드할 쿠폰을 등록하고 관리합니다."
            : "주문서에서 사용할 쿠폰코드와 할인 조건을 관리합니다."}
        </p>
      </div> : null}

      {showForm ? <div className="btn_fixed_top">
        <button
          className="btn_01 btn"
          type="button"
          onClick={reset}
        >
          {zoneOnly ? "쿠폰존관리" : "쿠폰관리"}
        </button>
      </div> : null}

      {showForm ? <form onSubmit={save}>
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>{zoneOnly ? "쿠폰존 쿠폰관리" : "쿠폰관리"}</caption>
            <colgroup>
              <col className={styles.labelColumn} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-name">쿠폰이름</label>
                </th>
                <td>
                  <input
                    id="coupon-name"
                    className={`${styles.wideInput} frm_input`}
                    value={form.name}
                    maxLength={100}
                    required
                    onChange={(event) => change("name", event.currentTarget.value)}
                  />
                  <FieldError value={fieldErrors.name} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-code">쿠폰코드</label>
                </th>
                <td>
                  <span className={styles.inlineControls}>
                    <input
                      id="coupon-code"
                      className={`${styles.codeInput} frm_input`}
                      value={form.code}
                      maxLength={40}
                      required
                      autoCapitalize="characters"
                      spellCheck={false}
                      onChange={(event) =>
                        change("code", event.currentTarget.value.toUpperCase())
                      }
                    />
                    <button
                      type="button"
                      className="btn btn_02"
                      onClick={() =>
                        change(
                          "code",
                          `KIEL-${crypto.randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase()}`,
                        )
                      }
                    >
                      자동생성
                    </button>
                  </span>
                  <span className="frm_info">
                    영문 대문자, 숫자, 하이픈을 사용할 수 있습니다.
                  </span>
                  <FieldError value={fieldErrors.code} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-type">쿠폰종류</label>
                </th>
                <td>
                  <select
                    id="coupon-type"
                    value={form.type}
                    onChange={(event) =>
                      change("type", event.currentTarget.value as CouponType)
                    }
                  >
                    <option value="fixed">금액 할인</option>
                    <option value="percent">비율 할인</option>
                  </select>
                  <FieldError value={fieldErrors.type} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-amount">할인금액</label>
                </th>
                <td>
                  <input
                    id="coupon-amount"
                    className={`${styles.moneyInput} frm_input`}
                    type="number"
                    min={1}
                    max={form.type === "percent" ? 100 : 100_000_000}
                    value={form.amount}
                    required
                    onChange={(event) =>
                      change("amount", integerValue(event.currentTarget.value))
                    }
                  />{" "}
                  {form.type === "percent" ? "%" : "원"}
                  <FieldError value={fieldErrors.amount} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-minimum">최소주문금액</label>
                </th>
                <td>
                  <input
                    id="coupon-minimum"
                    className={`${styles.moneyInput} frm_input`}
                    type="number"
                    min={0}
                    max={100_000_000}
                    value={form.minimumOrder}
                    required
                    onChange={(event) =>
                      change(
                        "minimumOrder",
                        integerValue(event.currentTarget.value),
                      )
                    }
                  />{" "}
                  원
                  <FieldError value={fieldErrors.minimumOrder} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-start">사용시작일</label>
                </th>
                <td>
                  <input
                    id="coupon-start"
                    className="frm_input"
                    type="date"
                    value={form.startsAt}
                    onChange={(event) =>
                      change("startsAt", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.startsAt} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="coupon-end">사용종료일</label>
                </th>
                <td>
                  <input
                    id="coupon-end"
                    className="frm_input"
                    type="date"
                    value={form.endsAt}
                    onChange={(event) =>
                      change("endsAt", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.endsAt} />
                </td>
              </tr>
              {!zoneOnly ? (
                <tr>
                  <th scope="row">쿠폰존 노출</th>
                  <td>
                    <BooleanRadios
                      name="coupon-zone"
                      value={form.zoneEnabled}
                      onChange={(value) => change("zoneEnabled", value)}
                    />
                    <span className="frm_info">
                      사용으로 설정하면 회원이 쿠폰존에서 다운로드할 수 있습니다.
                    </span>
                    <FieldError value={fieldErrors.zoneEnabled} />
                  </td>
                </tr>
              ) : null}
              <tr>
                <th scope="row">사용 여부</th>
                <td>
                  <BooleanRadios
                    name="coupon-active"
                    value={form.active}
                    onChange={(value) => change("active", value)}
                  />
                  <FieldError value={fieldErrors.active} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={styles.formActions}>
          {editingId ? (
            <button className="btn btn_02" type="button" onClick={reset}>
              취소
            </button>
          ) : null}
          <button className="btn_submit btn" type="submit" disabled={saving}>
            {saving ? "저장 중…" : editingId ? "수정" : "쿠폰 추가"}
          </button>
        </div>
      </form> : null}
      <StatusMessage message={message} failed={failed} />

      {!showForm ? <><div className={`local_ov ${styles.couponSummary}`}>
        <span className="btn_ov01">
          <span className="ov_txt">전체</span>
          <span className="ov_num">{count}개</span>
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.couponSearch}`}
        onSubmit={(event) => {
          event.preventDefault();
          setSearchQuery(searchInput);
        }}
      >
        {!zoneOnly ? (
          <>
            <label
              className="sound_only"
              htmlFor={`coupon-search-field-${zoneOnly}`}
            >
              검색대상
            </label>
            <select
              id={`coupon-search-field-${zoneOnly}`}
              value={searchField}
              onChange={(event) =>
                setSearchField(
                  event.currentTarget.value as "member" | "name" | "code",
                )
              }
            >
              <option value="member">회원아이디</option>
              <option value="name">쿠폰이름</option>
              <option value="code">쿠폰코드</option>
            </select>
          </>
        ) : null}
        <label className="sound_only" htmlFor={`coupon-search-query-${zoneOnly}`}>
          검색어
        </label>
        <input
          id={`coupon-search-query-${zoneOnly}`}
          className={`required frm_input ${styles.couponSearchInput}`}
          required
          value={searchInput}
          onChange={(event) => setSearchInput(event.currentTarget.value)}
        />
        <input className="btn_submit" type="submit" value="검색" />
      </form>
      <form
        id={`coupon-list-${zoneOnly ? "zone" : "normal"}`}
        className={styles.couponListForm}
        onSubmit={(event) => void removeSelectedCoupons(event)}
      >
      <div className="btn_fixed_top">
        <input
          className="btn btn_02 legacy-wide-fixed-action"
          type="submit"
          value="선택삭제"
        />{" "}
        <button
          className="btn_01 btn"
          type="button"
          onClick={create}
        >
          쿠폰 추가
        </button>
      </div>
      <div className={`tbl_head01 tbl_wrap ${styles.couponTable}`}>
        <table>
          <caption>{zoneOnly ? "쿠폰존관리" : "쿠폰관리"} 목록</caption>
          <colgroup>
            {(zoneOnly
              ? [
                  51.765625, 119.015625, 119.015625, 119.015625, 119.015625,
                  166.65625, 119.015625, 119.015625, 71.484375,
                ]
              : [
                  53.03125, 121.921875, 121.921875, 121.921875, 121.921875,
                  146.296875, 121.921875, 121.921875, 73.140625,
                ]
            ).map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            {zoneOnly ? (
              <tr>
                <th scope="col">
                  <label
                    className="sound_only"
                    htmlFor="coupon-zone-check-all"
                  >
                    쿠폰 전체
                  </label>
                  <input
                    id="coupon-zone-check-all"
                    type="checkbox"
                    checked={
                      filteredCoupons.length > 0 &&
                      filteredCoupons.every((coupon) =>
                        selectedCouponIds.has(coupon.id),
                      )
                    }
                    onChange={(event) =>
                      setSelectedCouponIds(
                        event.currentTarget.checked
                          ? new Set(filteredCoupons.map((coupon) => coupon.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th scope="col">쿠폰이름</th>
                <th scope="col">쿠폰종류</th>
                <th scope="col">적용대상</th>
                <th scope="col">쿠폰금액</th>
                <th scope="col">쿠폰사용기한</th>
                <th scope="col">다운로드</th>
                <th scope="col">사용기한</th>
                <th scope="col">관리</th>
              </tr>
            ) : (
              <tr>
                <th scope="col">
                  <label
                    className="sound_only"
                    htmlFor="coupon-check-all"
                  >
                    쿠폰 전체
                  </label>
                  <input
                    id="coupon-check-all"
                    type="checkbox"
                    checked={
                      filteredCoupons.length > 0 &&
                      filteredCoupons.every((coupon) =>
                        selectedCouponIds.has(coupon.id),
                      )
                    }
                    onChange={(event) =>
                      setSelectedCouponIds(
                        event.currentTarget.checked
                          ? new Set(filteredCoupons.map((coupon) => coupon.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th scope="col">쿠폰종류</th>
                <th scope="col">쿠폰코드</th>
                <th scope="col">쿠폰이름</th>
                <th scope="col">적용대상</th>
                <th scope="col">회원아이디</th>
                <th scope="col">사용기한</th>
                <th scope="col">사용회수</th>
                <th scope="col">관리</th>
              </tr>
            )}
          </thead>
          <tbody>
            {filteredCoupons.map((coupon, index) => (
              <tr key={coupon.id}>
                <td className="td_chk">
                  <label
                    className="sound_only"
                    htmlFor={`coupon-check-${zoneOnly}-${index}`}
                  >
                    내역선택
                  </label>
                  <input
                    id={`coupon-check-${zoneOnly}-${index}`}
                    type="checkbox"
                    checked={selectedCouponIds.has(coupon.id)}
                    onChange={(event) =>
                      setSelectedCouponIds((current) => {
                        const next = new Set(current);
                        if (event.currentTarget.checked) {
                          next.add(coupon.id);
                        } else {
                          next.delete(coupon.id);
                        }
                        return next;
                      })
                    }
                  />
                </td>
                {zoneOnly ? (
                  <>
                    <td className="td_left">{coupon.name}</td>
                    <td>
                      {coupon.type === "percent" ? "비율할인" : "금액할인"}
                    </td>
                    <td>전체상품</td>
                    <td>{couponAmountLabel(coupon)}</td>
                    <td>{periodLabel(coupon.startsAt, coupon.endsAt)}</td>
                    <td>{coupon.claimCount.toLocaleString("ko-KR")}회</td>
                    <td>{coupon.endsAt.slice(0, 10)}</td>
                  </>
                ) : (
                  <>
                    <td>
                      {coupon.type === "percent" ? "비율할인" : "금액할인"}
                    </td>
                    <td className="td_left">
                      <code>{coupon.code}</code>
                    </td>
                    <td className="td_left">{coupon.name}</td>
                    <td>전체상품</td>
                    <td>-</td>
                    <td>{periodLabel(coupon.startsAt, coupon.endsAt)}</td>
                    <td>{coupon.redemptionCount.toLocaleString("ko-KR")}회</td>
                  </>
                )}
                <td className="td_mng">
                  <button
                    className="btn btn_03"
                    type="button"
                    onClick={() => edit(coupon)}
                  >
                    수정
                  </button>{" "}
                  <button
                    className="btn btn_02"
                    type="button"
                    onClick={() => void remove(coupon)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {filteredCoupons.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={9}>
                  자료가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </form></> : null}
    </>
  );
}

interface ShippingFormState {
  regionName: string;
  postcodeStart: string;
  postcodeEnd: string;
  extraFee: number;
  active: boolean;
}

const blankShippingRule: ShippingFormState = {
  regionName: "",
  postcodeStart: "",
  postcodeEnd: "",
  extraFee: 0,
  active: true,
};

export function AdditionalShippingManager({
  initialRules,
}: {
  initialRules: AdditionalShippingRule[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [form, setForm] = useState(blankShippingRule);
  const [editingId, setEditingId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(
    () => new Set(),
  );

  function change<Key extends keyof ShippingFormState>(
    key: Key,
    value: ShippingFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function reset() {
    setEditingId("");
    setForm(blankShippingRule);
    setFieldErrors({});
  }

  function edit(rule: AdditionalShippingRule) {
    setEditingId(rule.id);
    setForm({
      regionName: rule.regionName,
      postcodeStart: rule.postcodeStart,
      postcodeEnd: rule.postcodeEnd,
      extraFee: rule.extraFee,
      active: rule.active,
    });
    setMessage("");
    setFailed(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setFieldErrors({});
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/shipping-rules/${encodeURIComponent(editingId)}`
          : "/api/admin/shipping-rules",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = (await response.json()) as ShippingApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.rule) {
        setFieldErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(
          result.message ?? "추가배송비 내역을 저장하지 못했습니다.",
        );
        return;
      }
      setRules((current) =>
        editingId
          ? current.map((rule) =>
              rule.id === result.rule!.id ? result.rule! : rule,
            )
          : [...current, result.rule!].sort((left, right) =>
              left.postcodeStart.localeCompare(right.postcodeStart),
            ),
      );
      setMessage(
        editingId
          ? "추가배송비 내역을 수정했습니다."
          : "추가배송비 내역을 등록했습니다.",
      );
      reset();
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: AdditionalShippingRule) {
    if (!window.confirm("선택한 추가배송비 내역을 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/shipping-rules/${encodeURIComponent(rule.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as ShippingApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(
          result.message ?? "추가배송비 내역을 삭제하지 못했습니다.",
        );
        return;
      }
      setRules((current) => current.filter((item) => item.id !== rule.id));
      if (editingId === rule.id) reset();
      setMessage("추가배송비 내역을 삭제했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function removeSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = rules.filter((rule) => selectedRuleIds.has(rule.id));
    if (targets.length === 0) {
      window.alert("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      for (const rule of targets) {
        const response = await fetch(
          `/api/admin/shipping-rules/${encodeURIComponent(rule.id)}`,
          { method: "DELETE" },
        );
        const result = (await response.json()) as ShippingApiResult;
        if (response.status === 401) {
          window.location.assign("/adm/login");
          return;
        }
        if (!response.ok) {
          throw new Error(
            result.message ?? "추가배송비 내역을 삭제하지 못했습니다.",
          );
        }
      }
      const removedIds = new Set(targets.map((rule) => rule.id));
      setRules((current) =>
        current.filter((rule) => !removedIds.has(rule.id)),
      );
      setSelectedRuleIds(new Set());
      if (editingId && removedIds.has(editingId)) reset();
      setMessage(
        `선택한 추가배송비 내역 ${targets.length.toLocaleString("ko-KR")}건을 삭제했습니다.`,
      );
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "추가배송비 내역을 삭제하지 못했습니다.",
      );
    }
  }

  return (
    <>
      <section className={styles.shippingListSection}>
        <h2>추가배송비 내역</h2>
        <form
          className={styles.shippingListForm}
          onSubmit={(event) => void removeSelected(event)}
        >
          <div className={`tbl_head01 tbl_wrap ${styles.shippingListTable}`}>
            <table>
              <caption>추가배송비 내역</caption>
              <colgroup>
                {[127.140625, 233.765625, 292.296875, 350.796875].map(
                  (width, index) => (
                    <col key={index} style={{ width }} />
                  ),
                )}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <label className="sound_only" htmlFor="shipping-check-all">
                      내역 전체
                    </label>
                    <input
                      id="shipping-check-all"
                      type="checkbox"
                      checked={
                        rules.length > 0 &&
                        rules.every((rule) => selectedRuleIds.has(rule.id))
                      }
                      onChange={(event) =>
                        setSelectedRuleIds(
                          event.currentTarget.checked
                            ? new Set(rules.map((rule) => rule.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th scope="col">지역명</th>
                  <th scope="col">우편번호</th>
                  <th scope="col">추가배송비</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr key={rule.id}>
                    <td className="td_chk">
                      <label
                        className="sound_only"
                        htmlFor={`shipping-check-${index}`}
                      >
                        내역선택
                      </label>
                      <input
                        id={`shipping-check-${index}`}
                        type="checkbox"
                        checked={selectedRuleIds.has(rule.id)}
                        onChange={(event) =>
                          setSelectedRuleIds((current) => {
                            const next = new Set(current);
                            if (event.currentTarget.checked) {
                              next.add(rule.id);
                            } else {
                              next.delete(rule.id);
                            }
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="td_left">{rule.regionName}</td>
                    <td>
                      {rule.postcodeStart} ~ {rule.postcodeEnd}
                    </td>
                    <td>{rule.extraFee.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td className="empty_table" colSpan={4}>
                      자료가 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div
            className={`${styles.shippingListActions} legacy-shipping-actions`}
          >
            <input
              className={`${styles.shippingListDelete} legacy-shipping-delete`}
              type="submit"
              value="선택삭제"
            />
          </div>
        </form>
      </section>

      <section className={styles.shippingCreateSection}>
        <h2 className="h2_frm">추가배송비 등록</h2>
        <form
          autoComplete="off"
          className={styles.shippingCreateForm}
          onSubmit={save}
        >
          <div className={`tbl_frm01 tbl_wrap ${styles.shippingCreateTable}`}>
            <table>
              <caption>추가배송비 등록</caption>
              <colgroup>
                <col style={{ width: 200 }} />
                <col style={{ width: 805 }} />
              </colgroup>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="shipping-region">지역명 필수</label>
                  </th>
                  <td>
                    <input
                      id="shipping-region"
                      className={`${styles.shippingRegionInput} required frm_input`}
                      value={form.regionName}
                      maxLength={80}
                      required
                      onChange={(event) =>
                        change("regionName", event.currentTarget.value)
                      }
                    />
                    <FieldError value={fieldErrors.regionName} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="shipping-postcode-start">
                      우편번호 시작 필수
                    </label>
                  </th>
                  <td>
                    <input
                      id="shipping-postcode-start"
                      className={`${styles.shippingPostcodeInput} required frm_input`}
                      value={form.postcodeStart}
                      inputMode="numeric"
                      pattern="\d{5}"
                      maxLength={5}
                      required
                      onChange={(event) =>
                        change(
                          "postcodeStart",
                          event.currentTarget.value.replace(/\D/gu, ""),
                        )
                      }
                    />{" "}
                    (입력 예 : 01234)
                    <FieldError value={fieldErrors.postcodeStart} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="shipping-postcode-end">
                      우편번호 끝 필수
                    </label>
                  </th>
                  <td>
                    <input
                      id="shipping-postcode-end"
                      className={`${styles.shippingPostcodeInput} required frm_input`}
                      value={form.postcodeEnd}
                      inputMode="numeric"
                      pattern="\d{5}"
                      maxLength={5}
                      required
                      onChange={(event) =>
                        change(
                          "postcodeEnd",
                          event.currentTarget.value.replace(/\D/gu, ""),
                        )
                      }
                    />{" "}
                    (입력 예 : 01234)
                    <FieldError value={fieldErrors.postcodeEnd} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="shipping-extra-fee">추가배송비 필수</label>
                  </th>
                  <td>
                    <input
                      id="shipping-extra-fee"
                      className={`${styles.shippingPriceInput} required frm_input`}
                      type="text"
                      inputMode="numeric"
                      pattern="\d+"
                      value={form.extraFee === 0 ? "" : String(form.extraFee)}
                      required
                      onChange={(event) =>
                        change(
                          "extraFee",
                          integerValue(
                            event.currentTarget.value.replace(/\D/gu, ""),
                          ),
                        )
                      }
                    />{" "}
                    원
                    <FieldError value={fieldErrors.extraFee} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.shippingConfirm}>
            <input
              className={`btn_submit btn ${styles.shippingConfirmButton}`}
              type="submit"
              disabled={saving}
              value={saving ? "저장 중…" : "확인"}
            />
          </div>
        </form>
      </section>
      <StatusMessage message={message} failed={failed} />
    </>
  );
}

function BooleanRadios({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <span className={styles.radioGroup}>
      <label>
        <input
          type="radio"
          name={name}
          checked={value}
          onChange={() => onChange(true)}
        />{" "}
        사용
      </label>
      <label>
        <input
          type="radio"
          name={name}
          checked={!value}
          onChange={() => onChange(false)}
        />{" "}
        사용안함
      </label>
    </span>
  );
}

function FieldError({ value }: { value?: string }) {
  return value ? (
    <span className={styles.fieldError} role="alert">
      {value}
    </span>
  ) : null;
}

function StatusMessage({
  message,
  failed,
}: {
  message: string;
  failed: boolean;
}) {
  return message ? (
    <p
      className={`${styles.statusMessage} ${
        failed ? styles.statusError : styles.statusSuccess
      }`}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}

function integerValue(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function couponAmountLabel(coupon: AdminCouponRecord): string {
  return coupon.type === "percent"
    ? `${coupon.amount.toLocaleString("ko-KR")}%`
    : `${coupon.amount.toLocaleString("ko-KR")}원`;
}

function periodLabel(startsAt: string, endsAt: string): string {
  if (!startsAt && !endsAt) return "제한 없음";
  return `${startsAt || "시작 제한 없음"} ~ ${endsAt || "종료 제한 없음"}`;
}
