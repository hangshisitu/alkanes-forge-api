module.exports = {
    apps: [
        {
            name: 'alkanes-api',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
            },
            env_production: {
                NODE_ENV: 'pro',
            },
        }
    ],
};
