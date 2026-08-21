const { Hono } = require('hono');
const { html } = require('hono/html');
const layout = require('../layout');
const ensureAuthenticated = require('../middlewares/ensure-authenticated');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });
const { z } = require('zod');
const { zValidator } = require('@hono/zod-validator');
const { HTTPException } = require('hono/http-exception');
const app = new Hono();

app.use(ensureAuthenticated());

const scheduleIdValidator = zValidator(
  'param',
  z.object({
    scheduleId: z.string().uuid(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, { message: 'URL の形式が正しくありません。' });
    }
  }
);

const scheduleFormValidator = zValidator(
  'form',
  z.object({
    scheduleName: z.string(),
    memo: z.string(),
    candidates: z.string(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, { message: '入力された情報が不十分または正しくありません' });
    }
  }
);

async function createCandidates(candidateNames, scheduleId) {
  const candidates = candidateNames.map((candidateName) => ({
    candidateName: candidateName.slice(0, 255),
    scheduleId,
  }));
  await prisma.candidate.createMany({
    data: candidates,
  });
}

function parseCandidateNames(candidatesStr) {
  return candidatesStr
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

app.get('/new', (c) => {
  return c.html(
    layout(
      c,
      '予定の作成',
      html`
        <form method="post" action="/schedules" class="my-3">
          <div class="mb-3">
            <label class="form-label">予定名</label>
            <input type="text" name="scheduleName" class="form-control" />
          </div>
          <div class="mb-3">
            <label class="form-label">メモ</label>
            <textarea name="memo" class="form-control"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">
              候補日程 (改行して複数入力してください)
            </label>
            <textarea name="candidates" class="form-control"></textarea>
          </div>
          <button class="btn btn-primary" type="submit">予定をつくる</button>
        </form>
      `,
    ),
  );
});

app.post('/', scheduleFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const body = c.req.valid('form');

  // 予定を登録
  const schedule = await prisma.schedule.create({
    data: {
      scheduleId: randomUUID(),
      scheduleName: body.scheduleName.slice(0, 255) || '（名称未設定）',
      memo: body.memo,
      createdBy: user.id,
      updatedAt: new Date(),
    },
  });

  // 候補日程を登録
  const candidateNames = parseCandidateNames(body.candidates);
  await createCandidates(candidateNames, schedule.scheduleId);

  // 作成した予定のページにリダイレクト
  return c.redirect('/schedules/' + schedule.scheduleId);
});

