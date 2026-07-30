"use client";

import { useState, type FormEvent } from "react";
import {
  AdminButton,
  AdminInput,
  AdminPanel,
  FormRow,
  FormSection,
  Notice,
} from "@/app/components/admin";
import type { SiteDisplaySettings } from "@/lib/site-content";
import styles from "./settings-editor.module.css";

type FieldErrors = Partial<Record<keyof SiteDisplaySettings, string>>;

interface SettingsEditorProps {
  initialSettings: SiteDisplaySettings;
  mode?: "business" | "shop";
}

export function SettingsEditor({
  initialSettings,
  mode = "business",
}: SettingsEditorProps) {
  const [settings, setSettings] = useState({
    ...initialSettings,
    paymentCardEnabled: false,
    paymentTransferEnabled: false,
    paymentVirtualEnabled: false,
    paymentMobileEnabled: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function change<K extends keyof SiteDisplaySettings>(
    field: K,
    value: SiteDisplaySettings[K],
  ) {
    setSettings((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setErrors({});
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = (await response.json()) as {
        message?: string;
        fieldErrors?: FieldErrors;
        settings?: SiteDisplaySettings;
      };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.settings) {
        setErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(result.message ?? "설정을 저장하지 못했습니다.");
        return;
      }
      setSettings(result.settings);
      setMessage(
        mode === "business"
          ? "사업자 표시 정보를 저장했습니다."
          : "판매·배송 설정을 저장했습니다.",
      );
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <div className="btn_fixed_top">
        <AdminButton type="submit" variant="primary" loading={saving}>
          확인
        </AdminButton>
      </div>
      {mode === "shop" ? (
        <Notice>
          무통장 입금 안내와 배송 운영에 사용하는 정보입니다. 실제 운영
          계좌를 확인한 뒤 저장해 주세요.
        </Notice>
      ) : null}
      {mode === "business" ? (
        <FormSection
          title="사업자 기본 정보"
          description="고객에게 공개되는 쇼핑몰 운영자 표시 정보입니다."
        >
          <FormRow
            label="상호"
            required
            htmlFor="settings-company-name"
            error={errors.companyName}
          >
            <AdminInput
              id="settings-company-name"
              value={settings.companyName}
              maxLength={120}
              invalid={Boolean(errors.companyName)}
              onChange={(event) =>
                change("companyName", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="대표자"
            required
            htmlFor="settings-representative"
            error={errors.representative}
          >
            <AdminInput
              id="settings-representative"
              value={settings.representative}
              maxLength={80}
              invalid={Boolean(errors.representative)}
              onChange={(event) =>
                change("representative", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="사업자등록번호"
            htmlFor="settings-business-number"
            error={errors.businessNumber}
          >
            <AdminInput
              id="settings-business-number"
              value={settings.businessNumber}
              maxLength={40}
              invalid={Boolean(errors.businessNumber)}
              onChange={(event) =>
                change("businessNumber", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="통신판매업 신고"
            htmlFor="settings-mail-order-number"
            error={errors.mailOrderNumber}
          >
            <AdminInput
              id="settings-mail-order-number"
              value={settings.mailOrderNumber}
              maxLength={80}
              invalid={Boolean(errors.mailOrderNumber)}
              onChange={(event) =>
                change("mailOrderNumber", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="사업장 주소"
            required
            htmlFor="settings-address"
            error={errors.address}
          >
            <AdminInput
              id="settings-address"
              value={settings.address}
              maxLength={300}
              invalid={Boolean(errors.address)}
              onChange={(event) => change("address", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow
            label="대표 이메일"
            required
            htmlFor="settings-email"
            error={errors.email}
          >
            <AdminInput
              id="settings-email"
              type="email"
              value={settings.email}
              maxLength={200}
              invalid={Boolean(errors.email)}
              onChange={(event) => change("email", event.currentTarget.value)}
            />
          </FormRow>
        </FormSection>
      ) : (
        <FormSection
          title="판매·배송 설정"
          description="주문 화면과 주문조회에 표시되는 운영 정보입니다."
        >
          <FormRow
            label="입금 은행"
            htmlFor="settings-bank-name"
            error={errors.bankName}
          >
            <AdminInput
              id="settings-bank-name"
              value={settings.bankName}
              maxLength={80}
              invalid={Boolean(errors.bankName)}
              onChange={(event) => change("bankName", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow
            label="입금 계좌번호"
            htmlFor="settings-bank-account"
            error={errors.bankAccount}
          >
            <AdminInput
              id="settings-bank-account"
              value={settings.bankAccount}
              maxLength={100}
              invalid={Boolean(errors.bankAccount)}
              onChange={(event) =>
                change("bankAccount", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="예금주"
            htmlFor="settings-bank-holder"
            error={errors.bankHolder}
          >
            <AdminInput
              id="settings-bank-holder"
              value={settings.bankHolder}
              maxLength={80}
              invalid={Boolean(errors.bankHolder)}
              onChange={(event) =>
                change("bankHolder", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow label="결제수단" error={
            errors.paymentBankEnabled ??
            errors.paymentCardEnabled ??
            errors.paymentTransferEnabled ??
            errors.paymentVirtualEnabled ??
            errors.paymentMobileEnabled
          }>
            <div className={styles.checkboxGroup} role="group" aria-label="사용할 결제수단">
              {([
                ["paymentBankEnabled", "무통장입금"],
                ["paymentCardEnabled", "신용카드"],
                ["paymentTransferEnabled", "실시간 계좌이체"],
                ["paymentVirtualEnabled", "가상계좌"],
                ["paymentMobileEnabled", "휴대폰결제"],
              ] as const).map(([field, label]) => (
                <label key={field} className={styles.checkboxOption}>
                  <input
                    type="checkbox"
                    checked={
                      field === "paymentBankEnabled" ? settings[field] : false
                    }
                    disabled={field !== "paymentBankEnabled"}
                    title={
                      field === "paymentBankEnabled"
                        ? undefined
                        : "결제대행사 연결 전에는 활성화할 수 없습니다."
                    }
                    onChange={(event) =>
                      change(field, event.currentTarget.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <span className="sound_only">
                결제대행사 연결 전에는 무통장입금만 사용할 수 있습니다.
              </span>
            </div>
          </FormRow>
          <FormRow
            label="포인트 사용"
            help="회원 주문에서 포인트 사용 여부를 설정합니다."
            error={errors.pointUseEnabled}
          >
            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={settings.pointUseEnabled}
                onChange={(event) =>
                  change("pointUseEnabled", event.currentTarget.checked)
                }
              />
              <span>포인트 결제 사용</span>
            </label>
          </FormRow>
          <FormRow
            label="최소 사용 포인트"
            htmlFor="settings-point-minimum"
            help="원본 운영값: 1,000P"
            error={errors.pointUseMinimum}
          >
            <AdminInput
              id="settings-point-minimum"
              type="number"
              min={0}
              max={100_000_000}
              step={1}
              value={settings.pointUseMinimum}
              invalid={Boolean(errors.pointUseMinimum)}
              onChange={(event) =>
                change("pointUseMinimum", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="최대 사용 포인트"
            htmlFor="settings-point-maximum"
            help="원본 운영값: 100,000,000P"
            error={errors.pointUseMaximum}
          >
            <AdminInput
              id="settings-point-maximum"
              type="number"
              min={1}
              max={100_000_000}
              step={1}
              value={settings.pointUseMaximum}
              invalid={Boolean(errors.pointUseMaximum)}
              onChange={(event) =>
                change("pointUseMaximum", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="포인트 사용 단위"
            htmlFor="settings-point-unit"
            help="원본 운영값: 100P 단위"
            error={errors.pointUseUnit}
          >
            <AdminInput
              id="settings-point-unit"
              type="number"
              min={1}
              max={100_000_000}
              step={1}
              value={settings.pointUseUnit}
              invalid={Boolean(errors.pointUseUnit)}
              onChange={(event) =>
                change("pointUseUnit", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="기본 배송비"
            htmlFor="settings-shipping-fee"
            help="0원으로 저장하면 전 상품 무료배송으로 적용됩니다."
            error={errors.defaultShippingFee}
          >
            <AdminInput
              id="settings-shipping-fee"
              type="number"
              min={0}
              max={100_000_000}
              step={100}
              value={settings.defaultShippingFee}
              invalid={Boolean(errors.defaultShippingFee)}
              onChange={(event) =>
                change("defaultShippingFee", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="기본 택배사"
            htmlFor="settings-shipping-carrier"
            error={errors.shippingCarrier}
          >
            <AdminInput
              id="settings-shipping-carrier"
              value={settings.shippingCarrier}
              maxLength={80}
              invalid={Boolean(errors.shippingCarrier)}
              onChange={(event) =>
                change("shippingCarrier", event.currentTarget.value)
              }
            />
          </FormRow>
          <FormRow
            label="고객센터 연락처"
            htmlFor="settings-customer-service-phone"
            error={errors.customerServicePhone}
          >
            <AdminInput
              id="settings-customer-service-phone"
              value={settings.customerServicePhone}
              maxLength={40}
              invalid={Boolean(errors.customerServicePhone)}
              onChange={(event) =>
                change("customerServicePhone", event.currentTarget.value)
              }
            />
          </FormRow>
        </FormSection>
      )}
      <AdminPanel>
        <div className={styles.actions}>
          <p
            className={failed ? styles.errorMessage : styles.successMessage}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
          <AdminButton type="submit" variant="primary" loading={saving}>
            변경사항 저장
          </AdminButton>
        </div>
      </AdminPanel>
    </form>
  );
}
