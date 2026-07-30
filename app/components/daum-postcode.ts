"use client";

export interface PostcodeSelection {
  postcode: string;
  address: string;
}

interface DaumPostcodeResult {
  zonecode?: string;
  userSelectedType?: "R" | "J";
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
  autoRoadAddress?: string;
  autoJibunAddress?: string;
}

interface DaumPostcodeConstructor {
  new (options: {
    width?: string;
    height?: string;
    maxSuggestItems?: number;
    oncomplete: (result: DaumPostcodeResult) => void;
    onclose?: () => void;
    onresize?: (size: { height: number; width: number }) => void;
  }): {
    embed: (
      element: HTMLElement,
      options?: {
        autoClose?: boolean;
      },
    ) => void;
  };
}

interface DaumPostcodeWindow extends Window {
  kakao?: {
    Postcode?: DaumPostcodeConstructor;
  };
  daum?: {
    Postcode?: DaumPostcodeConstructor;
  };
}

export const POSTCODE_SCRIPT_SOURCE =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const SCRIPT_URL = "/vendor/postcode.v2.js";
let scriptPromise: Promise<void> | null = null;
let closeActiveDialog: (() => void) | null = null;

export function openPostcodeSearch(
  onComplete: (selection: PostcodeSelection) => void,
): Promise<void> {
  const Postcode = getPostcodeConstructor();
  if (Postcode) {
    try {
      openPostcodeDialog(Postcode, onComplete);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return loadPostcodeScript().then(() => {
    const loadedPostcode = getPostcodeConstructor();
    if (!loadedPostcode) {
      throw new Error("주소검색 서비스를 불러오지 못했습니다.");
    }
    openPostcodeDialog(loadedPostcode, onComplete);
  });
}

export function preparePostcodeSearch(): Promise<void> {
  return loadPostcodeScript();
}

function openPostcodeDialog(
  Postcode: DaumPostcodeConstructor,
  onComplete: (selection: PostcodeSelection) => void,
) {
  closeActiveDialog?.();

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const previousBodyOverflow = document.body.style.overflow;
  const overlay = document.createElement("div");
  const dialog = document.createElement("section");
  const header = document.createElement("header");
  const title = document.createElement("strong");
  const closeButton = document.createElement("button");
  const embedContainer = document.createElement("div");

  overlay.setAttribute("role", "presentation");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "padding:16px",
    "background:rgba(0,0,0,.52)",
  ].join(";");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "주소검색");
  dialog.style.cssText = [
    "display:flex",
    "width:min(520px,100%)",
    "max-height:100%",
    "flex-direction:column",
    "overflow:hidden",
    "background:#fff",
    "box-shadow:0 18px 55px rgba(0,0,0,.3)",
  ].join(";");
  header.style.cssText = [
    "display:flex",
    "height:52px",
    "flex:none",
    "align-items:center",
    "justify-content:space-between",
    "box-sizing:border-box",
    "padding:0 12px 0 18px",
    "border-bottom:1px solid #ddd",
  ].join(";");
  title.textContent = "주소검색";
  title.style.cssText = "font-size:16px;color:#222";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "주소검색 닫기");
  closeButton.textContent = "×";
  closeButton.style.cssText = [
    "width:36px",
    "height:36px",
    "padding:0",
    "border:0",
    "background:transparent",
    "color:#333",
    "font:300 30px/34px Arial,sans-serif",
    "cursor:pointer",
  ].join(";");
  embedContainer.style.cssText = [
    "position:relative",
    "width:100%",
    "height:min(520px,calc(100dvh - 84px))",
    "min-height:0",
    "overflow:hidden",
  ].join(";");

  const backgroundElements = Array.from(document.body.children)
    .filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    .map((element) => ({ element, inert: element.inert }));
  header.appendChild(title);
  header.appendChild(closeButton);
  dialog.appendChild(header);
  dialog.appendChild(embedContainer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  for (const { element } of backgroundElements) element.inert = true;

  let requestedHeight = 520;
  let closed = false;
  const visualViewport = window.visualViewport;
  const resizeEmbed = () => {
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const availableHeight = Math.max(80, viewportHeight - 84);
    overlay.style.height = `${viewportHeight}px`;
    embedContainer.style.height = `${Math.min(requestedHeight, availableHeight)}px`;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", resizeEmbed);
    visualViewport?.removeEventListener("resize", resizeEmbed);
    document.body.style.overflow = previousBodyOverflow;
    for (const { element, inert } of backgroundElements) {
      element.inert = inert;
    }
    overlay.remove();
    closeActiveDialog = null;
    previouslyFocused?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  };

  closeActiveDialog = close;
  closeButton.addEventListener("click", close, { once: true });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", resizeEmbed);
  visualViewport?.addEventListener("resize", resizeEmbed);
  resizeEmbed();
  closeButton.focus();

  try {
    new Postcode({
      width: "100%",
      height: "100%",
      maxSuggestItems: 5,
      oncomplete(result) {
        const address = selectedAddress(result);
        close();
        onComplete({
          postcode: result.zonecode?.trim() ?? "",
          address: address.trim(),
        });
      },
      onclose: close,
      onresize(size) {
        requestedHeight = Math.max(80, size.height);
        resizeEmbed();
      },
    }).embed(embedContainer, {
      autoClose: true,
    });
  } catch (error) {
    close();
    throw error;
  }
}

function selectedAddress(result: DaumPostcodeResult): string {
  if (result.userSelectedType === "R") {
    return (
      result.roadAddress ||
      result.autoRoadAddress ||
      result.address ||
      result.jibunAddress ||
      result.autoJibunAddress ||
      ""
    );
  }
  if (result.userSelectedType === "J") {
    return (
      result.jibunAddress ||
      result.autoJibunAddress ||
      result.address ||
      result.roadAddress ||
      result.autoRoadAddress ||
      ""
    );
  }
  return (
    result.address ||
    result.roadAddress ||
    result.autoRoadAddress ||
    result.jibunAddress ||
    result.autoJibunAddress ||
    ""
  );
}

function getPostcodeConstructor() {
  const postcodeWindow = window as DaumPostcodeWindow;
  return postcodeWindow.kakao?.Postcode ?? postcodeWindow.daum?.Postcode;
}

function loadPostcodeScript() {
  if (getPostcodeConstructor()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (getPostcodeConstructor()) {
        resolve();
        return;
      }
      scriptPromise = null;
      reject(new Error("주소검색 서비스를 불러오지 못했습니다."));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener(
      "error",
      () => {
        scriptPromise = null;
        if (!existing) script.remove();
        reject(new Error("주소검색 서비스를 불러오지 못했습니다."));
      },
      { once: true },
    );
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

if (typeof window !== "undefined") {
  void preparePostcodeSearch().catch(() => undefined);
}
