"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./Storefront.module.css";
import { PageHeading } from "./StorefrontPrimitives";
import { classNames } from "./utils";
import { openPostcodeSearch } from "@/app/components/daum-postcode";
import {
  PASSWORD_STRENGTH_LABELS,
  scorePasswordStrength,
} from "@/lib/password-strength";

export interface LoginPayload {
  userId: string;
  password: string;
  remember: boolean;
}

export interface LoginPanelProps {
  brandName?: string;
  registerHref?: string;
  recoverHref?: string;
  homeHref?: string;
  errorMessage?: string;
  submitting?: boolean;
  onSubmit?: (payload: LoginPayload) => void;
}

export function LoginPanel({
  brandName = "골드리안(GOLDRIAN)",
  registerHref = "/bbs/register.php",
  recoverHref = "/bbs/password_lost.php",
  homeHref = "/shop",
  errorMessage,
  submitting = false,
  onSubmit,
}: LoginPanelProps) {
  const [showPassword, setShowPassword] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit?.({
      userId: String(form.get("userId") ?? ""),
      password: String(form.get("password") ?? ""),
      remember: form.get("remember") === "on",
    });
  }

  return (
    <main id="main-content" className={styles.authPage}>
      <section className={styles.loginPanel} aria-labelledby="login-heading">
        <header>
          <span>{brandName}</span>
          <h1 id="login-heading">로그인</h1>
        </header>
        <form onSubmit={submit} aria-busy={submitting}>
          {errorMessage ? (
            <p className={styles.formError} role="alert">
              {errorMessage}
            </p>
          ) : null}
          <label className={styles.floatingField}>
            <span>아이디</span>
            <input
              type="text"
              name="userId"
              autoComplete="username"
              required
              placeholder="아이디"
            />
          </label>
          <label className={styles.floatingField}>
            <span>비밀번호</span>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              placeholder="비밀번호"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((current) => !current)}
              disabled={submitting}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            >
              {showPassword ? "숨김" : "보기"}
            </button>
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" name="remember" />
            <span>자동로그인</span>
          </label>
          <button
            type="submit"
            className={styles.primaryFormButton}
            disabled={submitting}
          >
            {submitting ? "로그인 중" : "로그인"}
          </button>
        </form>
        <nav className={styles.authLinks} aria-label="회원 안내">
          <a href={registerHref}>회원가입</a>
          <a href={recoverHref}>아이디/비밀번호찾기</a>
        </nav>
        <a className={styles.backHomeLink} href={homeHref}>
          ← 메인으로 돌아가기
        </a>
      </section>
    </main>
  );
}

export interface RegisterPayload {
  userId: string;
  password: string;
  name: string;
  nickname: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  email: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
  publicProfile: boolean;
}

export interface RegisterPanelProps {
  termsContent: ReactNode;
  privacyContent: ReactNode;
  loginHref?: string;
  submitting?: boolean;
  onSubmit?: (payload: RegisterPayload) => void;
  onPostcodeSearch?: () => void;
}

