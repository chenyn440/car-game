module.exports = {
  apps: [
    {
      name: "__APP_NAME__",
      cwd: "__PROJECT_DIR__",
      script: "__PROJECT_DIR__/server/leaderboard-server.mjs",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: "__PROJECT_DIR__/logs/__APP_NAME__.out.log",
      error_file: "__PROJECT_DIR__/logs/__APP_NAME__.err.log",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
        LEADERBOARD_HOST: "127.0.0.1",
        LEADERBOARD_PORT: "__SIGNAL_PORT__",
      },
    },
  ],
};
