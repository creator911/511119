import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export type CommunityResource =
  | "groups"
  | "boards"
  | "posts"
  | "comments"
  | "inquiry-settings"
  | "inquiries";

export type CommunityPostStatus = "draft" | "published" | "hidden";
export type InquiryStatus = "pending" | "in_progress" | "answered" | "closed";

export interface CommunityGroup {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  boardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityBoard {
  id: string;
  groupId: string;
  groupName: string;
  slug: string;
  name: string;
  description: string;
  readLevel: number;
  writeLevel: number;
  commentEnabled: boolean;
  active: boolean;
  sortOrder: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPost {
  id: string;
  boardId: string;
  boardName: string;
  userId: string;
  authorName: string;
  title: string;
  content: string;
  status: CommunityPostStatus;
  pinned: boolean;
  hitCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  postTitle: string;
  userId: string;
  authorName: string;
  content: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InquirySettings {
  enabled: boolean;
  title: string;
  description: string;
  allowGuest: boolean;
  requireEmail: boolean;
  categories: string[];
  legacy: InquiryLegacySettings;
  updatedAt: string;
}

export interface InquiryLegacySettings {
  skin: string;
  mobileSkin: string;
  showEmail: boolean;
  showPhone: boolean;
  requirePhone: boolean;
  useSms: boolean;
  sendNumber: string;
  adminPhone: string;
  adminEmail: string;
  useEditor: boolean;
  subjectLength: number;
  mobileSubjectLength: number;
  pageRows: number;
  mobilePageRows: number;
  imageWidth: number;
  uploadSize: number;
  includeHead: string;
  includeTail: string;
  useCaptcha: boolean;
  contentHead: string;
  contentTail: string;
  mobileContentHead: string;
  mobileContentTail: string;
  insertContent: string;
  extraSubjects: string[];
  extraValues: string[];
}

export const DEFAULT_INQUIRY_LEGACY_SETTINGS: InquiryLegacySettings = {
  skin: "basic",
  mobileSkin: "basic",
  showEmail: true,
  showPhone: true,
  requirePhone: false,
  useSms: false,
  sendNumber: "",
  adminPhone: "",
  adminEmail: "",
  useEditor: true,
  subjectLength: 60,
  mobileSubjectLength: 40,
  pageRows: 15,
  mobilePageRows: 15,
  imageWidth: 600,
  uploadSize: 1_048_576,
  includeHead: "",
  includeTail: "",
  useCaptcha: true,
  contentHead: "",
  contentTail: "",
  mobileContentHead: "",
  mobileContentTail: "",
  insertContent: "",
  extraSubjects: Array.from({ length: 5 }, () => ""),
  extraValues: Array.from({ length: 5 }, () => ""),
};

export interface OneToOneInquiry {
  id: string;
  userId: string;
  authorName: string;
  email: string;
  phone: string;
  category: string;
  title: string;
  content: string;
  status: InquiryStatus;
  answer: string;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCommunityBoard {
  id: string;
  slug: string;
  name: string;
  description: string;
  groupName: string;
  postCount: number;
  latestPostAt: string | null;
}

export interface PublicCommunityPostSummary {
  id: string;
  boardSlug: string;
  authorName: string;
  title: string;
  pinned: boolean;
  hitCount: number;
  commentCount: number;
  createdAt: string;
}

export interface PublicCommunityPostDetail
  extends PublicCommunityPostSummary {
  boardName: string;
  content: string;
  comments: PaginatedResult<{
    id: string;
    authorName: string;
    content: string;
    createdAt: string;
  }>;
}

export interface PublicInquirySummary {
  id: string;
  category: string;
  title: string;
  status: InquiryStatus;
  answered: boolean;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicInquiryDetail extends PublicInquirySummary {
  content: string;
  answer: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

interface GroupRow {
  id: string;
  name: string;
  sort_order: number;
  active: number;
  board_count: number;
  created_at: string;
  updated_at: string;
}

interface BoardRow {
  id: string;
  group_id: string;
  group_name: string;
  slug: string;
  name: string;
  description: string;
  read_level: number;
  write_level: number;
  comment_enabled: number;
  active: number;
  sort_order: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

interface PostRow {
  id: string;
  board_id: string;
  board_name: string;
  user_id: string;
  author_name: string;
  title: string;
  content: string;
  status: string;
  pinned: number;
  hit_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  post_title: string;
  user_id: string;
  author_name: string;
  content: string;
  visible: number;
  created_at: string;
  updated_at: string;
}

interface InquiryRow {
  id: string;
  user_id: string;
  author_name: string;
  email: string;
  phone: string;
  category: string;
  title: string;
  content: string;
  status: string;
  answer: string;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PublicBoardRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  group_name: string;
  post_count: number;
  latest_post_at: string | null;
}

interface PublicPostSummaryRow {
  id: string;
  board_slug: string;
  author_name: string;
  title: string;
  pinned: number;
  hit_count: number;
  comment_count: number;
  created_at: string;
}

interface PublicPostDetailRow extends PublicPostSummaryRow {
  board_name: string;
  content: string;
}

interface PublicInquiryRow {
  id: string;
  category: string;
  title: string;
  content?: string;
  status: string;
  answer?: string;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface InquirySettingsRow {
  enabled: number;
  title: string;
  description: string;
  allow_guest: number;
  require_email: number;
  categories_json: string;
  legacy_json: string;
  updated_at: string;
}

let communityInitialization: Promise<void> | null = null;

export async function ensureAdminCommunitySchema(): Promise<void> {
  await ensureCommerceSchema();
  if (!communityInitialization) {
    const database = commerceDb();
    communityInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS community_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS community_groups_sort_idx ON community_groups(sort_order, name)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS community_boards (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL REFERENCES community_groups(id)
            ON UPDATE RESTRICT ON DELETE RESTRICT,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          read_level INTEGER NOT NULL DEFAULT 0,
          write_level INTEGER NOT NULL DEFAULT 1,
          comment_enabled INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS community_boards_group_idx ON community_boards(group_id, sort_order)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS community_seed_meta (
          key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_groups (
          id, name, sort_order, active
        )
        SELECT 'shop', '쇼핑몰', 10, 1
        WHERE NOT EXISTS (
          SELECT 1 FROM community_seed_meta
          WHERE key = 'legacy_board_defaults_v1'
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_boards (
          id, group_id, slug, name, description, read_level, write_level,
          comment_enabled, active, sort_order
        )
        SELECT 'free', 'shop', 'free', '자유게시판', '', 0, 1, 1, 1, 10
        WHERE NOT EXISTS (
          SELECT 1 FROM community_seed_meta
          WHERE key = 'legacy_board_defaults_v1'
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_boards (
          id, group_id, slug, name, description, read_level, write_level,
          comment_enabled, active, sort_order
        )
        SELECT 'gallery', 'shop', 'gallery', '갤러리', '', 0, 1, 1, 1, 20
        WHERE NOT EXISTS (
          SELECT 1 FROM community_seed_meta
          WHERE key = 'legacy_board_defaults_v1'
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_boards (
          id, group_id, slug, name, description, read_level, write_level,
          comment_enabled, active, sort_order
        )
        SELECT 'notice', 'shop', 'notice', '공지사항', '', 0, 10, 0, 1, 30
        WHERE NOT EXISTS (
          SELECT 1 FROM community_seed_meta
          WHERE key = 'legacy_board_defaults_v1'
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_boards (
          id, group_id, slug, name, description, read_level, write_level,
          comment_enabled, active, sort_order
        )
        SELECT 'qa', 'shop', 'qa', '질문답변', '', 0, 1, 1, 1, 40
        WHERE NOT EXISTS (
          SELECT 1 FROM community_seed_meta
          WHERE key = 'legacy_board_defaults_v1'
        )`),
        database.prepare(`INSERT OR IGNORE INTO community_seed_meta (key)
          VALUES ('legacy_board_defaults_v1')`),
        database.prepare(`CREATE TABLE IF NOT EXISTS community_posts (
          id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES community_boards(id)
            ON UPDATE RESTRICT ON DELETE RESTRICT,
          user_id TEXT NOT NULL DEFAULT '',
          author_name TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'published',
          pinned INTEGER NOT NULL DEFAULT 0,
          hit_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS community_posts_board_idx ON community_posts(board_id, pinned DESC, created_at DESC)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS community_comments (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL REFERENCES community_posts(id)
            ON UPDATE RESTRICT ON DELETE CASCADE,
          user_id TEXT NOT NULL DEFAULT '',
          author_name TEXT NOT NULL,
          content TEXT NOT NULL,
          visible INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS community_comments_post_idx ON community_comments(post_id, created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS inquiry_settings (
          id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 1,
          title TEXT NOT NULL DEFAULT '1:1 문의',
          description TEXT NOT NULL DEFAULT '궁금한 내용을 남겨 주시면 확인 후 답변드리겠습니다.',
          allow_guest INTEGER NOT NULL DEFAULT 1,
          require_email INTEGER NOT NULL DEFAULT 1,
          categories_json TEXT NOT NULL DEFAULT '["상품","주문·결제","배송","교환·반품","기타"]',
          legacy_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`INSERT OR IGNORE INTO inquiry_settings (
          id, enabled, title, description, allow_guest, require_email,
          categories_json
        ) VALUES (
          'default', 1, '1:1 문의',
          '궁금한 내용을 남겨 주시면 확인 후 답변드리겠습니다.',
          1, 1, '["상품","주문·결제","배송","교환·반품","기타"]'
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS one_to_one_inquiries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT '',
          author_name TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '기타',
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          answer TEXT NOT NULL DEFAULT '',
          answered_at TEXT,
          lookup_token_hash TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS one_to_one_inquiries_status_idx ON one_to_one_inquiries(status, created_at DESC)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS inquiry_lookup_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
      ])
      .then(() => ensureAdminCommunityMigrations(database))
      .catch((error) => {
        communityInitialization = null;
        throw error;
      });
  }
  await communityInitialization;
}

async function ensureAdminCommunityMigrations(
  database: D1Database,
): Promise<void> {
  const settingsColumns = await database
    .prepare("PRAGMA table_info(inquiry_settings)")
    .all<{ name: string }>();
  if (
    !(settingsColumns.results ?? []).some(
      (column) => column.name === "legacy_json",
    )
  ) {
    await database
      .prepare(
        "ALTER TABLE inquiry_settings ADD COLUMN legacy_json TEXT NOT NULL DEFAULT '{}'",
      )
      .run();
  }

  const inquiryColumns = await database
    .prepare("PRAGMA table_info(one_to_one_inquiries)")
    .all<{ name: string }>();
  const existingInquiryColumns = new Set(
    (inquiryColumns.results ?? []).map((column) => column.name),
  );
  if (!existingInquiryColumns.has("lookup_token_hash")) {
    await database
      .prepare(
        "ALTER TABLE one_to_one_inquiries ADD COLUMN lookup_token_hash TEXT NOT NULL DEFAULT ''",
      )
      .run();
  }

  await database.batch([
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS one_to_one_inquiries_lookup_token_uq
       ON one_to_one_inquiries(lookup_token_hash)
       WHERE lookup_token_hash <> ''`,
    ),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_boards_parent_insert
      BEFORE INSERT ON community_boards
      WHEN NOT EXISTS (
        SELECT 1 FROM community_groups WHERE id = NEW.group_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_group_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_boards_parent_update
      BEFORE UPDATE OF group_id ON community_boards
      WHEN NOT EXISTS (
        SELECT 1 FROM community_groups WHERE id = NEW.group_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_group_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_posts_parent_insert
      BEFORE INSERT ON community_posts
      WHEN NOT EXISTS (
        SELECT 1 FROM community_boards WHERE id = NEW.board_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_board_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_posts_parent_update
      BEFORE UPDATE OF board_id ON community_posts
      WHEN NOT EXISTS (
        SELECT 1 FROM community_boards WHERE id = NEW.board_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_board_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_comments_parent_insert
      BEFORE INSERT ON community_comments
      WHEN NOT EXISTS (
        SELECT 1 FROM community_posts WHERE id = NEW.post_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_post_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_comments_parent_update
      BEFORE UPDATE OF post_id ON community_comments
      WHEN NOT EXISTS (
        SELECT 1 FROM community_posts WHERE id = NEW.post_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_post_parent_missing');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_groups_child_guard
      BEFORE DELETE ON community_groups
      WHEN EXISTS (
        SELECT 1 FROM community_boards WHERE group_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_group_has_boards');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_boards_child_guard
      BEFORE DELETE ON community_boards
      WHEN EXISTS (
        SELECT 1 FROM community_posts WHERE board_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'community_board_has_posts');
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS community_posts_comment_cascade
      AFTER DELETE ON community_posts
      BEGIN
        DELETE FROM community_comments WHERE post_id = OLD.id;
      END`),
  ]);
}

export async function listCommunityResource(
  resource: CommunityResource,
  options: { page?: number; pageSize?: number; query?: string } = {},
): Promise<
  | PaginatedResult<
      | CommunityGroup
      | CommunityBoard
      | CommunityPost
      | CommunityComment
      | OneToOneInquiry
    >
  | InquirySettings
> {
  await ensureAdminCommunitySchema();
  const database = commerceDb();
  if (resource === "inquiry-settings") {
    return readInquirySettings(database);
  }
  const query = normalizedSearch(options.query);
  const pattern = `%${escapeLike(query)}%`;
  const paginationOptions = {
    page: positivePage(options.page),
    pageSize: boundedPageSize(options.pageSize, 100, 200),
  };
  if (resource === "groups") {
    const where = query ? "WHERE g.name LIKE ? ESCAPE '\\'" : "";
    const pagination = await resolveAdminPagination(
      database,
      `SELECT COUNT(*) AS count FROM community_groups g ${where}`,
      query ? [pattern] : [],
      paginationOptions,
    );
    const result = await database
      .prepare(`SELECT g.id, g.name, g.sort_order, g.active,
          COUNT(b.id) AS board_count, g.created_at, g.updated_at
        FROM community_groups g
        LEFT JOIN community_boards b ON b.group_id = g.id
        ${where}
        GROUP BY g.id
        ORDER BY g.sort_order, g.name
        LIMIT ? OFFSET ?`)
      .bind(
        ...(query ? [pattern] : []),
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      )
      .all<GroupRow>();
    return {
      ...pagination,
      items: (result.results ?? []).map(parseGroup),
    };
  }
  if (resource === "boards") {
    const where = query
      ? `WHERE b.name LIKE ? ESCAPE '\\'
          OR b.slug LIKE ? ESCAPE '\\'
          OR b.description LIKE ? ESCAPE '\\'
          OR g.name LIKE ? ESCAPE '\\'`
      : "";
    const searchBindings = query
      ? [pattern, pattern, pattern, pattern]
      : [];
    const pagination = await resolveAdminPagination(
      database,
      `SELECT COUNT(*) AS count
       FROM community_boards b
       LEFT JOIN community_groups g ON g.id = b.group_id
       ${where}`,
      searchBindings,
      paginationOptions,
    );
    const result = await database
      .prepare(`SELECT b.id, b.group_id, COALESCE(g.name, '') AS group_name,
          b.slug, b.name, b.description, b.read_level, b.write_level,
          b.comment_enabled, b.active, b.sort_order,
          COUNT(p.id) AS post_count, b.created_at, b.updated_at
        FROM community_boards b
        LEFT JOIN community_groups g ON g.id = b.group_id
        LEFT JOIN community_posts p ON p.board_id = b.id
        ${where}
        GROUP BY b.id
        ORDER BY g.sort_order, b.sort_order, b.name
        LIMIT ? OFFSET ?`)
      .bind(
        ...searchBindings,
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      )
      .all<BoardRow>();
    return {
      ...pagination,
      items: (result.results ?? []).map(parseBoard),
    };
  }
  if (resource === "posts") {
    const where = query
      ? `WHERE p.title LIKE ? ESCAPE '\\'
          OR p.content LIKE ? ESCAPE '\\'
          OR p.author_name LIKE ? ESCAPE '\\'
          OR b.name LIKE ? ESCAPE '\\'`
      : "";
    const searchBindings = query
      ? [pattern, pattern, pattern, pattern]
      : [];
    const pagination = await resolveAdminPagination(
      database,
      `SELECT COUNT(*) AS count
       FROM community_posts p
       LEFT JOIN community_boards b ON b.id = p.board_id
       ${where}`,
      searchBindings,
      paginationOptions,
    );
    const result = await database
      .prepare(`SELECT p.id, p.board_id, COALESCE(b.name, '') AS board_name,
          p.user_id, p.author_name, p.title, p.content, p.status, p.pinned,
          p.hit_count, COUNT(c.id) AS comment_count, p.created_at, p.updated_at
        FROM community_posts p
        LEFT JOIN community_boards b ON b.id = p.board_id
        LEFT JOIN community_comments c ON c.post_id = p.id
        ${where}
        GROUP BY p.id
        ORDER BY p.pinned DESC, p.created_at DESC
        LIMIT ? OFFSET ?`)
      .bind(
        ...searchBindings,
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      )
      .all<PostRow>();
    return {
      ...pagination,
      items: (result.results ?? []).flatMap((row) => {
        const parsed = parsePost(row);
        return parsed ? [parsed] : [];
      }),
    };
  }
  if (resource === "comments") {
    const where = query
      ? `WHERE c.content LIKE ? ESCAPE '\\'
          OR c.author_name LIKE ? ESCAPE '\\'
          OR p.title LIKE ? ESCAPE '\\'`
      : "";
    const searchBindings = query ? [pattern, pattern, pattern] : [];
    const pagination = await resolveAdminPagination(
      database,
      `SELECT COUNT(*) AS count
       FROM community_comments c
       LEFT JOIN community_posts p ON p.id = c.post_id
       ${where}`,
      searchBindings,
      paginationOptions,
    );
    const result = await database
      .prepare(`SELECT c.id, c.post_id, COALESCE(p.title, '') AS post_title,
          c.user_id, c.author_name, c.content, c.visible,
          c.created_at, c.updated_at
        FROM community_comments c
        LEFT JOIN community_posts p ON p.id = c.post_id
        ${where}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?`)
      .bind(
        ...searchBindings,
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      )
      .all<CommentRow>();
    return {
      ...pagination,
      items: (result.results ?? []).map(parseComment),
    };
  }
  const where = query
    ? `WHERE title LIKE ? ESCAPE '\\'
        OR content LIKE ? ESCAPE '\\'
        OR author_name LIKE ? ESCAPE '\\'
        OR email LIKE ? ESCAPE '\\'
        OR category LIKE ? ESCAPE '\\'`
    : "";
  const searchBindings = query
    ? [pattern, pattern, pattern, pattern, pattern]
    : [];
  const pagination = await resolveAdminPagination(
    database,
    `SELECT COUNT(*) AS count FROM one_to_one_inquiries ${where}`,
    searchBindings,
    paginationOptions,
  );
  const result = await database
    .prepare(`SELECT id, user_id, author_name, email, phone, category, title,
        content, status, answer, answered_at, created_at, updated_at
      FROM one_to_one_inquiries
      ${where}
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'answered' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT ? OFFSET ?`)
    .bind(
      ...searchBindings,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    )
    .all<InquiryRow>();
  return {
    ...pagination,
    items: (result.results ?? []).flatMap((row) => {
      const parsed = parseInquiry(row);
      return parsed ? [parsed] : [];
    }),
  };
}

export async function createCommunityResource(
  resource: Exclude<CommunityResource, "inquiry-settings">,
  input: unknown,
  adminUsername: string,
): Promise<
  CommunityGroup | CommunityBoard | CommunityPost | CommunityComment | OneToOneInquiry
> {
  await ensureAdminCommunitySchema();
  const value = objectInput(input);
  const database = commerceDb();
  const id = createId(resource.slice(0, 3));

  try {
    if (resource === "groups") {
      const name = requiredText(value.name, "그룹명", 80);
      const sortOrder = integerValue(value.sortOrder, "정렬 순서", 0, 100_000, 0);
      const active = booleanValue(value.active, true);
      await database
        .prepare(`INSERT INTO community_groups (
          id, name, sort_order, active
        ) VALUES (?, ?, ?, ?)`)
        .bind(id, name, sortOrder, active ? 1 : 0)
        .run();
      await writeAudit(database, adminUsername, "community.group.create", "community_group", id);
      return readGroup(database, id);
    }
    if (resource === "boards") {
      const groupId = identifier(value.groupId, "게시판 그룹");
      await requireExisting(database, "community_groups", groupId, "게시판 그룹");
      const slug = slugValue(value.slug);
      const name = requiredText(value.name, "게시판명", 100);
      const description = optionalText(value.description, "설명", 500);
      const readLevel = integerValue(value.readLevel, "읽기 레벨", 0, 10, 0);
      const writeLevel = integerValue(value.writeLevel, "쓰기 레벨", 0, 10, 1);
      const commentEnabled = booleanValue(value.commentEnabled, true);
      const active = booleanValue(value.active, true);
      const sortOrder = integerValue(value.sortOrder, "정렬 순서", 0, 100_000, 0);
      await database
        .prepare(`INSERT INTO community_boards (
          id, group_id, slug, name, description, read_level, write_level,
          comment_enabled, active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          groupId,
          slug,
          name,
          description,
          readLevel,
          writeLevel,
          commentEnabled ? 1 : 0,
          active ? 1 : 0,
          sortOrder,
        )
        .run();
      await writeAudit(database, adminUsername, "community.board.create", "community_board", id);
      return readBoard(database, id);
    }
    if (resource === "posts") {
      const boardId = identifier(value.boardId, "게시판");
      await requireExisting(database, "community_boards", boardId, "게시판");
      const authorName = requiredText(value.authorName, "작성자", 80);
      const title = requiredText(value.title, "제목", 200);
      const content = requiredText(value.content, "내용", 50_000);
      const status = postStatus(value.status);
      const pinned = booleanValue(value.pinned, false);
      await database
        .prepare(`INSERT INTO community_posts (
          id, board_id, user_id, author_name, title, content, status, pinned
        ) VALUES (?, ?, '', ?, ?, ?, ?, ?)`)
        .bind(id, boardId, authorName, title, content, status, pinned ? 1 : 0)
        .run();
      await writeAudit(database, adminUsername, "community.post.create", "community_post", id);
      return readPost(database, id);
    }
    if (resource === "comments") {
      const postId = identifier(value.postId, "게시물");
      await requireExisting(database, "community_posts", postId, "게시물");
      const authorName = requiredText(value.authorName, "작성자", 80);
      const content = requiredText(value.content, "댓글", 5_000);
      const visible = booleanValue(value.visible, true);
      await database
        .prepare(`INSERT INTO community_comments (
          id, post_id, user_id, author_name, content, visible
        ) VALUES (?, ?, '', ?, ?, ?)`)
        .bind(id, postId, authorName, content, visible ? 1 : 0)
        .run();
      await writeAudit(database, adminUsername, "community.comment.create", "community_comment", id);
      return readComment(database, id);
    }
    const inquiry = await insertInquiry(database, id, value, {
      userId: "",
      defaultStatus: "pending",
    });
    await writeAudit(database, adminUsername, "inquiry.create", "one_to_one_inquiry", id);
    return inquiry;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateCommunityResource(
  resource: CommunityResource,
  id: string,
  input: unknown,
  adminUsername: string,
): Promise<
  CommunityGroup | CommunityBoard | CommunityPost | CommunityComment | InquirySettings | OneToOneInquiry
> {
  await ensureAdminCommunitySchema();
  const value = objectInput(input);
  const database = commerceDb();

  try {
    if (resource === "inquiry-settings") {
      const enabled = booleanValue(value.enabled, true);
      const title = requiredText(value.title, "문의 화면 제목", 100);
      const description = optionalText(value.description, "문의 안내", 1_000);
      const allowGuest = booleanValue(value.allowGuest, true);
      const requireEmail = booleanValue(value.requireEmail, true);
      const categories = categoryValues(value.categories);
      const legacy = inquiryLegacySettings(value.legacy);
      await database
        .prepare(`UPDATE inquiry_settings
          SET enabled = ?, title = ?, description = ?, allow_guest = ?,
              require_email = ?, categories_json = ?, legacy_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 'default'`)
        .bind(
          enabled ? 1 : 0,
          title,
          description,
          allowGuest ? 1 : 0,
          requireEmail ? 1 : 0,
          JSON.stringify(categories),
          JSON.stringify(legacy),
        )
        .run();
      await writeAudit(database, adminUsername, "inquiry.settings.update", "inquiry_settings", "default");
      return readInquirySettings(database);
    }

    const safeId = identifier(id, "식별값");
    if (resource === "groups") {
      const name = requiredText(value.name, "그룹명", 80);
      const sortOrder = integerValue(value.sortOrder, "정렬 순서", 0, 100_000, 0);
      const active = booleanValue(value.active, true);
      const result = await database
        .prepare(`UPDATE community_groups
          SET name = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`)
        .bind(name, sortOrder, active ? 1 : 0, safeId)
        .run();
      assertChanged(result, "게시판 그룹");
      await writeAudit(database, adminUsername, "community.group.update", "community_group", safeId);
      return readGroup(database, safeId);
    }
    if (resource === "boards") {
      const groupId = identifier(value.groupId, "게시판 그룹");
      await requireExisting(database, "community_groups", groupId, "게시판 그룹");
      const result = await database
        .prepare(`UPDATE community_boards
          SET group_id = ?, slug = ?, name = ?, description = ?,
              read_level = ?, write_level = ?, comment_enabled = ?,
              active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`)
        .bind(
          groupId,
          slugValue(value.slug),
          requiredText(value.name, "게시판명", 100),
          optionalText(value.description, "설명", 500),
          integerValue(value.readLevel, "읽기 레벨", 0, 10, 0),
          integerValue(value.writeLevel, "쓰기 레벨", 0, 10, 1),
          booleanValue(value.commentEnabled, true) ? 1 : 0,
          booleanValue(value.active, true) ? 1 : 0,
          integerValue(value.sortOrder, "정렬 순서", 0, 100_000, 0),
          safeId,
        )
        .run();
      assertChanged(result, "게시판");
      await writeAudit(database, adminUsername, "community.board.update", "community_board", safeId);
      return readBoard(database, safeId);
    }
    if (resource === "posts") {
      const boardId = identifier(value.boardId, "게시판");
      await requireExisting(database, "community_boards", boardId, "게시판");
      const result = await database
        .prepare(`UPDATE community_posts
          SET board_id = ?, author_name = ?, title = ?, content = ?,
              status = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`)
        .bind(
          boardId,
          requiredText(value.authorName, "작성자", 80),
          requiredText(value.title, "제목", 200),
          requiredText(value.content, "내용", 50_000),
          postStatus(value.status),
          booleanValue(value.pinned, false) ? 1 : 0,
          safeId,
        )
        .run();
      assertChanged(result, "게시물");
      await writeAudit(database, adminUsername, "community.post.update", "community_post", safeId);
      return readPost(database, safeId);
    }
    if (resource === "comments") {
      const result = await database
        .prepare(`UPDATE community_comments
          SET author_name = ?, content = ?, visible = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`)
        .bind(
          requiredText(value.authorName, "작성자", 80),
          requiredText(value.content, "댓글", 5_000),
          booleanValue(value.visible, true) ? 1 : 0,
          safeId,
        )
        .run();
      assertChanged(result, "댓글");
      await writeAudit(database, adminUsername, "community.comment.update", "community_comment", safeId);
      return readComment(database, safeId);
    }
    const status = inquiryStatus(value.status);
    const answer = optionalText(value.answer, "답변", 20_000);
    if (status === "answered" && !answer) {
      throw new AdminApiError(400, "답변 완료 상태에는 답변 내용이 필요합니다.", {
        answer: "답변을 입력해 주세요.",
      });
    }
    const result = await database
      .prepare(`UPDATE one_to_one_inquiries
        SET author_name = ?, email = ?, phone = ?, category = ?, title = ?,
            content = ?, status = ?, answer = ?,
            answered_at = CASE
              WHEN ? = 'answered' AND answer <> ? THEN CURRENT_TIMESTAMP
              WHEN ? = 'answered' AND answered_at IS NULL THEN CURRENT_TIMESTAMP
              WHEN ? <> 'answered' THEN NULL
              ELSE answered_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
      .bind(
        requiredText(value.authorName, "작성자", 80),
        emailValue(value.email, false),
        optionalText(value.phone, "연락처", 40),
        requiredText(value.category, "문의 분류", 80),
        requiredText(value.title, "문의 제목", 200),
        requiredText(value.content, "문의 내용", 30_000),
        status,
        answer,
        status,
        answer,
        status,
        status,
        safeId,
      )
      .run();
    assertChanged(result, "1:1 문의");
    await writeAudit(database, adminUsername, "inquiry.update", "one_to_one_inquiry", safeId);
    return readInquiry(database, safeId);
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function deleteCommunityResource(
  resource: Exclude<CommunityResource, "inquiry-settings">,
  id: string,
  adminUsername: string,
): Promise<void> {
  await ensureAdminCommunitySchema();
  const safeId = identifier(id, "식별값");
  const database = commerceDb();

  try {
    if (resource === "groups") {
      const child = await database
        .prepare("SELECT COUNT(*) AS count FROM community_boards WHERE group_id = ?")
        .bind(safeId)
        .first<{ count: number }>();
      if (Number(child?.count ?? 0) > 0) {
        throw new AdminApiError(409, "게시판이 연결된 그룹은 삭제할 수 없습니다.");
      }
      const result = await database
        .prepare("DELETE FROM community_groups WHERE id = ?")
        .bind(safeId)
        .run();
      assertChanged(result, "게시판 그룹");
    } else if (resource === "boards") {
      const child = await database
        .prepare("SELECT COUNT(*) AS count FROM community_posts WHERE board_id = ?")
        .bind(safeId)
        .first<{ count: number }>();
      if (Number(child?.count ?? 0) > 0) {
        throw new AdminApiError(409, "게시물이 등록된 게시판은 삭제할 수 없습니다.");
      }
      const result = await database
        .prepare("DELETE FROM community_boards WHERE id = ?")
        .bind(safeId)
        .run();
      assertChanged(result, "게시판");
    } else if (resource === "posts") {
      const exists = await database
        .prepare("SELECT id FROM community_posts WHERE id = ? LIMIT 1")
        .bind(safeId)
        .first<{ id: string }>();
      if (!exists) throw new AdminApiError(404, "게시물을 찾을 수 없습니다.");
      await database.batch([
        database
          .prepare("DELETE FROM community_comments WHERE post_id = ?")
          .bind(safeId),
        database.prepare("DELETE FROM community_posts WHERE id = ?").bind(safeId),
      ]);
    } else {
      const table =
        resource === "comments" ? "community_comments" : "one_to_one_inquiries";
      const result = await database
        .prepare(`DELETE FROM ${table} WHERE id = ?`)
        .bind(safeId)
        .run();
      assertChanged(
        result,
        resource === "comments" ? "댓글" : "1:1 문의",
      );
    }
    await writeAudit(
      database,
      adminUsername,
      `${resource}.delete`,
      resource,
      safeId,
    );
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getPublicInquirySettings(): Promise<InquirySettings> {
  await ensureAdminCommunitySchema();
  return readInquirySettings(commerceDb());
}

export async function listPublicCommunityBoards(): Promise<
  PublicCommunityBoard[]
> {
  await ensureAdminCommunitySchema();
  const result = await commerceDb()
    .prepare(`SELECT b.id, b.slug, b.name, b.description, g.name AS group_name,
        COUNT(p.id) AS post_count, MAX(p.created_at) AS latest_post_at
      FROM community_boards b
      JOIN community_groups g
        ON g.id = b.group_id AND g.active = 1
      LEFT JOIN community_posts p
        ON p.board_id = b.id AND p.status = 'published'
      WHERE b.active = 1 AND b.read_level = 0
      GROUP BY b.id
      ORDER BY g.sort_order, b.sort_order, b.name
      LIMIT 200`)
    .all<PublicBoardRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    groupName: row.group_name,
    postCount: Number(row.post_count),
    latestPostAt: row.latest_post_at,
  }));
}

export async function listPublicCommunityPosts(
  slug: string,
  options: { page?: number; pageSize?: number; query?: string } = {},
): Promise<{
  board: PublicCommunityBoard;
  posts: PaginatedResult<PublicCommunityPostSummary>;
} | null> {
  await ensureAdminCommunitySchema();
  const database = commerceDb();
  const board = await readPublicBoardBySlug(database, slug);
  if (!board) return null;
  const pageSize = boundedPageSize(options.pageSize, 20, 50);
  const requestedPage = positivePage(options.page);
  const query = normalizedSearch(options.query);
  const pattern = `%${escapeLike(query)}%`;
  const queryClause = query
    ? " AND (p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\' OR p.author_name LIKE ? ESCAPE '\\')"
    : "";
  const countStatement = database.prepare(
    `SELECT COUNT(*) AS count
     FROM community_posts p
     WHERE p.board_id = ? AND p.status = 'published'${queryClause}`,
  );
  const countRow = query
    ? await countStatement
        .bind(board.id, pattern, pattern, pattern)
        .first<{ count: number }>()
    : await countStatement.bind(board.id).first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const listStatement = database.prepare(
    `SELECT p.id, b.slug AS board_slug, p.author_name, p.title, p.pinned,
        p.hit_count, COUNT(c.id) AS comment_count, p.created_at
     FROM community_posts p
     JOIN community_boards b ON b.id = p.board_id
     LEFT JOIN community_comments c
       ON c.post_id = p.id AND c.visible = 1
     WHERE p.board_id = ? AND p.status = 'published'${queryClause}
     GROUP BY p.id
     ORDER BY p.pinned DESC, p.created_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
  );
  const result = query
    ? await listStatement
        .bind(board.id, pattern, pattern, pattern, pageSize, offset)
        .all<PublicPostSummaryRow>()
    : await listStatement
        .bind(board.id, pageSize, offset)
        .all<PublicPostSummaryRow>();
  return {
    board,
    posts: {
      items: (result.results ?? []).map(parsePublicPostSummary),
      page,
      pageSize,
      pageCount,
      total,
    },
  };
}

export async function getPublicCommunityPost(
  slug: string,
  id: string,
  options: { commentPage?: number; commentPageSize?: number } = {},
): Promise<PublicCommunityPostDetail | null> {
  await ensureAdminCommunitySchema();
  if (!validPublicSlug(slug) || !validIdentifier(id)) return null;
  const database = commerceDb();
  const updated = await database
    .prepare(`UPDATE community_posts
      SET hit_count = hit_count + 1
      WHERE id = ? AND status = 'published'
        AND EXISTS (
          SELECT 1
          FROM community_boards b
          JOIN community_groups g ON g.id = b.group_id
          WHERE b.id = community_posts.board_id
            AND b.slug = ?
            AND b.active = 1
            AND b.read_level = 0
            AND g.active = 1
        )`)
    .bind(id, slug)
    .run();
  if (!updated.meta.changes) return null;
  const row = await database
    .prepare(`SELECT p.id, b.slug AS board_slug, b.name AS board_name,
        p.author_name, p.title, p.content, p.pinned, p.hit_count,
        COUNT(c.id) AS comment_count, p.created_at
      FROM community_posts p
      JOIN community_boards b ON b.id = p.board_id
      JOIN community_groups g ON g.id = b.group_id
      LEFT JOIN community_comments c
        ON c.post_id = p.id AND c.visible = 1
      WHERE p.id = ? AND b.slug = ? AND p.status = 'published'
        AND b.active = 1 AND b.read_level = 0 AND g.active = 1
      GROUP BY p.id`)
    .bind(id, slug)
    .first<PublicPostDetailRow>();
  if (!row) return null;
  const commentPageSize = boundedPageSize(
    options.commentPageSize,
    30,
    50,
  );
  const commentTotal = Number(row.comment_count);
  const commentPageCount = Math.max(
    1,
    Math.ceil(commentTotal / commentPageSize),
  );
  const commentPage = Math.min(
    positivePage(options.commentPage),
    commentPageCount,
  );
  const comments = await database
    .prepare(`SELECT id, author_name, content, created_at
      FROM community_comments
      WHERE post_id = ? AND visible = 1
      ORDER BY created_at, id
      LIMIT ? OFFSET ?`)
    .bind(id, commentPageSize, (commentPage - 1) * commentPageSize)
    .all<{
      id: string;
      author_name: string;
      content: string;
      created_at: string;
    }>();
  return {
    ...parsePublicPostSummary(row),
    boardName: row.board_name,
    content: row.content,
    comments: {
      items: (comments.results ?? []).map((comment) => ({
        id: comment.id,
        authorName: comment.author_name,
        content: comment.content,
        createdAt: comment.created_at,
      })),
      page: commentPage,
      pageSize: commentPageSize,
      pageCount: commentPageCount,
      total: commentTotal,
    },
  };
}

export async function listCustomerInquiries(
  userId: string,
  options: { page?: number; pageSize?: number; query?: string } = {},
): Promise<PaginatedResult<PublicInquirySummary>> {
  await ensureAdminCommunitySchema();
  const safeUserId = userId.slice(0, 128);
  const database = commerceDb();
  const pageSize = boundedPageSize(options.pageSize, 10, 30);
  const requestedPage = positivePage(options.page);
  const query = normalizedSearch(options.query);
  const pattern = `%${escapeLike(query)}%`;
  const queryClause = query
    ? " AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')"
    : "";
  const countStatement = database.prepare(
    `SELECT COUNT(*) AS count
     FROM one_to_one_inquiries
     WHERE user_id = ?${queryClause}`,
  );
  const countRow = query
    ? await countStatement
        .bind(safeUserId, pattern, pattern, pattern)
        .first<{ count: number }>()
    : await countStatement.bind(safeUserId).first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const listStatement = database.prepare(
    `SELECT id, category, title, status, answered_at, created_at, updated_at
     FROM one_to_one_inquiries
     WHERE user_id = ?${queryClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
  );
  const result = query
    ? await listStatement
        .bind(safeUserId, pattern, pattern, pattern, pageSize, offset)
        .all<PublicInquiryRow>()
    : await listStatement
        .bind(safeUserId, pageSize, offset)
        .all<PublicInquiryRow>();
  return {
    items: (result.results ?? []).flatMap((row) => {
      const parsed = parsePublicInquiry(row);
      return parsed ? [parsed] : [];
    }),
    page,
    pageSize,
    pageCount,
    total,
  };
}

export async function getCustomerInquiry(
  userId: string,
  inquiryId: string,
): Promise<PublicInquiryDetail | null> {
  await ensureAdminCommunitySchema();
  if (!validIdentifier(inquiryId)) return null;
  const row = await commerceDb()
    .prepare(`SELECT id, category, title, content, status, answer,
        answered_at, created_at, updated_at
      FROM one_to_one_inquiries
      WHERE id = ? AND user_id = ?
      LIMIT 1`)
    .bind(inquiryId, userId.slice(0, 128))
    .first<PublicInquiryRow>();
  return row ? parsePublicInquiryDetail(row) : null;
}

export async function getGuestInquiryByToken(
  token: string,
  clientKey: string,
): Promise<PublicInquiryDetail | null> {
  await ensureAdminCommunitySchema();
  const database = commerceDb();
  await consumeInquiryLookupRateLimit(database, clientKey);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
  const tokenHash = await hashLookupToken(token);
  const row = await database
    .prepare(`SELECT id, category, title, content, status, answer,
        answered_at, created_at, updated_at
      FROM one_to_one_inquiries
      WHERE user_id = '' AND lookup_token_hash = ?
      LIMIT 1`)
    .bind(tokenHash)
    .first<PublicInquiryRow>();
  return row ? parsePublicInquiryDetail(row) : null;
}

export async function createPublicInquiry(
  input: unknown,
  identity: { userId?: string; clientKey: string },
): Promise<{ inquiry: OneToOneInquiry; lookupToken: string | null }> {
  await ensureAdminCommunitySchema();
  const value = objectInput(input);
  const database = commerceDb();
  const settings = await readInquirySettings(database);
  if (!settings.enabled) {
    throw new AdminApiError(503, "현재 1:1 문의 접수를 받지 않습니다.");
  }
  if (!settings.allowGuest && !identity.userId) {
    throw new AdminApiError(401, "회원 로그인 후 문의할 수 있습니다.");
  }
  const category = requiredText(value.category, "문의 분류", 80);
  if (!settings.categories.includes(category)) {
    throw new AdminApiError(400, "문의 분류를 확인해 주세요.");
  }
  const email = emailValue(value.email, settings.requireEmail);
  await consumeInquiryRateLimit(database, identity.clientKey);
  const lookupToken = identity.userId ? null : createLookupToken();
  const inquiry = await insertInquiry(
    database,
    createId("inq"),
    { ...value, category, email },
    {
      userId: identity.userId ?? "",
      defaultStatus: "pending",
      lookupTokenHash: lookupToken
        ? await hashLookupToken(lookupToken)
        : "",
    },
  );
  return { inquiry, lookupToken };
}

async function readGroup(database: D1Database, id: string) {
  const row = await database
    .prepare(`SELECT g.id, g.name, g.sort_order, g.active,
        COUNT(b.id) AS board_count, g.created_at, g.updated_at
      FROM community_groups g
      LEFT JOIN community_boards b ON b.group_id = g.id
      WHERE g.id = ?
      GROUP BY g.id`)
    .bind(id)
    .first<GroupRow>();
  if (!row) throw new AdminApiError(404, "게시판 그룹을 찾을 수 없습니다.");
  return parseGroup(row);
}

async function readBoard(database: D1Database, id: string) {
  const row = await database
    .prepare(`SELECT b.id, b.group_id, COALESCE(g.name, '') AS group_name,
        b.slug, b.name, b.description, b.read_level, b.write_level,
        b.comment_enabled, b.active, b.sort_order,
        COUNT(p.id) AS post_count, b.created_at, b.updated_at
      FROM community_boards b
      LEFT JOIN community_groups g ON g.id = b.group_id
      LEFT JOIN community_posts p ON p.board_id = b.id
      WHERE b.id = ?
      GROUP BY b.id`)
    .bind(id)
    .first<BoardRow>();
  if (!row) throw new AdminApiError(404, "게시판을 찾을 수 없습니다.");
  return parseBoard(row);
}

async function readPost(database: D1Database, id: string) {
  const row = await database
    .prepare(`SELECT p.id, p.board_id, COALESCE(b.name, '') AS board_name,
        p.user_id, p.author_name, p.title, p.content, p.status, p.pinned,
        p.hit_count, COUNT(c.id) AS comment_count, p.created_at, p.updated_at
      FROM community_posts p
      LEFT JOIN community_boards b ON b.id = p.board_id
      LEFT JOIN community_comments c ON c.post_id = p.id
      WHERE p.id = ?
      GROUP BY p.id`)
    .bind(id)
    .first<PostRow>();
  const parsed = row ? parsePost(row) : null;
  if (!parsed) throw new AdminApiError(404, "게시물을 찾을 수 없습니다.");
  return parsed;
}

async function readComment(database: D1Database, id: string) {
  const row = await database
    .prepare(`SELECT c.id, c.post_id, COALESCE(p.title, '') AS post_title,
        c.user_id, c.author_name, c.content, c.visible,
        c.created_at, c.updated_at
      FROM community_comments c
      LEFT JOIN community_posts p ON p.id = c.post_id
      WHERE c.id = ?`)
    .bind(id)
    .first<CommentRow>();
  if (!row) throw new AdminApiError(404, "댓글을 찾을 수 없습니다.");
  return parseComment(row);
}

async function readInquiry(database: D1Database, id: string) {
  const row = await database
    .prepare(`SELECT id, user_id, author_name, email, phone, category, title,
        content, status, answer, answered_at, created_at, updated_at
      FROM one_to_one_inquiries WHERE id = ?`)
    .bind(id)
    .first<InquiryRow>();
  const parsed = row ? parseInquiry(row) : null;
  if (!parsed) throw new AdminApiError(404, "1:1 문의를 찾을 수 없습니다.");
  return parsed;
}

async function readInquirySettings(database: D1Database): Promise<InquirySettings> {
  const row = await database
    .prepare(`SELECT enabled, title, description, allow_guest, require_email,
        categories_json, legacy_json, updated_at
      FROM inquiry_settings WHERE id = 'default'`)
    .first<InquirySettingsRow>();
  if (!row) throw new AdminApiError(500, "1:1 문의 설정을 읽을 수 없습니다.");
  let categories: string[] = [];
  try {
    const parsed = JSON.parse(row.categories_json) as unknown;
    if (Array.isArray(parsed)) {
      categories = parsed.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
    }
  } catch {
    categories = [];
  }
  if (categories.length === 0) categories = ["기타"];
  let legacy = DEFAULT_INQUIRY_LEGACY_SETTINGS;
  try {
    legacy = inquiryLegacySettings(JSON.parse(row.legacy_json || "{}"));
  } catch {
    legacy = DEFAULT_INQUIRY_LEGACY_SETTINGS;
  }
  return {
    enabled: Boolean(row.enabled),
    title: row.title,
    description: row.description,
    allowGuest: Boolean(row.allow_guest),
    requireEmail: Boolean(row.require_email),
    categories,
    legacy,
    updatedAt: row.updated_at,
  };
}

async function readPublicBoardBySlug(
  database: D1Database,
  slug: string,
): Promise<PublicCommunityBoard | null> {
  if (!validPublicSlug(slug)) return null;
  const row = await database
    .prepare(`SELECT b.id, b.slug, b.name, b.description, g.name AS group_name,
        COUNT(p.id) AS post_count, MAX(p.created_at) AS latest_post_at
      FROM community_boards b
      JOIN community_groups g
        ON g.id = b.group_id AND g.active = 1
      LEFT JOIN community_posts p
        ON p.board_id = b.id AND p.status = 'published'
      WHERE b.slug = ? AND b.active = 1 AND b.read_level = 0
      GROUP BY b.id
      LIMIT 1`)
    .bind(slug)
    .first<PublicBoardRow>();
  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        groupName: row.group_name,
        postCount: Number(row.post_count),
        latestPostAt: row.latest_post_at,
      }
    : null;
}

async function insertInquiry(
  database: D1Database,
  id: string,
  value: Record<string, unknown>,
  options: {
    userId: string;
    defaultStatus: InquiryStatus;
    lookupTokenHash?: string;
  },
): Promise<OneToOneInquiry> {
  const authorName = requiredText(value.authorName, "작성자", 80);
  const email =
    typeof value.email === "string"
      ? emailValue(value.email, false)
      : "";
  const phone = optionalText(value.phone, "연락처", 40);
  const category = requiredText(value.category, "문의 분류", 80);
  const title = requiredText(value.title, "문의 제목", 200);
  const content = requiredText(value.content, "문의 내용", 30_000);
  const status =
    value.status === undefined ? options.defaultStatus : inquiryStatus(value.status);
  const answer = optionalText(value.answer, "답변", 20_000);
  await database
    .prepare(`INSERT INTO one_to_one_inquiries (
      id, user_id, author_name, email, phone, category, title, content,
      status, answer, answered_at, lookup_token_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      options.userId,
      authorName,
      email,
      phone,
      category,
      title,
      content,
      status,
      answer,
      status === "answered" ? new Date().toISOString() : null,
      options.lookupTokenHash ?? "",
    )
    .run();
  return readInquiry(database, id);
}

async function consumeInquiryRateLimit(
  database: D1Database,
  clientKey: string,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / 600_000) * 600_000;
  const safeKey = clientKey.slice(0, 128);
  await database
    .prepare(`INSERT INTO inquiry_rate_limits (
      client_key, window_start, attempts
    ) VALUES (?, ?, 1)
    ON CONFLICT(client_key, window_start) DO UPDATE SET
      attempts = inquiry_rate_limits.attempts + 1,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(safeKey, windowStart)
    .run();
  const row = await database
    .prepare(`SELECT attempts FROM inquiry_rate_limits
      WHERE client_key = ? AND window_start = ?`)
    .bind(safeKey, windowStart)
    .first<{ attempts: number }>();
  if (Number(row?.attempts ?? 0) > 5) {
    throw new AdminApiError(429, "문의 접수 횟수가 많습니다. 잠시 후 다시 시도해 주세요.");
  }
  await probabilisticRateLimitCleanup(
    database,
    "inquiry_rate_limits",
    windowStart,
  );
}

async function consumeInquiryLookupRateLimit(
  database: D1Database,
  clientKey: string,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / 600_000) * 600_000;
  const safeKey = clientKey.slice(0, 128);
  await database
    .prepare(`INSERT INTO inquiry_lookup_rate_limits (
      client_key, window_start, attempts
    ) VALUES (?, ?, 1)
    ON CONFLICT(client_key, window_start) DO UPDATE SET
      attempts = inquiry_lookup_rate_limits.attempts + 1,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(safeKey, windowStart)
    .run();
  const row = await database
    .prepare(`SELECT attempts FROM inquiry_lookup_rate_limits
      WHERE client_key = ? AND window_start = ?`)
    .bind(safeKey, windowStart)
    .first<{ attempts: number }>();
  if (Number(row?.attempts ?? 0) > 30) {
    throw new AdminApiError(
      429,
      "문의 조회 횟수가 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  await probabilisticRateLimitCleanup(
    database,
    "inquiry_lookup_rate_limits",
    windowStart,
  );
}

async function probabilisticRateLimitCleanup(
  database: D1Database,
  table: "inquiry_rate_limits" | "inquiry_lookup_rate_limits",
  windowStart: number,
): Promise<void> {
  if (crypto.getRandomValues(new Uint8Array(1))[0] !== 0) return;
  await database
    .prepare(`DELETE FROM ${table} WHERE window_start < ?`)
    .bind(windowStart - 86_400_000)
    .run();
}

async function requireExisting(
  database: D1Database,
  table: "community_groups" | "community_boards" | "community_posts",
  id: string,
  label: string,
) {
  const row = await database
    .prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw new AdminApiError(400, `${label}을(를) 찾을 수 없습니다.`);
}

async function writeAudit(
  database: D1Database,
  adminUsername: string,
  action: string,
  entityType: string,
  entityId: string,
) {
  await database
    .prepare(`INSERT INTO admin_audit_logs (
      admin_id, action, entity_type, entity_id, details
    ) VALUES (NULL, ?, ?, ?, ?)`)
    .bind(
      action,
      entityType,
      entityId,
      JSON.stringify({ adminUsername: adminUsername.slice(0, 128) }),
    )
    .run();
}

function parseGroup(row: GroupRow): CommunityGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    active: Boolean(row.active),
    boardCount: Number(row.board_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseBoard(row: BoardRow): CommunityBoard {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    slug: row.slug,
    name: row.name,
    description: row.description,
    readLevel: Number(row.read_level),
    writeLevel: Number(row.write_level),
    commentEnabled: Boolean(row.comment_enabled),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    postCount: Number(row.post_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePost(row: PostRow): CommunityPost | null {
  if (
    row.status !== "draft" &&
    row.status !== "published" &&
    row.status !== "hidden"
  ) {
    return null;
  }
  return {
    id: row.id,
    boardId: row.board_id,
    boardName: row.board_name,
    userId: row.user_id,
    authorName: row.author_name,
    title: row.title,
    content: row.content,
    status: row.status,
    pinned: Boolean(row.pinned),
    hitCount: Number(row.hit_count),
    commentCount: Number(row.comment_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseComment(row: CommentRow): CommunityComment {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    userId: row.user_id,
    authorName: row.author_name,
    content: row.content,
    visible: Boolean(row.visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseInquiry(row: InquiryRow): OneToOneInquiry | null {
  if (
    row.status !== "pending" &&
    row.status !== "in_progress" &&
    row.status !== "answered" &&
    row.status !== "closed"
  ) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name,
    email: row.email,
    phone: row.phone,
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePublicPostSummary(
  row: PublicPostSummaryRow,
): PublicCommunityPostSummary {
  return {
    id: row.id,
    boardSlug: row.board_slug,
    authorName: row.author_name,
    title: row.title,
    pinned: Boolean(row.pinned),
    hitCount: Number(row.hit_count),
    commentCount: Number(row.comment_count),
    createdAt: row.created_at,
  };
}

function parsePublicInquiry(
  row: PublicInquiryRow,
): PublicInquirySummary | null {
  if (
    row.status !== "pending" &&
    row.status !== "in_progress" &&
    row.status !== "answered" &&
    row.status !== "closed"
  ) {
    return null;
  }
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    status: row.status,
    answered: row.status === "answered",
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePublicInquiryDetail(
  row: PublicInquiryRow,
): PublicInquiryDetail | null {
  const summary = parsePublicInquiry(row);
  if (!summary || typeof row.content !== "string") return null;
  return {
    ...summary,
    content: row.content,
    answer: typeof row.answer === "string" ? row.answer : "",
  };
}

function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/u.test(value);
}

function validPublicSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/u.test(value);
}

function positivePage(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.max(1, Math.trunc(Number(value)))
    : 1;
}

function boundedPageSize(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.min(maximum, Math.max(1, Math.trunc(Number(value))))
    : fallback;
}

async function resolveAdminPagination(
  database: D1Database,
  countSql: string,
  bindings: unknown[],
  options: { page: number; pageSize: number },
): Promise<Omit<PaginatedResult<never>, "items">> {
  const row = await database
    .prepare(countSql)
    .bind(...bindings)
    .first<{ count: number }>();
  const total = Number(row?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize));
  return {
    page: Math.min(options.page, pageCount),
    pageSize: options.pageSize,
    pageCount,
    total,
  };
}

function normalizedSearch(value: string | undefined): string {
  return typeof value === "string"
    ? value.replace(/\0/gu, "").trim().slice(0, 80)
    : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function createLookupToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function hashLookupToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  return input as Record<string, unknown>;
}

function requiredText(
  input: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof input !== "string") {
    throw new AdminApiError(400, `${label}을(를) 입력해 주세요.`);
  }
  const value = input.replace(/\0/gu, "").trim();
  if (!value || value.length > maximumLength) {
    throw new AdminApiError(
      400,
      `${label}은(는) 1~${maximumLength}자로 입력해 주세요.`,
    );
  }
  return value;
}

function optionalText(
  input: unknown,
  label: string,
  maximumLength: number,
): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "string") {
    throw new AdminApiError(400, `${label}을(를) 확인해 주세요.`);
  }
  const value = input.replace(/\0/gu, "").trim();
  if (value.length > maximumLength) {
    throw new AdminApiError(400, `${label}은(는) ${maximumLength}자 이하로 입력해 주세요.`);
  }
  return value;
}

function integerValue(
  input: unknown,
  label: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (input === undefined || input === null || input === "") return defaultValue;
  const value = Number(input);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new AdminApiError(400, `${label}을(를) 확인해 주세요.`);
  }
  return value;
}

function booleanValue(input: unknown, defaultValue: boolean): boolean {
  if (input === undefined || input === null) return defaultValue;
  if (typeof input !== "boolean") {
    throw new AdminApiError(400, "사용 여부 값을 확인해 주세요.");
  }
  return input;
}

function inquiryLegacySettings(input: unknown): InquiryLegacySettings {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const text = (
    key: keyof InquiryLegacySettings,
    fallback: string,
    maximumLength: number,
  ) =>
    value[key] === undefined
      ? fallback
      : optionalText(value[key], String(key), maximumLength);
  const list = (
    key: "extraSubjects" | "extraValues",
    maximumLength: number,
  ) => {
    const source = Array.isArray(value[key]) ? value[key] : [];
    return Array.from({ length: 5 }, (_, index) =>
      source[index] === undefined
        ? ""
        : optionalText(source[index], `${key} ${index + 1}`, maximumLength),
    );
  };
  return {
    skin: text("skin", DEFAULT_INQUIRY_LEGACY_SETTINGS.skin, 80),
    mobileSkin: text(
      "mobileSkin",
      DEFAULT_INQUIRY_LEGACY_SETTINGS.mobileSkin,
      80,
    ),
    showEmail: booleanValue(
      value.showEmail,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.showEmail,
    ),
    showPhone: booleanValue(
      value.showPhone,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.showPhone,
    ),
    requirePhone: booleanValue(
      value.requirePhone,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.requirePhone,
    ),
    useSms: booleanValue(
      value.useSms,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.useSms,
    ),
    sendNumber: text("sendNumber", "", 30),
    adminPhone: text("adminPhone", "", 30),
    adminEmail: text("adminEmail", "", 254),
    useEditor: booleanValue(
      value.useEditor,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.useEditor,
    ),
    subjectLength: integerValue(value.subjectLength, "subjectLength", 1, 255, 60),
    mobileSubjectLength: integerValue(
      value.mobileSubjectLength,
      "mobileSubjectLength",
      1,
      255,
      40,
    ),
    pageRows: integerValue(value.pageRows, "pageRows", 1, 100, 15),
    mobilePageRows: integerValue(
      value.mobilePageRows,
      "mobilePageRows",
      1,
      100,
      15,
    ),
    imageWidth: integerValue(value.imageWidth, "imageWidth", 100, 5000, 600),
    uploadSize: integerValue(
      value.uploadSize,
      "uploadSize",
      0,
      100_000_000,
      1_048_576,
    ),
    includeHead: text("includeHead", "", 500),
    includeTail: text("includeTail", "", 500),
    useCaptcha: booleanValue(
      value.useCaptcha,
      DEFAULT_INQUIRY_LEGACY_SETTINGS.useCaptcha,
    ),
    contentHead: text("contentHead", "", 100_000),
    contentTail: text("contentTail", "", 100_000),
    mobileContentHead: text("mobileContentHead", "", 100_000),
    mobileContentTail: text("mobileContentTail", "", 100_000),
    insertContent: text("insertContent", "", 20_000),
    extraSubjects: list("extraSubjects", 100),
    extraValues: list("extraValues", 500),
  };
}

function identifier(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/u.test(input)
  ) {
    throw new AdminApiError(400, `${label} 식별값이 올바르지 않습니다.`);
  }
  return input;
}

function slugValue(input: unknown): string {
  if (
    typeof input !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/u.test(input)
  ) {
    throw new AdminApiError(
      400,
      "게시판 주소는 영문 소문자, 숫자, 하이픈으로 3~80자 입력해 주세요.",
      { slug: "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다." },
    );
  }
  return input;
}

function postStatus(input: unknown): CommunityPostStatus {
  if (input === "draft" || input === "published" || input === "hidden") {
    return input;
  }
  throw new AdminApiError(400, "게시물 상태를 확인해 주세요.");
}

function inquiryStatus(input: unknown): InquiryStatus {
  if (
    input === "pending" ||
    input === "in_progress" ||
    input === "answered" ||
    input === "closed"
  ) {
    return input;
  }
  throw new AdminApiError(400, "문의 처리 상태를 확인해 주세요.");
}

function emailValue(input: unknown, required: boolean): string {
  if (input === undefined || input === null || input === "") {
    if (required) throw new AdminApiError(400, "이메일을 입력해 주세요.");
    return "";
  }
  if (
    typeof input !== "string" ||
    input.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input)
  ) {
    throw new AdminApiError(400, "이메일 형식을 확인해 주세요.");
  }
  return input.trim().toLowerCase();
}

function categoryValues(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new AdminApiError(400, "문의 분류를 확인해 주세요.");
  }
  const result = Array.from(
    new Set(
      input.map((item) => requiredText(item, "문의 분류", 40)),
    ),
  );
  if (result.length < 1 || result.length > 20) {
    throw new AdminApiError(400, "문의 분류는 1~20개로 설정해 주세요.");
  }
  return result;
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/gu, "")}`;
}

function assertChanged(result: D1Result, label: string): void {
  if (!result.meta.changes) {
    throw new AdminApiError(404, `${label}을(를) 찾을 수 없습니다.`);
  }
}

function mapDatabaseError(error: unknown): Error {
  if (error instanceof AdminApiError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/community_group_parent_missing/iu.test(message)) {
    return new AdminApiError(400, "게시판 그룹을 찾을 수 없습니다.");
  }
  if (/community_board_parent_missing/iu.test(message)) {
    return new AdminApiError(400, "게시판을 찾을 수 없습니다.");
  }
  if (/community_post_parent_missing/iu.test(message)) {
    return new AdminApiError(400, "게시물을 찾을 수 없습니다.");
  }
  if (/community_group_has_boards/iu.test(message)) {
    return new AdminApiError(409, "게시판이 연결된 그룹은 삭제할 수 없습니다.");
  }
  if (/community_board_has_posts/iu.test(message)) {
    return new AdminApiError(409, "게시물이 등록된 게시판은 삭제할 수 없습니다.");
  }
  if (/UNIQUE constraint failed/iu.test(message)) {
    return new AdminApiError(409, "이미 사용 중인 값입니다.");
  }
  return error instanceof Error ? error : new Error("요청을 처리하지 못했습니다.");
}
