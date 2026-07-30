import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { getPublishedContentPage } from "@/lib/site-content";

interface ContentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: ContentPageProps): Promise<Metadata> {
  const params = await searchParams;
  const selected = await getPublishedContentPage(readPageKey(params));
  return {
    title: selected?.seoTitle || selected?.title || "이용안내",
    description: selected?.seoDescription || undefined,
  };
}

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const params = await searchParams;
  const selected = await getPublishedContentPage(readPageKey(params));

  return (
    <SiteFrame>
      <main id="main-content" className="legal-page">
        {selected ? (
          <>
            <h1>{selected.title}</h1>
            <PlainTextContent body={selected.body} />
          </>
        ) : (
          <>
            <h1>이용안내</h1>
            <div className="empty-card">게시된 안내 내용이 없습니다.</div>
          </>
        )}
      </main>
    </SiteFrame>
  );
}

function readPageKey(
  params: Record<string, string | string[] | undefined>,
): string {
  const rawKey = Array.isArray(params.pid) ? params.pid[0] : params.pid;
  return String(rawKey ?? "provision").slice(0, 80);
}

function PlainTextContent({ body }: { body: string }) {
  return (
    <div className="legal-copy">
      {body
        .split(/\n{2,}/u)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) =>
          block.startsWith("## ") ? (
            <h2 key={`${index}-${block.slice(0, 24)}`}>
              {block.slice(3).trim()}
            </h2>
          ) : (
            <p key={`${index}-${block.slice(0, 24)}`}>
              {block.split("\n").map((line, lineIndex) => (
                <span key={`${lineIndex}-${line.slice(0, 12)}`}>
                  {line}
                  {lineIndex < block.split("\n").length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          ),
        )}
    </div>
  );
}