app.get('/:scheduleId', scheduleIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const schedule = await prisma.schedule.findUnique({
    where: { scheduleId: c.req.valid('param').scheduleId },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
        },
      },
    },
  });

  if (!schedule) {
    return c.notFound();
  }

  const candidates = await prisma.candidate.findMany({
    where: { scheduleId: schedule.scheduleId },
    orderBy: { candidateId: 'asc' },
  });

  // データベースからその予定の全ての出欠を取得する
  const availabilities = await prisma.availability.findMany({
    where: { scheduleId: schedule.scheduleId },
    orderBy: { candidateId: 'asc' },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
        },
      },
    },
  });

  // 各候補日程に対する各ユーザの出欠を入れ子の Map にして格納するための Map を作る。
  // key: candidateId, value: Map (key: userId, value: availability)
  const availabilityMapMap = new Map(candidates.map((c) => [c.candidateId, new Map()]));

  // 閲覧ユーザと、出欠を登録したユーザ情報を格納するための Map を作る。
  const userMap = new Map(); // key: userId, value: { userId, username }
  const viewerUserId = user.id;
  userMap.set(viewerUserId, { userId: viewerUserId, username: user.login });

  availabilities.forEach((a) => {
    availabilityMapMap.get(a.candidateId)?.set(a.user.userId, a.availability);
    userMap.set(a.user.userId, a.user);
  });

  // 閲覧ユーザと、出欠を登録したユーザを合わせた全ユーザの配列を作る
  const users = Array.from(userMap.values());

  // コメント取得
  const comments = await prisma.comment.findMany({
    where: { scheduleId: schedule.scheduleId },
  });
  const commentMap = new Map(); // key: userId, value: comment
  comments.forEach((comment) => {
    commentMap.set(comment.userId, comment.comment);
  });

  // 候補日程ごとの集計データとランキングの計算
  const candidateStats = candidates.map((candidate) => {
    let presentCount = 0;
    let uncertainCount = 0;
    let absentCount = 0;

    users.forEach((u) => {
      const avail = availabilityMapMap.get(candidate.candidateId)?.get(u.userId) ?? 0;
      if (avail === 2) presentCount++;
      else if (avail === 1) uncertainCount++;
      else absentCount++;
    });

    const totalAnswered = presentCount + uncertainCount + absentCount;
    const score = presentCount * 2 + uncertainCount * 1;
    const rate = totalAnswered > 0 ? Math.round((presentCount / totalAnswered) * 100) : 0;

    return {
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateName,
      presentCount,
      uncertainCount,
      absentCount,
      score,
      rate,
    };
  });

  // スコア順にソートしてランキング付け（同率も考慮）
  const sortedScores = [...new Set(candidateStats.map((s) => s.score))].sort((a, b) => b - a);
  const candidateRankMap = new Map();
  candidateStats.forEach((stat) => {
    const rankIndex = sortedScores.indexOf(stat.score);
    if (stat.score > 0) {
      candidateRankMap.set(stat.candidateId, rankIndex + 1);
    } else {
      candidateRankMap.set(stat.candidateId, null);
    }
  });

  const buttonStyles = ['btn-danger', 'btn-secondary', 'btn-success'];

  return c.html(
    layout(
      c,
      `予定: ${schedule.scheduleName}`,
      html`
        <div class="card my-3 shadow-sm border-0 bg-light">
          <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
              <h2 class="card-title fw-bold mb-0 text-primary">${schedule.scheduleName}</h2>
              <div class="d-flex gap-2">
                <button id="copy-url-button" class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 btn-copy">
                  <i class="bi bi-clipboard"></i> <span>URLをコピー</span>
                </button>
                ${isMine(user.id, schedule)
                  ? html`
                      <a
                        href="/schedules/${schedule.scheduleId}/edit"
                        class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                      >
                        <i class="bi bi-pencil"></i> <span>編集</span>
                      </a>`
                  : ''}
              </div>
            </div>
            <p class="card-text text-secondary mb-3" style="white-space: pre-wrap;">${schedule.memo}</p>
            <div class="d-flex align-items-center text-muted small">
              <img
                src="https://github.com/${schedule.user.username}.png"
                class="user-avatar"
                alt="${schedule.user.username}"
                onerror="this.style.display='none'"
              />
              <span>作成者: <strong>${schedule.user.username}</strong></span>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center my-3">
          <h3 class="fw-bold mb-0">📅 出欠表</h3>
          <span class="badge bg-secondary">参加者: ${users.length}名</span>
        </div>

        <div class="table-responsive shadow-sm rounded mb-4">
          <table class="table table-bordered table-hover align-middle mb-0 schedule-table" id="schedule-matrix-table">
            <thead class="table-light">
              <tr class="text-center align-middle">
                <th style="min-width: 180px;" class="text-start ps-3">候補日程</th>
                <th style="min-width: 170px;" class="text-center">集計・出席率</th>
                ${users.map(
                  (u) => html`
                    <th style="min-width: 110px;" class="text-center">
                      <div class="d-flex flex-column align-items-center justify-content-center">
                        <img
                          src="https://github.com/${u.username}.png"
                          class="user-avatar mb-1"
                          alt="${u.username}"
                          onerror="this.style.display='none'"
                        />
                        <span class="small fw-semibold text-truncate" style="max-width: 100px;">${u.username}</span>
                      </div>
                    </th>
                  `,
                )}
              </tr>
            </thead>
            <tbody>
              ${candidates.map((candidate) => {
                const stat = candidateStats.find((s) => s.candidateId === candidate.candidateId);
                const rank = candidateRankMap.get(candidate.candidateId);

                return html`
                  <tr data-candidate-id="${candidate.candidateId}">
                    <th class="ps-3">
                      <div class="d-flex align-items-center gap-2">
                        <span class="candidate-rank-container">
                          ${rank === 1
                            ? html`<span class="rank-badge rank-1">👑 1位</span>`
                            : rank === 2
                            ? html`<span class="rank-badge rank-2">🥈 2位</span>`
                            : rank === 3
                            ? html`<span class="rank-badge rank-3">🥉 3位</span>`
                            : ''}
                        </span>
                        <span class="candidate-name-text fw-semibold">${candidate.candidateName}</span>
                      </div>
                    </th>
                    <td class="availability-summary-cell text-center p-2">
                      <div class="availability-progress-container">
                        <div
                          class="availability-progress-bar"
                          style="width: ${stat.rate}%"
                          aria-valuenow="${stat.rate}"
                        ></div>
                      </div>
                      <div class="d-flex justify-content-center align-items-center gap-1 small mt-1">
                        <span class="badge bg-success-subtle text-success border border-success-subtle count-present">
                          出: <strong>${stat.presentCount}</strong>
                        </span>
                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle count-uncertain">
                          ？: <strong>${stat.uncertainCount}</strong>
                        </span>
                        <span class="badge bg-danger-subtle text-danger border border-danger-subtle count-absent">
                          欠: <strong>${stat.absentCount}</strong>
                        </span>
                      </div>
                    </td>
                    ${users.map((u) => {
                      const availability =
                        availabilityMapMap.get(candidate.candidateId)?.get(u.userId) ?? 0;
                      const availabilityLabels = ['欠', '？', '出'];
                      const label = availabilityLabels[availability];
                      return html`
                        <td class="text-center" data-user-cell="${u.userId}">
                          ${u.userId === viewerUserId
                            ? html`<button
                                data-schedule-id="${schedule.scheduleId}"
                                data-user-id="${u.userId}"
                                data-candidate-id="${candidate.candidateId}"
                                data-availability="${availability}"
                                class="availability-toggle-button btn btn-lg ${buttonStyles[
                                  availability
                                ]}"
                              >
                                ${label}
                              </button>`
                            : html`<h4 class="mb-0"><span class="badge ${buttonStyles[availability]}">${label}</span></h4>`}
                        </td>
                      `;
                    })}
                  </tr>
                `;
              })}
              <tr class="table-light">
                <th class="ps-3">コメント</th>
                <td class="text-center text-muted small">ひとこと</td>
                ${users.map((u) => {
                  const comment = commentMap.get(u.userId);
                  return html`
                    <td class="text-center align-middle">
                      <p class="mb-1 text-break small">
                        <span id="${u.userId === viewerUserId ? 'self-comment' : ''}">
                          ${comment || ''}
                        </span>
                      </p>
                      ${u.userId === viewerUserId
                        ? html`
                            <button
                              data-schedule-id="${schedule.scheduleId}"
                              data-user-id="${u.userId}"
                              id="self-comment-button"
                              class="btn btn-outline-info btn-sm"
                            >
                              <i class="bi bi-chat-left-text"></i> 編集
                            </button>
                          `
                        : ''}
                    </td>
                  `;
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- チャット風コメントセクション -->
        <div class="card border-0 shadow-sm mb-4">
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 class="fw-bold mb-0">💬 参加者のコメント</h5>
            <button
              data-schedule-id="${schedule.scheduleId}"
              data-user-id="${viewerUserId}"
              id="self-comment-card-button"
              class="btn btn-sm btn-primary d-flex align-items-center gap-1"
            >
              <i class="bi bi-pencil-square"></i> 自分のコメントを${commentMap.get(viewerUserId) ? '編集' : '投稿'}
            </button>
          </div>
          <div class="card-body p-3 p-md-4" id="comments-list-container">
            <div class="row g-3">
              ${users.map((u) => {
                const comment = commentMap.get(u.userId);
                const isViewer = u.userId === viewerUserId;
                return html`
                  <div class="col-12 col-md-6" id="comment-card-${u.userId}">
                    <div class="p-3 comment-card h-100">
                      <div class="d-flex align-items-center gap-2 mb-2">
                        <img
                          src="https://github.com/${u.username}.png"
                          class="user-avatar-lg"
                          alt="${u.username}"
                          onerror="this.src='https://github.com/identicons/${u.username}.png'"
                        />
                        <div>
                          <div class="fw-bold d-flex align-items-center gap-1">
                            ${u.username}
                            ${isViewer ? html`<span class="badge bg-primary-subtle text-primary">あなた</span>` : ''}
                          </div>
                          <div class="text-muted small">参加者</div>
                        </div>
                      </div>
                      <div class="comment-bubble ${isViewer ? 'comment-bubble-self' : ''}">
                        <span class="user-comment-text" id="${isViewer ? 'self-comment-card-text' : `comment-text-${u.userId}`}">
                          ${comment ? comment : html`<span class="text-muted fst-italic">コメントはありません</span>`}
                        </span>
                      </div>
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        </div>
      `,
    ),
  );
});

function isMine(userId, schedule) {
  return schedule && parseInt(schedule.createdBy, 10) === parseInt(userId, 10);
}

app.get('/:scheduleId/edit', scheduleIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const schedule = await prisma.schedule.findUnique({
    where: { scheduleId: c.req.valid('param').scheduleId },
  });
  if (!isMine(user.id, schedule)) {
    return c.notFound();
  }

  const candidates = await prisma.candidate.findMany({
    where: { scheduleId: schedule.scheduleId },
    orderBy: { candidateId: 'asc' },
  });

  return c.html(
    layout(
      c,
      `予定の編集: ${schedule.scheduleName}`,
      html`
        <form
          class="my-3"
          method="post"
          action="/schedules/${schedule.scheduleId}/update"
        >
          <div class="mb-3">
            <label class="form-label">予定名</label>
            <input
              type="text"
              name="scheduleName"
              class="form-control"
              value="${schedule.scheduleName}"
            />
          </div>
          <div class="mb-3">
            <label class="form-label">メモ</label>
            <textarea name="memo" class="form-control">${schedule.memo}</textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">既存の候補日程</label>
            <ul class="list-group mb-2">
              ${candidates.map(
                (candidate) =>
                  html`<li class="list-group-item">${candidate.candidateName}</li>`,
              )}
            </ul>
            <p>候補日程の追加 (改行して複数入力してください)</p>
            <textarea name="candidates" class="form-control"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">
            以上の内容で予定を編集する <i class="bi bi-pencil"></i>
          </button>
        </form>
        <h3 class="my-3">危険な変更</h3>
        <form method="post" action="/schedules/${schedule.scheduleId}/delete">
          <button type="submit" class="btn btn-danger">
            この予定を削除する <i class="bi bi-trash"></i>
          </button>
        </form>
      `,
    ),
  );
});

app.post('/:scheduleId/update', scheduleIdValidator, scheduleFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const schedule = await prisma.schedule.findUnique({
    where: { scheduleId: c.req.valid('param').scheduleId },
  });
  if (!isMine(user.id, schedule)) {
    return c.notFound();
  }

  const body = c.req.valid('form');
  const updatedSchedule = await prisma.schedule.update({
    where: { scheduleId: schedule.scheduleId },
    data: {
      scheduleName: body.scheduleName.slice(0, 255) || '（名称未設定）',
      memo: body.memo,
      updatedAt: new Date(),
    },
  });

  // 候補が追加されているかチェック
  const candidateNames = parseCandidateNames(body.candidates);
  if (candidateNames.length) {
    await createCandidates(candidateNames, updatedSchedule.scheduleId);
  }

  return c.redirect('/schedules/' + updatedSchedule.scheduleId);
});

async function deleteScheduleAggregate(scheduleId) {
  await prisma.availability.deleteMany({ where: { scheduleId } });
  await prisma.candidate.deleteMany({ where: { scheduleId } });
  await prisma.comment.deleteMany({ where: { scheduleId } });
  await prisma.schedule.delete({ where: { scheduleId } });
}
app.deleteScheduleAggregate = deleteScheduleAggregate;

app.post('/:scheduleId/delete', scheduleIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const schedule = await prisma.schedule.findUnique({
    where: { scheduleId: c.req.valid('param').scheduleId },
  });
  if (!isMine(user.id, schedule)) {
    return c.notFound();
  }

  await deleteScheduleAggregate(schedule.scheduleId);
  return c.redirect('/');
});

module.exports = app;
