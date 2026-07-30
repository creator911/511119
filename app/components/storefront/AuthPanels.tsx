"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./Storefront.module.css";
import { Panel } from "./StorefrontPrimitives";
import { classNames } from "./utils";
import { openPostcodeSearch } from "@/app/components/daum-postcode";

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
  brandName = "키엘골드(KIEL-GOLD)",
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
  email: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
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
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const allChecked =
    agreements.terms && agreements.privacy && agreements.marketing;

  function toggleAll(checked: boolean) {
    setAgreements({ terms: checked, privacy: checked, marketing: checked });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    onSubmit?.({
      userId: String(form.get("userId") ?? ""),
      password,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      postcode: String(form.get("postcode") ?? ""),
      address1: String(form.get("address1") ?? ""),
      address2: String(form.get("address2") ?? ""),
      agreeTerms: agreements.terms,
      agreePrivacy: agreements.privacy,
      agreeMarketing: agreements.marketing,
    });
  }

  return (
    <main id="main-content" className={styles.formPage}>
      <div className={styles.container}>
        <header className={styles.formPageHeader}>
          <h1>회원가입</h1>
          <p>키엘골드 회원이 되어 다양한 서비스를 이용해 보세요.</p>
        </header>
        <form
          ref={formRef}
          className={styles.registerForm}
          onSubmit={submit}
          aria-busy={submitting}
        >
          <Panel
            title="약관동의"
            description="필수 약관을 확인한 후 동의해 주세요."
          >
            <label className={styles.agreeAll}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              <span>
                <strong>전체 약관에 동의합니다.</strong>
                <small>선택 동의 항목을 포함합니다.</small>
              </span>
            </label>
            <div className={styles.agreementBlock}>
              <div className={styles.agreementTitle}>
                <strong>회원가입약관</strong>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    required
                    checked={agreements.terms}
                    onChange={(event) =>
                      setAgreements((current) => ({
                        ...current,
                        terms: event.target.checked,
                      }))
                    }
                  />
                  <span>동의합니다. (필수)</span>
                </label>
              </div>
              <div className={styles.agreementScroll}>{termsContent}</div>
            </div>
            <div className={styles.agreementBlock}>
              <div className={styles.agreementTitle}>
                <strong>개인정보처리방침안내</strong>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    required
                    checked={agreements.privacy}
                    onChange={(event) =>
                      setAgreements((current) => ({
                        ...current,
                        privacy: event.target.checked,
                      }))
                    }
                  />
                  <span>동의합니다. (필수)</span>
                </label>
              </div>
              <div className={styles.agreementScroll}>{privacyContent}</div>
            </div>
            <label className={styles.marketingAgreement}>
              <input
                type="checkbox"
                checked={agreements.marketing}
                onChange={(event) =>
                  setAgreements((current) => ({
                    ...current,
                    marketing: event.target.checked,
                  }))
                }
              />
              <span>
                이벤트 및 혜택 알림 수신에 동의합니다. <em>(선택)</em>
              </span>
            </label>
          </Panel>

          <Panel
            title="회원정보 입력"
            description="별표가 표시된 항목은 필수 입력입니다."
          >
            <div className={styles.fieldTable}>
              <label className={styles.formRow}>
                <span>
                  아이디 <em>*</em>
                </span>
                <div>
                  <input
                    name="userId"
                    type="text"
                    minLength={4}
                    autoComplete="username"
                    required
                  />
                  <small>영문자·숫자 조합 4자 이상</small>
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  비밀번호 <em>*</em>
                </span>
                <div>
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                  <small>영문, 숫자, 특수문자를 조합해 8자 이상 입력해 주세요.</small>
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  비밀번호 확인 <em>*</em>
                </span>
                <div>
                  <input
                    name="confirmPassword"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                  {passwordMismatch ? (
                    <small className={styles.fieldError} role="alert">
                      비밀번호가 일치하지 않습니다.
                    </small>
                  ) : null}
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  이름 <em>*</em>
                </span>
                <div>
                  <input name="name" type="text" autoComplete="name" required />
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  이메일 <em>*</em>
                </span>
                <div>
                  <input name="email" type="email" autoComplete="email" required />
                </div>
              </label>
              <label className={styles.formRow}>
                <span>
                  휴대전화 <em>*</em>
                </span>
                <div>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="010-0000-0000"
                  />
                </div>
              </label>
              <div className={classNames(styles.formRow, styles.addressRow)}>
                <span>주소</span>
                <div>
                  <div className={styles.inlineField}>
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
                </div>
              </div>
            </div>
          </Panel>

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
        </form>
      </div>
    </main>
  );
}
