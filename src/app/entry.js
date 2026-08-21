"use strict";
import $ from "jquery";
import "bootstrap/dist/js/bootstrap.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";

// リアルタイム集計 ＆ ランキング再計算
function recalculateScheduleStats() {
  const rows = $("#schedule-matrix-table tbody tr[data-candidate-id]");
  const rowStats = [];

  rows.each((_, el) => {
    const row = $(el);
    const candidateId = row.data("candidate-id");

    let present = 0;
    let uncertain = 0;
    let absent = 0;

    // 自ユーザーのボタンと他ユーザーのバッジの両方から出欠ステータスを取得
    row.find("td[data-user-cell]").each((__, cellEl) => {
      const cell = $(cellEl);
      const btn = cell.find(".availability-toggle-button");
      let avail = 0;
      if (btn.length > 0) {
        avail = parseInt(btn.data("availability"), 10) || 0;
      } else {
        const text = cell.find(".badge").text().trim();
        if (text === "出") avail = 2;
        else if (text === "？") avail = 1;
        else avail = 0;
      }

      if (avail === 2) present++;
      else if (avail === 1) uncertain++;
      else absent++;
    });

    const total = present + uncertain + absent;
    const score = present * 2 + uncertain * 1;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    // 行内のカウントとプログレスバーを更新
    row.find(".count-present strong").text(present);
    row.find(".count-uncertain strong").text(uncertain);
    row.find(".count-absent strong").text(absent);
    row.find(".availability-progress-bar")
      .css("width", `${rate}%`)
      .attr("aria-valuenow", rate);

    rowStats.push({ row, candidateId, score });
  });

  // ランキングを再判定
  const scores = [...new Set(rowStats.map((s) => s.score))].sort((a, b) => b - a);

  rowStats.forEach(({ row, score }) => {
    const rankContainer = row.find(".candidate-rank-container");
    rankContainer.empty();
    if (score > 0) {
      const rankIndex = scores.indexOf(score);
      if (rankIndex === 0) {
        rankContainer.html('<span class="rank-badge rank-1">👑 1位</span>');
      } else if (rankIndex === 1) {
        rankContainer.html('<span class="rank-badge rank-2">🥈 2位</span>');
      } else if (rankIndex === 2) {
        rankContainer.html('<span class="rank-badge rank-3">🥉 3位</span>');
      }
    }
  });
}

// 出欠ボタンの切り替え処理
$(".availability-toggle-button").each((i, e) => {
  const button = $(e);
  button.on("click", () => {
    const scheduleId = button.data("schedule-id");
    const userId = button.data("user-id");
    const candidateId = button.data("candidate-id");
    const availability = parseInt(button.data("availability"), 10);
    const nextAvailability = (availability + 1) % 3;

    // 連打防止のための簡易無効化
    button.prop("disabled", true);

    fetch(
      `/schedules/${scheduleId}/users/${userId}/candidates/${candidateId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability: nextAvailability }),
      },
    )
      .then((response) => response.json())
      .then((data) => {
        button.data("availability", data.availability);
        const availabilityLabels = ["欠", "？", "出"];
        button.text(availabilityLabels[data.availability]);

        const buttonStyles = ["btn-danger", "btn-secondary", "btn-success"];
        button.removeClass("btn-danger btn-secondary btn-success");
        button.addClass(buttonStyles[data.availability]);

        // リアルタイムで集計とランキングを更新
        recalculateScheduleStats();
      })
      .finally(() => {
        button.prop("disabled", false);
      });
  });
});

// コメント編集処理
function handleEditComment(scheduleId, userId) {
  const currentComment = $("#self-comment").text().trim();
  const comment = prompt(
    "コメントを255文字以内で入力してください。",
    currentComment,
  );
  if (comment !== null) {
    fetch(`/schedules/${scheduleId}/users/${userId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment }),
    })
      .then((response) => response.json())
      .then((data) => {
        $("#self-comment").text(data.comment);
        const cardText = $("#self-comment-card-text");
        if (cardText.length) {
          cardText.text(data.comment || "コメントはありません");
          if (!data.comment) {
            cardText.html('<span class="text-muted fst-italic">コメントはありません</span>');
          }
        }
        const cardBtn = $("#self-comment-card-button");
        if (cardBtn.length) {
          cardBtn.html(
            `<i class="bi bi-pencil-square"></i> 自分のコメントを${data.comment ? "編集" : "投稿"}`,
          );
        }
      });
  }
}

const buttonSelfComment = $("#self-comment-button");
buttonSelfComment.on("click", () => {
  const scheduleId = buttonSelfComment.data("schedule-id");
  const userId = buttonSelfComment.data("user-id");
  handleEditComment(scheduleId, userId);
});

const buttonSelfCommentCard = $("#self-comment-card-button");
buttonSelfCommentCard.on("click", () => {
  const scheduleId = buttonSelfCommentCard.data("schedule-id");
  const userId = buttonSelfCommentCard.data("user-id");
  handleEditComment(scheduleId, userId);
});

// 共有用URLコピー機能
const copyUrlButton = $("#copy-url-button");
copyUrlButton.on("click", () => {
  const currentUrl = window.location.href;
  navigator.clipboard.writeText(currentUrl).then(() => {
    const originalHtml = copyUrlButton.html();
    copyUrlButton.addClass("copied");
    copyUrlButton.html('<i class="bi bi-check2"></i> <span>コピー完了！</span>');
    setTimeout(() => {
      copyUrlButton.removeClass("copied");
      copyUrlButton.html(originalHtml);
    }, 2000);
  }).catch(() => {
    prompt("以下のURLをコピーしてください：", currentUrl);
  });
});
