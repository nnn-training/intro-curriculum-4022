const { html } = require("hono/html");

function layout(c, title, body) {
  const { user } = c.get("session") ?? {};
  title = title ? `${title} - 予定調整くん改` : "予定調整くん改";
  return html`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/stylesheets/bundle.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css">
      </head>
      <body>
        <nav class="navbar navbar-expand-md navbar-dark bg-dark shadow-sm">
          <div class="container">
            <a class="navbar-brand fw-bold d-flex align-items-center gap-2" href="/">
              <i class="bi bi-calendar-check-fill text-primary"></i> 予定調整くん改
            </a>
            <button
              class="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarResponsive"
              aria-controls="navbarResponsive"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <div id="navbarResponsive" class="collapse navbar-collapse">
              <ul class="navbar-nav ms-auto align-items-center">
                ${user
                  ? html`
                      <li class="nav-item d-flex align-items-center me-3 text-light small">
                        <img
                          src="https://github.com/${user.login}.png"
                          class="user-avatar"
                          alt="${user.login}"
                          onerror="this.style.display='none'"
                        />
                        <span>${user.login}</span>
                      </li>
                      <li class="nav-item">
                        <a class="btn btn-outline-light btn-sm" href="/logout"
                          ><i class="bi bi-box-arrow-right"></i> ログアウト</a
                        >
                      </li>
                    `
                  : html`
                      <li class="nav-item">
                        <a class="btn btn-primary btn-sm" href="/login">
                          <i class="bi bi-box-arrow-in-right"></i> ログイン
                        </a>
                      </li>
                    `}
              </ul>
            </div>
          </div>
        </nav>
        <div class="container py-3">${body}</div>
        <footer class="py-4 text-center text-muted small border-top mt-5">
          <p class="mb-0">&copy; 予定調整くん改 - Schedule Arranger</p>
        </footer>
        <script src="/javascripts/bundle.js"></script>
      </body>
    </html>
  `;
}

module.exports = layout;
