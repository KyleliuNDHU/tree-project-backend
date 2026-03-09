// PM2 Ecosystem Config — 自架伺服器 (Ubuntu)
// 使用方式: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'tree-backend',
      cwd: '/opt/tree-app/backend',
      script: 'app.js',
      instances: 2,          // i3-8130U 有 4 threads，分 2 給 Node.js
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/opt/tree-app/logs/backend-error.log',
      out_file: '/opt/tree-app/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
