module.exports = {
    apps: [
        {
            name: 'alkanes-api',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                port: 20011,
                jobEnable: false
            },
            env_pro: {
                NODE_ENV: 'pro',
                port: 20011,
                jobEnable: false
            },
        },
        {
            name: 'alkanes-job',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                jobEnable: true
            },
            env_pro: {
                NODE_ENV: 'pro',
                jobEnable: true
            },
        }
    ],
};
