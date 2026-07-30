import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import {
  getPublicCommunityPost,
  listPublicCommunityBoards,
  listPublicCommunityPosts,
  type PublicCommunityPostDetail,
} from "@/lib/admin-community";
import styles from "./public-board.module.css";

export const metadata: Metadata = {
  title: "커뮤니티",
};

export default async function PublicBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const slug = firstParam(params.bo_table).trim().slice(0, 80);
  const postId = firstParam(params.wr_id).trim().slice(0, 80);
  const query = firstParam(params.stx).trim().slice(0, 80);
  const page = positiveInteger(firstParam(params.page));
  const commentPage = positiveInteger(firstParam(params.comment_page));

  if (!slug) {
    const boards = await listPublicCommunityBoards();
    return (
      <SiteFrame>
        <PageHeading
          title="커뮤니티"
          breadcrumbs={[
            { label: "Home", href: "/shop" },
            { label: "커뮤니티" },
          ]}
        />
        <main id="main-content" className={styles.page}>
          <header className={styles.intro}>
            <h2>커뮤니티</h2>
            <p>키엘골드의 새로운 소식과 안내를 확인하세요.</p>
          </header>
          {boards.length ? (
            <div className={styles.boardGrid}>
              {boards.map((board) => (
                <a
                  href={boardHref(board.slug)}
                  className={styles.boardCard}
                  key={board.id}
                >
                  <span>{board.groupName}</span>
                  <strong>{board.name}</strong>
                  <p>{board.description || "등록된 게시물을 확인하세요."}</p>
                  <small>
                    게시물 {board.postCount}개
                    {board.latestPostAt
                      ? ` · 최근 ${formatDate(board.latestPostAt)}`
                      : ""}
                  </small>
                </a>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>공개 중인 게시판이 없습니다.</div>
          )}
        </main>
      </SiteFrame>
    );
  }

  if (postId) {
    const post = await getPublicCommunityPost(slug, postId, {
      commentPage,
      commentPageSize: 30,
    });
    if (!post) notFound();
    return (
      <SiteFrame>
        <PageHeading
          title={post.boardName}
          breadcrumbs={[
            { label: "Home", href: "/shop" },
            { label: "커뮤니티", href: "/bbs/board.php" },
            { label: post.boardName, href: boardHref(slug) },
            { label: "게시물" },
          ]}
        />
        <main id="main-content" className={styles.page}>
          <PostDetail post={post} />
        </main>
      </SiteFrame>
    );
  }

  const result = await listPublicCommunityPosts(slug, {
    page,
    pageSize: 20,
    query,
  });
  if (!result) notFound();
  return (
    <SiteFrame>
      <PageHeading
        title={result.board.name}
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "커뮤니티", href: "/bbs/board.php" },
          { label: result.board.name },
        ]}
      />
      <main id="main-content" className={styles.page}>
        <header className={styles.intro}>
          <h2>{result.board.name}</h2>
          {result.board.description ? <p>{result.board.description}</p> : null}
        </header>
        <form className={styles.search} action="/bbs/board.php" method="get">
          <input type="hidden" name="bo_table" value={slug} />
          <label htmlFor="board-search">게시물 검색</label>
          <input
            id="board-search"
            type="search"
            name="stx"
            defaultValue={query}
            maxLength={80}
            placeholder="제목, 내용, 작성자"
          />
          <button type="submit">검색</button>
        </form>
        {result.posts.items.length ? (
          <div className={styles.postList}>
            {result.posts.items.map((post) => (
              <a href={postHref(slug, post.id)} key={post.id}>
                <span className={styles.postNumber}>
                  {post.pinned ? "공지" : post.id.slice(-5)}
                </span>
                <span className={styles.postTitle}>
                  <strong>{post.title}</strong>
                  {post.commentCount > 0 ? (
                    <small>댓글 {post.commentCount}</small>
                  ) : null}
                </span>
                <span className={styles.postAuthor}>{post.authorName}</span>
                <span className={styles.postMeta}>
                  {formatDate(post.createdAt)}
                  <small>조회 {post.hitCount}</small>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>등록된 게시물이 없습니다.</div>
        )}
        <Pagination
          current={result.posts.page}
          count={result.posts.pageCount}
          href={(pageNumber) => boardHref(slug, pageNumber, query)}
          label="게시물 목록 페이지"
        />
        <div className={styles.bottomActions}>
          <a href="/bbs/board.php">게시판 전체보기</a>
        </div>
      </main>
    </SiteFrame>
  );
}

function PostDetail({ post }: { post: PublicCommunityPostDetail }) {
  return (
    <>
      <article className={styles.postDetail}>
        <header>
          {post.pinned ? <span className={styles.notice}>공지</span> : null}
          <h2>{post.title}</h2>
          <dl>
            <div>
              <dt>작성자</dt>
              <dd>{post.authorName}</dd>
            </div>
            <div>
              <dt>작성일</dt>
              <dd>{formatDate(post.createdAt)}</dd>
            </div>
            <div>
              <dt>조회</dt>
              <dd>{post.hitCount}</dd>
            </div>
          </dl>
        </header>
        <div className={styles.postBody}>{post.content}</div>
      </article>
      <section className={styles.comments}>
        <h3>댓글 <span>{post.comments.total}</span></h3>
        {post.comments.items.length ? (
          <ul>
            {post.comments.items.map((comment) => (
              <li key={comment.id}>
                <header>
                  <strong>{comment.authorName}</strong>
                  <time dateTime={comment.createdAt}>
                    {formatDate(comment.createdAt)}
                  </time>
                </header>
                <p>{comment.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noComments}>등록된 댓글이 없습니다.</p>
        )}
        <Pagination
          current={post.comments.page}
          count={post.comments.pageCount}
          href={(pageNumber) =>
            `${postHref(post.boardSlug, post.id)}&comment_page=${pageNumber}`
          }
          label="댓글 페이지"
        />
      </section>
      <div className={styles.bottomActions}>
        <a href={boardHref(post.boardSlug)}>목록</a>
      </div>
    </>
  );
}

function Pagination({
  current,
  count,
  href,
  label,
}: {
  current: number;
  count: number;
  href: (page: number) => string;
  label: string;
}) {
  if (count <= 1) return null;
  const start = Math.max(1, Math.min(current - 2, count - 4));
  const end = Math.min(count, start + 4);
  return (
    <nav className={styles.pagination} aria-label={label}>
      {current > 1 ? <a href={href(current - 1)}>이전</a> : null}
      {Array.from({ length: end - start + 1 }, (_, index) => start + index).map(
        (page) => (
          <a
            href={href(page)}
            aria-current={page === current ? "page" : undefined}
            key={page}
          >
            {page}
          </a>
        ),
      )}
      {current < count ? <a href={href(current + 1)}>다음</a> : null}
    </nav>
  );
}

function boardHref(slug: string, page = 1, query = "") {
  const params = new URLSearchParams({ bo_table: slug });
  if (page > 1) params.set("page", String(page));
  if (query) params.set("stx", query);
  return `/bbs/board.php?${params.toString()}`;
}

function postHref(slug: string, id: string) {
  const params = new URLSearchParams({ bo_table: slug, wr_id: id });
  return `/bbs/board.php?${params.toString()}`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function positiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.trunc(parsed))
    : 1;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}
