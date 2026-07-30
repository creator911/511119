"use client";

import { FormEvent } from "react";
import styles from "./RecommendationForm.module.css";

interface RecommendationFormProps {
  productId: string;
  productName: string;
  productHref: string;
}

export function RecommendationForm({
  productId,
  productName,
  productHref,
}: RecommendationFormProps) {
  function closePopup() {
    window.close();
  }

  function submitRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const recipientEmail = String(data.get("to_email") ?? "").trim();
    const subject = String(data.get("subject") ?? "").trim();
    const message = String(data.get("content") ?? "").trim();
    const productUrl = new URL(productHref, window.location.origin).toString();
    const body = [
      message,
      "",
      `추천 상품: ${productName}`,
      `상품 보기: ${productUrl}`,
    ].join("\n");
    const mailto = new URL(`mailto:${recipientEmail}`);
    mailto.searchParams.set("subject", subject);
    mailto.searchParams.set("body", body);
    window.location.assign(mailto.toString());
  }

  return (
    <main className={styles.popup}>
      <h1 className={styles.title}>
        {productName} 요약정보 및 구매 - 추천하기
        <button
          type="button"
          className={styles.titleClose}
          onClick={closePopup}
          aria-label="닫기"
        />
      </h1>

      <form
        className={styles.form}
        method="post"
        autoComplete="off"
        onSubmit={submitRecommendation}
      >
        <input type="hidden" name="it_id" value={productId} />

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="to_email">
            추천받는 분 E-mail
            <span className={styles.visuallyHidden}> 필수</span>
          </label>
          <label className={styles.requiredMark}>
            <input
              className={styles.input}
              id="to_email"
              type="email"
              name="to_email"
              required
              maxLength={254}
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="subject">
            제목
            <span className={styles.visuallyHidden}> 필수</span>
          </label>
          <label className={styles.requiredMark}>
            <input
              className={styles.input}
              id="subject"
              type="text"
              name="subject"
              required
              maxLength={120}
            />
          </label>
        </div>

        <div className={`${styles.fieldGroup} ${styles.messageField}`}>
          <label className={styles.label} htmlFor="content">
            내용
            <span className={styles.visuallyHidden}> 필수</span>
          </label>
          <label className={styles.requiredMark}>
            <textarea
              className={styles.textarea}
              id="content"
              name="content"
              required
              rows={3}
              maxLength={1000}
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.sendButton}>
            보내기
          </button>{" "}
          <button
            type="button"
            className={styles.closeButton}
            onClick={closePopup}
          >
            닫기
          </button>
        </div>
      </form>
    </main>
  );
}
