#!/usr/bin/env bash
set -euo pipefail

# =========================
# Fill these values first
# =========================
SSH_USER_HOST="root@49.233.148.151"          # e.g. ubuntu@1.2.3.4
SSH_PORT="22"             # e.g. 22
SSH_KEY_PATH="/Users/chenyongnuan/.ssh/id_rsa"           # optional, e.g. /root/.ssh/id_rsa
REMOTE_PROJECT_DIR="/home/memo-app"     # e.g. /home/ubuntu/memo-app
GIT_BRANCH="main"         # e.g. main
NODE_BIN=""               # optional, e.g. /usr/bin/node (leave empty to use PATH)
NPM_BIN=""                # optional, e.g. /usr/bin/npm  (leave empty to use PATH)
NEED_INSTALL="auto"       # auto|yes|no
RESTART_CMD="source /root/.nvm/nvm.sh >/dev/null 2>&1; nvm use --silent 22 >/dev/null 2>&1; pm2 restart meeting-signal --update-env || pm2 start /home/memo-app/scripts/meeting-signal-server.mjs --name meeting-signal"            # optional

if [[ -z "${SSH_USER_HOST}" || -z "${REMOTE_PROJECT_DIR}" ]]; then
  echo "Please set SSH_USER_HOST and REMOTE_PROJECT_DIR in this script first."
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
  if [[ ! -d node_modules ]]; then
    echo "==> node_modules missing, run npm install"
    "\${NPM_CMD}" install
  else
    echo "==> node_modules exists, skip install"
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
