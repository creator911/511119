"use client";

import { useRef, useState } from "react";
import {
  AdminButton,
  AdminPanel,
  ConfirmDialog,
  Notice,
} from "@/app/components/admin";
import styles from "./product-bulk.module.css";

interface ProductBulkIssue {
  row: number;
  field: string;
  message: string;
}

interface ProductBulkPreview {
  row: number;
  id: string;
  categoryId: string;
  name: string;
  price: number;
  stock: number;
}

interface DryRunPayload {
  ok?: boolean;
  valid?: boolean;
  rowCount?: number;
  token?: string;
  issues?: ProductBulkIssue[];
  preview?: ProductBulkPreview[];
  message?: string;
}

interface CommitPayload {
  ok?: boolean;
  imported?: number;
  message?: string;
}

export function ProductBulkManager({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [dryRun, setDryRun] = useState<DryRunPayload | null>(null);
  const [busy, setBusy] = useState<"download" | "dry-run" | "commit" | "">(
    "",
  );
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function selectFile(file: File | undefined) {
    setError("");
    setDryRun(null);
    setCsv("");
    setFileName("");
    if (!file) return;
    if (file.size > 550_000) {
      setError("CSV 파일은 550,000바이트 이하여야 합니다.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
    } catch {
      setError("CSV 파일을 읽지 못했습니다.");
    }
  }

  async function downloadCsv() {
    if (busy) return;
    setBusy("download");
    setError("");
    try {
      const response = await fetch("/api/admin/products/bulk", {
        cache: "no-store",
        headers: { Accept: "text/csv" },
      });
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error("상품 CSV를 내려받지 못했습니다.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "kiel-products.csv";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "상품 CSV를 내려받지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }

  async function validateCsv() {
    if (!csv || busy) return;
    setBusy("dry-run");
    setError("");
    setDryRun(null);
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "dry-run", csv }),
      });
      const payload = (await response.json().catch(() => null)) as
        | DryRunPayload
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "CSV를 검증하지 못했습니다.");
      }
      setDryRun(payload);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "CSV를 검증하지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }

  async function commitCsv() {
    if (!csv || !dryRun?.valid || !dryRun.token || busy) return;
    setBusy("commit");
    setError("");
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "commit",
          csv,
          token: dryRun.token,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | CommitPayload
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "상품을 일괄 등록하지 못했습니다.");
      }
      await onImported();
      setCsv("");
      setFileName("");
      setDryRun(null);
      setConfirmOpen(false);
      if (fileInput.current) fileInput.current.value = "";
      setError(
        `${Number(payload.imported ?? 0).toLocaleString("ko-KR")}개 상품을 일괄 등록했습니다.`,
      );
    } catch (cause) {
      setConfirmOpen(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "상품을 일괄 등록하지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <AdminPanel
        title="CSV 일괄등록"
        subtitle="내보낸 CSV 형식을 참고해 신규 상품 행 작성 → dry-run 검증 → 최종 등록 순서로 진행합니다."
        action={
          <AdminButton
            onClick={() => void downloadCsv()}
            loading={busy === "download"}
            disabled={Boolean(busy)}
          >
            CSV 내보내기
          </AdminButton>
        }
      >
        <div className={styles.stack}>
          <Notice>
            신규 상품만 최대 200개까지 등록합니다. 상품코드 중복, 필수값,
            가격·재고, 분류, 로컬 이미지 주소와 상세 HTML을 모두 검증하며
            한 행이라도 실패하면 아무 상품도 저장하지 않습니다.
          </Notice>
          {error ? (
            <Notice tone={error.includes("등록했습니다") ? "info" : "danger"}>
              {error}
            </Notice>
          ) : null}
          <div className={styles.fileRow}>
            <label className={styles.fileLabel}>
              <span>CSV 파일</span>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                disabled={Boolean(busy)}
                onChange={(event) =>
                  void selectFile(event.currentTarget.files?.[0])
                }
              />
            </label>
            <span className={styles.fileName}>
              {fileName || "선택된 파일이 없습니다."}
            </span>
            <AdminButton
              variant="primary"
              onClick={() => void validateCsv()}
              loading={busy === "dry-run"}
              disabled={!csv || Boolean(busy)}
            >
              dry-run 검증
            </AdminButton>
          </div>

          {dryRun ? (
            <section
              className={
                dryRun.valid ? styles.validationOk : styles.validationError
              }
              aria-live="polite"
            >
              <div className={styles.validationHeader}>
                <div>
                  <strong>
                    {dryRun.valid ? "검증 통과" : "검증 실패"}
                  </strong>
                  <span>
                    상품 {Number(dryRun.rowCount ?? 0).toLocaleString("ko-KR")}개
                  </span>
                </div>
                <AdminButton
                  variant="primary"
                  disabled={!dryRun.valid || Boolean(busy)}
                  onClick={() => setConfirmOpen(true)}
                >
                  검증된 상품 등록
                </AdminButton>
              </div>
              {dryRun.issues?.length ? (
                <div className={styles.tableScroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>행</th>
                        <th>항목</th>
                        <th>오류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.issues.map((issue, index) => (
                        <tr key={`${issue.row}-${issue.field}-${index}`}>
                          <td>{issue.row}</td>
                          <td>{issue.field}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {dryRun.valid && dryRun.preview?.length ? (
                <div className={styles.tableScroll}>
                  <table>
                    <caption>등록 미리보기(최대 20개)</caption>
                    <thead>
                      <tr>
                        <th>행</th>
                        <th>상품코드</th>
                        <th>분류</th>
                        <th>상품명</th>
                        <th>판매가</th>
                        <th>재고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.preview.map((product) => (
                        <tr key={product.id}>
                          <td>{product.row}</td>
                          <td>{product.id}</td>
                          <td>{product.categoryId}</td>
                          <td>{product.name}</td>
                          <td>{product.price.toLocaleString("ko-KR")}원</td>
                          <td>{product.stock.toLocaleString("ko-KR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </AdminPanel>

      <ConfirmDialog
        open={confirmOpen}
        title="상품 일괄등록"
        message={`dry-run을 통과한 ${Number(
          dryRun?.rowCount ?? 0,
        ).toLocaleString("ko-KR")}개 상품을 등록하시겠습니까?`}
        warning="등록 도중 한 건이라도 충돌하면 전체 작업이 취소됩니다."
        confirmLabel="전체 등록"
        busy={busy === "commit"}
        onConfirm={() => void commitCsv()}
        onClose={() => {
          if (busy !== "commit") setConfirmOpen(false);
        }}
      />
    </>
  );
}
