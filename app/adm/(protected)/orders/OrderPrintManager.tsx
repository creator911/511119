"use client";

import type { FormEvent } from "react";

const legacyStatuses = [
  "주문",
  "입금",
  "준비",
  "배송",
  "완료",
  "취소",
  "반품",
  "품절",
] as const;

export function OrderPrintManager({ today }: { today: string }) {
  function openOutput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string") params.append(key, value);
    }
    const url = `/api/admin/orders/print?${params.toString()}`;
    const fileFormat = params.get("csv");

    if (fileFormat === "xls" || fileFormat === "csv") {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }

    const popup = window.open(
      url,
      "winprint",
      "left=10,top=10,width=670,height=800,menubar=yes,toolbar=yes,scrollbars=yes",
    );
    if (!popup) {
      window.alert(
        "출력 창이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.",
      );
    }
  }

  return (
    <div className="legacy-order-print-config">
      <div className="local_sch03 local_sch">
        <div>
          <form
            name="forderprint"
            action="/api/admin/orders/print"
            method="get"
            autoComplete="off"
            onSubmit={openOutput}
          >
            <input type="hidden" name="case" value="1" />
            <strong className="sch_long">기간별 출력</strong>

            <input type="radio" name="csv" value="xls" id="xls1" />
            <label htmlFor="xls1">MS엑셀 XLS 데이터</label>
            <input type="radio" name="csv" value="csv" id="csv1" />
            <label htmlFor="csv1">MS엑셀 CSV 데이터</label>

            <label htmlFor="ct_status_p" className="sound_only">
              출력대상
            </label>
            <select name="ct_status" id="ct_status_p" defaultValue="주문">
              <LegacyStatusOptions />
            </select>

            <label htmlFor="fr_date" className="sound_only">
              기간 시작일
            </label>
            <input
              type="text"
              name="fr_date"
              defaultValue={today}
              id="fr_date"
              required
              className="required frm_input"
              size={10}
              maxLength={8}
              pattern="\d{8}"
              inputMode="numeric"
              title="YYYYMMDD 형식으로 입력해 주세요."
            />
            <span aria-hidden="true"> ~ </span>
            <label htmlFor="to_date" className="sound_only">
              기간 종료일
            </label>
            <input
              type="text"
              name="to_date"
              defaultValue={today}
              id="to_date"
              required
              className="required frm_input"
              size={10}
              maxLength={8}
              pattern="\d{8}"
              inputMode="numeric"
              title="YYYYMMDD 형식으로 입력해 주세요."
            />
            <input type="submit" value="출력 (새창)" className="btn_submit" />
          </form>
        </div>

        <div className="sch_last">
          <form
            name="forderprint"
            action="/api/admin/orders/print"
            method="get"
            autoComplete="off"
            onSubmit={openOutput}
          >
            <input type="hidden" name="case" value="2" />
            <strong className="sch_long">주문번호구간별 출력</strong>

            <input type="radio" name="csv" value="xls" id="xls2" />
            <label htmlFor="xls2">MS엑셀 XLS 데이터</label>
            <input type="radio" name="csv" value="csv" id="csv2" />
            <label htmlFor="csv2">MS엑셀 CSV 데이터</label>

            <label htmlFor="ct_status_n" className="sound_only">
              출력대상
            </label>
            <select name="ct_status" id="ct_status_n" defaultValue="주문">
              <LegacyStatusOptions />
            </select>

            <label htmlFor="fr_od_id" className="sound_only">
              주문번호 구간 시작
            </label>
            <input
              type="text"
              name="fr_od_id"
              id="fr_od_id"
              required
              className="required frm_input"
              size={10}
              maxLength={20}
            />
            <span aria-hidden="true"> ~ </span>
            <label htmlFor="to_od_id" className="sound_only">
              주문번호 구간 종료
            </label>
            <input
              type="text"
              name="to_od_id"
              id="to_od_id"
              required
              className="required frm_input"
              size={10}
              maxLength={20}
            />
            <input type="submit" value="출력 (새창)" className="btn_submit" />
          </form>
        </div>
      </div>

      <div className="btn_fixed_top">
        <a href="/adm/orders" className="btn_01 btn">
          주문내역
        </a>
      </div>

      <div className="local_desc01 local_desc">
        <p>
          기간별 혹은 주문번호구간별 주문내역을 새창으로 출력할 수
          있습니다.
        </p>
      </div>
    </div>
  );
}

function LegacyStatusOptions() {
  return (
    <>
      {legacyStatuses.map((status) => (
        <option value={status} key={status}>
          {status}
        </option>
      ))}
      <option value="">전체</option>
    </>
  );
}