export function RegisterPanel({
  termsContent,
  privacyContent,
  loginHref = "/bbs/login.php",
  submitting = false,
  onSubmit,
  onPostcodeSearch,
}: RegisterPanelProps) {
  const [step, setStep] = useState<"agreements" | "information">(
    "agreements",
  );
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
  });
  const [emailOptIn, setEmailOptIn] = useState(true);
  const [publicProfile, setPublicProfile] = useState(true);
  const [passwordValue, setPasswordValue] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [passwordStrengthError, setPasswordStrengthError] = useState(false);
  const [agreementError, setAgreementError] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityChecks, setAvailabilityChecks] = useState({
    userId: "",
    nickname: "",
    email: "",
  });
  const [availabilityPending, setAvailabilityPending] = useState({
    userId: false,
    nickname: false,
    email: false,
  });
  const formRef = useRef<HTMLFormElement>(null);

  const allChecked = agreements.terms && agreements.privacy;
  const currentYear = new Date().getFullYear();
  const birthDayCount =
    birthYear && birthMonth
      ? new Date(Number(birthYear), Number(birthMonth), 0).getDate()
      : 31;
  const passwordStrength = passwordValue
    ? scorePasswordStrength(passwordValue)
    : null;
  const passwordStrengthClasses = [
    styles.passwordStrength0,
    styles.passwordStrength1,
    styles.passwordStrength2,
    styles.passwordStrength3,
    styles.passwordStrength4,
  ];

  function toggleAll(checked: boolean) {
    setAgreements({ terms: checked, privacy: checked });
    if (checked) setAgreementError("");
  }

  function continueToInformation() {
    if (!agreements.terms || !agreements.privacy) {
      setAgreementError("회원가입약관과 개인정보처리방침에 동의해 주세요.");
      return;
    }
    setAgreementError("");
    setStep("information");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function checkAvailability(
    field: "userId" | "nickname" | "email",
  ) {
    const element = formRef.current?.elements.namedItem(field);
    if (!(element instanceof HTMLInputElement)) return;
    const rawValue = element.value.trim();
    const value = field === "email" ? rawValue.toLowerCase() : rawValue;
    if (!value) {
      setAvailabilityMessage("확인할 내용을 먼저 입력해 주세요.");
      return;
    }
    setAvailabilityChecks((current) => ({ ...current, [field]: "" }));
    setAvailabilityPending((current) => ({ ...current, [field]: true }));
    setAvailabilityMessage("중복 여부를 확인하고 있습니다.");
    try {
      const response = await fetch(
        `/api/customer/register?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        available?: boolean;
        error?: string;
      };
      if (!response.ok || !result.available) {
        setAvailabilityChecks((current) => ({ ...current, [field]: "" }));
        setAvailabilityMessage(
          result.error ?? "이미 사용 중인 정보입니다.",
        );
        return;
      }
      const currentElement = formRef.current?.elements.namedItem(field);
      const currentRawValue =
        currentElement instanceof HTMLInputElement
          ? currentElement.value.trim()
          : "";
      const currentValue =
        field === "email" ? currentRawValue.toLowerCase() : currentRawValue;
      if (currentValue !== value) {
        setAvailabilityMessage("입력값이 변경되었습니다. 다시 중복확인해 주세요.");
        return;
      }
      setAvailabilityChecks((current) => ({ ...current, [field]: value }));
      setAvailabilityMessage("사용 가능한 정보입니다.");
    } catch {
      setAvailabilityChecks((current) => ({ ...current, [field]: "" }));
      setAvailabilityMessage("중복 여부를 확인하지 못했습니다.");
    } finally {
      setAvailabilityPending((current) => ({ ...current, [field]: false }));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (scorePasswordStrength(password) < 2) {
      setPasswordStrengthError(true);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    const userId = String(form.get("userId") ?? "").trim();
    const nickname = String(form.get("nickname") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (
      availabilityChecks.userId !== userId ||
      availabilityChecks.nickname !== nickname ||
      availabilityChecks.email !== email
    ) {
      setAvailabilityMessage(
        "아이디·닉네임·이메일 중복체크를 모두 완료해 주세요.",
      );
      return;
    }
    setPasswordMismatch(false);
    setPasswordStrengthError(false);
    onSubmit?.({
      userId,
      password,
      name: String(form.get("name") ?? ""),
      nickname,
      birthYear: String(form.get("birthYear") ?? ""),
      birthMonth: String(form.get("birthMonth") ?? ""),
      birthDay: String(form.get("birthDay") ?? ""),
      email,
      phone: String(form.get("phone") ?? ""),
      postcode: String(form.get("postcode") ?? ""),
      address1: String(form.get("address1") ?? ""),
      address2: String(form.get("address2") ?? ""),
      agreeTerms: agreements.terms,
      agreePrivacy: agreements.privacy,
      agreeMarketing: emailOptIn,
      publicProfile,
    });
  }

  return (
    <>
      <PageHeading
        title={step === "agreements" ? "약관동의" : "정보입력"}
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "회원가입", href: "/bbs/register.php" },
          { label: step === "agreements" ? "약관동의" : "정보입력" },
        ]}
      />
      <main id="main-content" className={styles.legacyRegisterPage}>
        <div className={styles.container}>
        <form
          ref={formRef}
          className={styles.legacyRegisterForm}
          onSubmit={submit}
          aria-busy={submitting}
        >
          {step === "agreements" ? (
            <>
              <section className={styles.legacyAgreementSection}>
                <h2>회원가입약관</h2>
                <div className={styles.legacyAgreementContent}>
                  {termsContent}
                </div>
                <label className={styles.legacyAgreementCheck}>
                  <input
                    type="checkbox"
                    checked={agreements.terms}
                    onChange={(event) =>
                      setAgreements((current) => ({
                        ...current,
                        terms: event.target.checked,
                      }))
                    }
                  />
                  <span>회원가입약관의 내용에 동의합니다.</span>
                </label>
              </section>

              <section className={styles.legacyAgreementSection}>
                <h2>개인정보처리방침안내</h2>
                <div className={styles.legacyAgreementContent}>
                  {privacyContent}
                </div>
                <label className={styles.legacyAgreementCheck}>
                  <input
                    type="checkbox"
                    checked={agreements.privacy}
                    onChange={(event) =>
                      setAgreements((current) => ({
                        ...current,
                        privacy: event.target.checked,
                      }))
                    }
                  />
                  <span>개인정보처리방침안내의 내용에 동의합니다.</span>
                </label>
              </section>

              <div className={styles.legacyAgreementActions}>
                <label>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(event) => toggleAll(event.target.checked)}
                  />
                  <span>전체 약관에 동의합니다.</span>
                </label>
                {agreementError ? (
                  <p className={styles.fieldError} role="alert">
                    {agreementError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={styles.legacyJoinButton}
                  onClick={continueToInformation}
                >
                  회원가입
                </button>
              </div>
            </>
          ) : (
            <>
              <section className={styles.legacyInfoSection}>
                <h2>사이트 이용정보 입력</h2>
                <div className={styles.fieldTable}>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyHalfOwnRow,
                  styles.legacyAccountIdRow,
                )}
              >
                <span>
                  아이디 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.inlineField,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf007"}
                    </i>
                    <input
                      name="userId"
                      type="text"
                      minLength={4}
                      autoComplete="username"
                      required
                      onChange={() =>
                        setAvailabilityChecks((current) => ({
                          ...current,
                          userId: "",
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={classNames(
                        styles.legacyCheckButton,
                        availabilityChecks.userId &&
                          styles.legacyCheckButtonVerified,
                      )}
                      onClick={() => void checkAvailability("userId")}
                      disabled={
                        availabilityPending.userId ||
                        Boolean(availabilityChecks.userId)
                      }
                      aria-pressed={Boolean(availabilityChecks.userId)}
                    >
                      {availabilityPending.userId
                        ? "확인 중"
                        : availabilityChecks.userId
                          ? "확인완료"
                          : "중복확인"}
                    </button>
                  </div>
                  <small>
                    <strong>Note:</strong> 아이디 입력 후 중복체크 필수
                  </small>
                </div>
              </label>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyPasswordRow,
                )}
              >
                <span>
                  비밀번호 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.legacyInputFrame,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf023"}
                    </i>
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      maxLength={20}
                      autoComplete="new-password"
                      required
                      value={passwordValue}
                      onChange={(event) => {
                        setPasswordValue(event.target.value);
                        setPasswordStrengthError(false);
                      }}
                    />
                  </div>
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  비밀번호 확인 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.legacyInputFrame,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf023"}
                    </i>
                    <input
                      name="confirmPassword"
                      type="password"
                      minLength={8}
                      maxLength={20}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {passwordMismatch ? (
                    <small className={styles.fieldError} role="alert">
                      비밀번호가 일치하지 않습니다.
                    </small>
                  ) : null}
                </div>
              </label>
              {passwordStrength !== null ? (
                <div
                  className={classNames(
                    styles.passwordStrengthMeter,
                    passwordStrengthClasses[passwordStrength],
                  )}
                  aria-live="polite"
                >
                  <div className={styles.passwordStrengthHeading}>
                    <span>보안강도체크</span>
                    <strong>
                      {PASSWORD_STRENGTH_LABELS[passwordStrength]}
                    </strong>
                  </div>
                  <div className={styles.passwordStrengthTrack}>
                    <span />
                  </div>
                  <p>
                    <strong>Note:</strong> 보안강도는 <em>보통</em> 이상이어야
                    합니다.
                  </p>
                  {passwordStrengthError ? (
                    <small className={styles.fieldError} role="alert">
                      비밀번호의 강도는 보통 이상이어야 합니다.
                    </small>
                  ) : null}
                </div>
              ) : null}
                </div>
              </section>

              <section className={styles.legacyInfoSection}>
                <h2>개인정보 입력</h2>
                <div className={styles.fieldTable}>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyHalfOwnRow,
                  styles.legacyNameRow,
                )}
              >
                <span>
                  이름 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.legacyInputFrame,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf007"}
                    </i>
                    <input
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>
              </label>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyHalfOwnRow,
                )}
              >
                <span>
                  닉네임 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.inlineField,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf118"}
                    </i>
                    <input
                      name="nickname"
                      type="text"
                      minLength={2}
                      required
                      onChange={() =>
                        setAvailabilityChecks((current) => ({
                          ...current,
                          nickname: "",
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={classNames(
                        styles.legacyCheckButton,
                        availabilityChecks.nickname &&
                          styles.legacyCheckButtonVerified,
                      )}
                      onClick={() => void checkAvailability("nickname")}
                      disabled={
                        availabilityPending.nickname ||
                        Boolean(availabilityChecks.nickname)
                      }
                      aria-pressed={Boolean(availabilityChecks.nickname)}
                    >
                      {availabilityPending.nickname
                        ? "확인 중"
                        : availabilityChecks.nickname
                          ? "확인완료"
                          : "중복확인"}
                    </button>
                  </div>
                  <small>
                    <strong>Note:</strong> 닉네임 입력 후 중복체크 필수
                  </small>
                </div>
              </label>
              <div className={styles.legacyNicknameNotice}>
                공백없이 한글,영문,숫자만 입력 가능 (한글2자, 영문4자 이상) |
                닉네임을 바꾸시면 앞으로 60일 이내에는 변경 할 수 없습니다.
              </div>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyHalfOwnRow,
                  styles.legacyBirthRow,
                )}
              >
                <span>
                  생년월일 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.legacyInputFrame,
                      styles.legacyBirthInput,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf073"}
                    </i>
                    <select
                      name="birthYear"
                      required
                      value={birthYear}
                      aria-label="생년"
                      onChange={(event) => {
                        const nextYear = event.target.value;
                        setBirthYear(nextYear);
                        if (
                          birthDay &&
                          birthMonth &&
                          Number(birthDay) >
                            new Date(
                              Number(nextYear),
                              Number(birthMonth),
                              0,
                            ).getDate()
                        ) {
                          setBirthDay("");
                        }
                      }}
                    >
                      <option value="">년</option>
                      {Array.from(
                        { length: currentYear - 1959 },
                        (_, index) => 1960 + index,
                      ).map((year) => (
                        <option value={year} key={year}>
                          {year}년
                        </option>
                      ))}
                    </select>
                    <select
                      name="birthMonth"
                      required
                      value={birthMonth}
                      aria-label="생월"
                      onChange={(event) => {
                        const nextMonth = event.target.value;
                        setBirthMonth(nextMonth);
                        if (
                          birthDay &&
                          birthYear &&
                          Number(birthDay) >
                            new Date(
                              Number(birthYear),
                              Number(nextMonth),
                              0,
                            ).getDate()
                        ) {
                          setBirthDay("");
                        }
                      }}
                    >
                      <option value="">월</option>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map(
                        (month) => (
                          <option
                            value={String(month).padStart(2, "0")}
                            key={month}
                          >
                            {month}월
                          </option>
                        ),
                      )}
                    </select>
                    <select
                      name="birthDay"
                      required
                      value={birthDay}
                      aria-label="생일"
                      onChange={(event) => setBirthDay(event.target.value)}
                    >
                      <option value="">일</option>
                      {Array.from(
                        { length: birthDayCount },
                        (_, index) => index + 1,
                      ).map((day) => (
                        <option
                          value={String(day).padStart(2, "0")}
                          key={day}
                        >
                          {day}일
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </label>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyHalfOwnRow,
                  styles.legacyEmailRow,
                )}
              >
                <span>
                  이메일 <em>*</em>
                </span>
                <div>
                  <div
                    className={classNames(
                      styles.inlineField,
                      styles.legacyRequiredInput,
                    )}
                  >
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf0e0"}
                    </i>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      onChange={() =>
                        setAvailabilityChecks((current) => ({
                          ...current,
                          email: "",
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={classNames(
                        styles.legacyCheckButton,
                        availabilityChecks.email &&
                          styles.legacyCheckButtonVerified,
                      )}
                      onClick={() => void checkAvailability("email")}
                      disabled={
                        availabilityPending.email ||
                        Boolean(availabilityChecks.email)
                      }
                      aria-pressed={Boolean(availabilityChecks.email)}
                    >
                      {availabilityPending.email
                        ? "확인 중"
                        : availabilityChecks.email
                          ? "확인완료"
                          : "중복확인"}
                    </button>
                  </div>
                  <small>
                    <strong>Note:</strong> 이메일 입력 후 중복체크 필수
                  </small>
                </div>
              </label>
              <label
                className={classNames(
                  styles.formRow,
                  styles.legacyThirdOwnRow,
                  styles.legacyPhoneRow,
                )}
              >
                <span>전화번호</span>
                <div>
                  <div className={styles.legacyInputFrame}>
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf095"}
                    </i>
                    <input
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </label>
              <div className={classNames(styles.formRow, styles.addressRow)}>
                <span>주소</span>
                <div>
                  <div className={styles.inlineField}>
                    <i
                      className={styles.legacyInputIcon}
                      aria-hidden="true"
                    >
                      {"\uf3c5"}
                    </i>
                    <input
                      name="postcode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="우편번호"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        if (onPostcodeSearch) {
                          onPostcodeSearch();
                          return;
                        }
                        void openPostcodeSearch(({ postcode, address }) => {
                          const form = formRef.current;
                          const postcodeInput =
                            form?.elements.namedItem("postcode");
                          const addressInput =
                            form?.elements.namedItem("address1");
                          const detailAddressInput =
                            form?.elements.namedItem("address2");
                          if (postcodeInput instanceof HTMLInputElement) {
                            postcodeInput.value = postcode;
                          }
                          if (addressInput instanceof HTMLInputElement) {
                            addressInput.value = address;
                          }
                          if (
                            detailAddressInput instanceof HTMLInputElement
                          ) {
                            detailAddressInput.focus();
                          }
                        }).catch(() => {
                          window.alert("주소검색 서비스를 불러오지 못했습니다.");
                        });
                      }}
                    >
                      주소검색
                    </button>
                  </div>
                  <input
                    name="address1"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="기본주소"
                  />
                  <input
                    name="address2"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="상세주소"
                  />
                  <input
                    name="address3"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="참고항목"
                  />
                </div>
              </div>
            </div>
              </section>

              <section className={styles.legacyInfoSection}>
                <h2>기타 개인설정</h2>
                <div className={styles.legacyPreferenceRows}>
                  <label>
                    <span>메일링서비스</span>
                    <input
                      type="checkbox"
                      checked={emailOptIn}
                      onChange={(event) =>
                        setEmailOptIn(event.target.checked)
                      }
                    />
                    <strong>정보 메일을 받겠습니다.</strong>
                  </label>
                  <label>
                    <span>정보공개</span>
                    <input
                      type="checkbox"
                      checked={publicProfile}
                      onChange={(event) =>
                        setPublicProfile(event.target.checked)
                      }
                    />
                    <strong>다른분들이 나의 정보를 볼 수 있도록 합니다.</strong>
                  </label>
                </div>
              </section>

              {availabilityMessage ? (
                <p className={styles.legacyAvailabilityMessage} role="status">
                  {availabilityMessage}
                </p>
              ) : null}
              <div className={styles.formActions}>
                <a href={loginHref} className={styles.secondaryFormButton}>
                  취소
                </a>
                <button
                  type="submit"
                  className={styles.primaryFormButton}
                  disabled={submitting}
                >
                  {submitting ? "가입 처리 중" : "회원가입"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </main>
    </>
  );
}
