module.exports = {
  apps: [{
    name: 'social-dispatcher',
    script: 'npx tsx src/main.ts',
    cwd: '/home/admpiranot/migration/phase3a/social-dispatcher',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
  }]
};
