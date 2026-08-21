const { Hono } = require("hono");
const { html } = require("hono/html");
const layout = require("../layout");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: ["query"] });

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Tokyo');

const app = new Hono();

function scheduleTable(schedules) {
  return html`
    <div class="table-responsive shadow-sm rounded">
      <table class="table table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th class="ps-3 py-3">予定名</th>
            <th class="text-end pe-3 py-3">最終更新日時</th>
          </tr>
        </thead>
        <tbody>
          ${schedules.map(
            (schedule) => html`
              <tr>
                <td class="ps-3 py-3">
                  <a href="/schedules/${schedule.scheduleId}" class="fw-semibold text-decoration-none text-primary">
                    <i class="bi bi-calendar-event me-2"></i>${schedule.scheduleName}
                  </a>
                </td>
                <td class="text-end pe-3 text-muted small">${schedule.formattedUpdatedAt}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

app.get("/", async (c) => {
  const { user } = c.get("session") ?? {};

  // ユーザーの作成した予定と、サービス全体の統計データを取得
  const [schedules, totalSchedules, totalUsers, totalAvailabilities, totalComments] = await Promise.all([
    user
      ? prisma.schedule.findMany({
          where: { createdBy: user.id },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.schedule.count().catch(() => 0),
    prisma.user.count().catch(() => 0),
    prisma.availability.count().catch(() => 0),
    prisma.comment.count().catch(() => 0),
  ]);

  schedules.forEach((schedule) => {
    schedule.formattedUpdatedAt = dayjs(schedule.updatedAt).tz().format('YYYY/MM/DD HH:mm');
  });

  return c.html(
    layout(
      c,
      null,
      html`
        <!-- 🎈 ヒーローセクション（浮遊アイコン背景付き） -->
        <div class="my-4 hero-container position-relative overflow-hidden p-5 rounded-4 shadow-sm text-center">
          <div class="floating-icons-bg" aria-hidden="true">
            <span class="floating-icon icon-1">📅</span>
            <span class="floating-icon icon-2">🍻</span>
            <span class="floating-icon icon-3">✨</span>
            <span class="floating-icon icon-4">⏰</span>
            <span class="floating-icon icon-5">🍕</span>
            <span class="floating-icon icon-6">🎯</span>
            <span class="floating-icon icon-7">🎉</span>
            <span class="floating-icon icon-8">💻</span>
          </div>
          <div class="hero-content position-relative" style="z-index: 1;">
            <h1 class="display-6 fw-bold text-dark mb-3">📅 予定調整くん改</h1>
            <p class="lead text-secondary mx-auto mb-4" style="max-width: 600px;">
              GitHubでかんたんログイン。候補日を出して、みんなの出欠やコメントをスムーズに集約・集計できます。
            </p>
            ${!user
              ? html`
                  <div>
                    <a class="btn btn-dark btn-lg px-4 gap-2 shadow-sm" href="/auth/github">
                      <i class="bi bi-github me-1"></i> GitHubでログインして始める
                    </a>
                  </div>
                `
              : html`
                  <div>
                    <a class="btn btn-primary btn-lg px-4 gap-2 shadow-sm" href="/schedules/new">
                      <i class="bi bi-plus-circle me-1"></i> 今すぐ新しい予定を作る
                    </a>
                  </div>
                `}
          </div>
        </div>

        <!-- 📊 サービス全体のライブ統計ダッシュボード -->
        <div class="my-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <h5 class="fw-bold mb-0 text-dark">📊 サービスの利用状況</h5>
            <span class="badge bg-success-subtle text-success border border-success-subtle">LIVE</span>
          </div>
          <div class="row g-3">
            <div class="col-6 col-md-3">
              <div class="p-3 stat-card h-100">
                <div class="stat-icon-wrapper stat-icon-blue">
                  <i class="bi bi-calendar-event"></i>
                </div>
                <div class="stat-value text-primary">${totalSchedules}</div>
                <div class="stat-label">調整中の予定</div>
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="p-3 stat-card h-100">
                <div class="stat-icon-wrapper stat-icon-green">
                  <i class="bi bi-people"></i>
                </div>
                <div class="stat-value text-success">${totalUsers}</div>
                <div class="stat-label">登録ユーザー数</div>
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="p-3 stat-card h-100">
                <div class="stat-icon-wrapper stat-icon-purple">
                  <i class="bi bi-check2-circle"></i>
                </div>
                <div class="stat-value" style="color: #9333ea;">${totalAvailabilities}</div>
                <div class="stat-label">累計出欠回答数</div>
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="p-3 stat-card h-100">
                <div class="stat-icon-wrapper stat-icon-orange">
                  <i class="bi bi-chat-dots"></i>
                </div>
                <div class="stat-value text-warning">${totalComments}</div>
                <div class="stat-label">投稿コメント数</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ユーザーの作成した予定一覧 -->
        ${user
          ? html`
              <div class="my-5">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h4 class="fw-bold mb-0">あなたの作った予定</h4>
                  <a class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1 shadow-sm" href="/schedules/new">
                    <i class="bi bi-plus-circle"></i> 新規作成
                  </a>
                </div>
                ${schedules.length > 0
                  ? scheduleTable(schedules)
                  : html`
                      <div class="card p-4 text-center text-muted border-dashed bg-light">
                        <p class="mb-2">まだ作成した予定はありません。</p>
                        <div>
                          <a href="/schedules/new" class="btn btn-outline-primary btn-sm">予定を作成してみましょう</a>
                        </div>
                      </div>
                    `}
              </div>
            `
          : ""}
      `,
    ),
  );
});

module.exports = app;
