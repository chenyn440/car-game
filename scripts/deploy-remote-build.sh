#!/usr/bin/env bash
set -euo pipefail

# =========================
# Fill these values first
# =========================
SSH_USER_HOST="${SSH_USER_HOST:-}"           # required, e.g. ubuntu@1.2.3.4
SSH_PORT="${SSH_PORT:-22}"                   # optional
SSH_KEY_PATH="${SSH_KEY_PATH:-}"             # optional, e.g. /root/.ssh/id_rsa
REMOTE_PROJECT_DIR="${REMOTE_PROJECT_DIR:-/home/car-game}"
GIT_BRANCH="${GIT_BRANCH:-main}"
NODE_BIN="${NODE_BIN:-}"                     # optional, e.g. /usr/bin/node
NPM_BIN="${NPM_BIN:-}"                       # optional, e.g. /usr/bin/npm
NEED_INSTALL="${NEED_INSTALL:-auto}"         # auto|yes|no
PM2_APP_NAME="${PM2_APP_NAME:-car-game}"
API_ENTRY_REL="${API_ENTRY_REL:-server/leaderboard-server.mjs}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8787}"
RESTART_CMD="${RESTART_CMD:-source /root/.nvm/nvm.sh >/dev/null 2>&1 || true; nvm use --silent 22 >/dev/null 2>&1 || true; if command -v pm2 >/dev/null 2>&1; then pm2 delete ${PM2_APP_NAME} >/dev/null 2>&1 || true; LEADERBOARD_HOST=${API_HOST} LEADERBOARD_PORT=${API_PORT} pm2 start ${REMOTE_PROJECT_DIR}/${API_ENTRY_REL} --name ${PM2_APP_NAME}; elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^${PM2_APP_NAME}\\.service'; then systemctl restart ${PM2_APP_NAME}; else echo 'No pm2 or systemd service found for restart.'; fi}"            # optional

if [[ -z "${SSH_USER_HOST}" || -z "${REMOTE_PROJECT_DIR}" ]]; then
  echo "Please set SSH_USER_HOST (and optionally REMOTE_PROJECT_DIR) via env."
  echo "Example:"
  echo "  SSH_USER_HOST=ubuntu@1.2.3.4 SSH_KEY_PATH=~/.ssh/id_rsa REMOTE_PROJECT_DIR=/home/car-game bash scripts/deploy-remote-build.sh"
  exit 1
fi

echo "==> Deploy target: ${SSH_USER_HOST}:${REMOTE_PROJECT_DIR} (branch: ${GIT_BRANCH})"

SSH_CMD=(ssh -p "${SSH_PORT}")
if [[ -n "${SSH_KEY_PATH}" ]]; then
  SSH_CMD+=(-i "${SSH_KEY_PATH}")
fi
SSH_CMD+=("${SSH_USER_HOST}" bash -s)

"${SSH_CMD[@]}" <<EOF
set -euo pipefail

cd "${REMOTE_PROJECT_DIR}"
if [[ ! -d .git ]]; then
  echo "ERROR: ${REMOTE_PROJECT_DIR} is not a git repo. Clone project first."
  exit 1
fi

echo "==> Current directory: \$(pwd)"
echo "==> Git fetch + checkout + pull"
git fetch --all --prune
git checkout "${GIT_BRANCH}"
git pull --ff-only origin "${GIT_BRANCH}"

if [[ -n "${NODE_BIN}" ]]; then
  echo "==> Node version"
  "${NODE_BIN}" -v
else
  # Load nvm for non-interactive SSH sessions when node isn't on PATH.
  if ! command -v node >/dev/null 2>&1 && [[ -s "\$HOME/.nvm/nvm.sh" ]]; then
    . "\$HOME/.nvm/nvm.sh"
    nvm use --silent 22 >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1 || true
  fi
  echo "==> Node version"
  node -v
fi

if [[ -n "${NPM_BIN}" ]]; then
  NPM_CMD="${NPM_BIN}"
else
  NPM_CMD="npm"
fi

if [[ "${NEED_INSTALL}" == "yes" ]]; then
  echo "==> npm install (forced)"
  "\${NPM_CMD}" install
elif [[ "${NEED_INSTALL}" == "auto" ]]; then
  if [[ ! -d node_modules || ! -d node_modules/typescript || ! -d node_modules/vite ]]; then
    echo "==> node_modules/dev deps missing, run npm install"
    "\${NPM_CMD}" install
  else
    echo "==> node_modules + build deps exist, skip install"
  fi
else
  echo "==> Skip npm install"
fi

echo "==> npm run build"
"\${NPM_CMD}" run build

if [[ -n "${RESTART_CMD}" ]]; then
  echo "==> Restart service: ${RESTART_CMD}"
  if ! eval "${RESTART_CMD}"; then
    echo "==> WARN: restart command failed, continue without blocking deploy."
  fi
fi

echo "==> Done."
EOF
