"use client";

import { type FormEvent, useEffect, useState } from "react";
import { openPostcodeSearch } from "@/app/components/daum-postcode";

interface Profile {
  loginId: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
}

const emptyProfile: Profile = {
  loginId: "",
  name: "",
  email: "",
  phone: "",
  postcode: "",
  address1: "",
  address2: "",
  emailOptIn: false,
  smsOptIn: false,
};

export function ProfileClient() {
  const [profile, setProfile] = useState(emptyProfile);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("회원 정보를 불러오는 중입니다.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/customer/profile", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          profile?: Profile;
          error?: string;
        };
        if (response.status === 401) {
          window.location.assign("/bbs/login.php");
          return;
        }
        if (!response.ok || !result.profile) {
          throw new Error(result.error || "회원 정보를 불러오지 못했습니다.");
        }
        setProfile(result.profile);
        setMessage("");
      })
      .catch((cause) =>
        setMessage(
          cause instanceof Error
            ? cause.message
            : "회원 정보를 불러오지 못했습니다.",
        ),
      );
  }, []);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...profile,
          currentPassword,
          newPassword,
        }),
      });
      const result = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };
      if (!response.ok || !result.profile) {
        throw new Error(result.error || "회원 정보를 저장하지 못했습니다.");
      }
      setProfile(result.profile);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("회원 정보를 저장했습니다.");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "회원 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!currentPassword) {
      setMessage("회원 탈퇴를 위해 현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (!window.confirm("회원 계정을 비활성화하시겠습니까?")) return;
    setSaving(true);
    try {
      const response = await fetch("/api/customer/profile", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: currentPassword }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "회원 탈퇴를 처리하지 못했습니다.");
      }
      window.location.assign("/");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "회원 탈퇴를 처리하지 못했습니다.",
      );
      setSaving(false);
    }
  }

  return (
    <main id="main-content" className="simple-form-page">
      <h1>회원정보 수정</h1>
      <form className="plain-form" onSubmit={save}>
        <label>
          <span>아이디</span>
          <input value={profile.loginId} readOnly />
        </label>
        <label>
          <span>이름</span>
          <input
            value={profile.name}
            onChange={(event) => update("name", event.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          <span>이메일</span>
          <input
            type="email"
            value={profile.email}
            onChange={(event) => update("email", event.target.value)}
            required
          />
        </label>
        <label>
          <span>연락처</span>
          <input
            value={profile.phone}
            onChange={(event) => update("phone", event.target.value)}
            maxLength={30}
          />
        </label>
        <label>
          <span>우편번호</span>
          <span className="inline-control">
            <input
              value={profile.postcode}
              onChange={(event) => update("postcode", event.target.value)}
              maxLength={20}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void openPostcodeSearch(({ postcode, address }) => {
                  setProfile((current) => ({
                    ...current,
                    postcode,
                    address1: address,
                  }));
                }).catch(() => {
                  setMessage("주소검색 서비스를 불러오지 못했습니다.");
                });
              }}
            >
              주소검색
            </button>
          </span>
        </label>
        <label>
          <span>주소</span>
          <input
            value={profile.address1}
            onChange={(event) => update("address1", event.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          <span>상세주소</span>
          <input
            value={profile.address2}
            onChange={(event) => update("address2", event.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          <span>현재 비밀번호</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          <span>새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder="변경할 때만 입력"
          />
        </label>
        <label>
          <span>이메일 수신</span>
          <input
            type="checkbox"
            checked={profile.emailOptIn}
            onChange={(event) => update("emailOptIn", event.target.checked)}
          />
        </label>
        <label>
          <span>문자 수신</span>
          <input
            type="checkbox"
            checked={profile.smsOptIn}
            onChange={(event) => update("smsOptIn", event.target.checked)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "저장 중" : "회원정보 저장"}
        </button>
        <button type="button" disabled={saving} onClick={() => void withdraw()}>
          회원 탈퇴
        </button>
      </form>
      {message ? (
        <p className="commerce-notice" role="status">
          {message}
        </p>
      ) : null}
    </main>
  );
}
