module.exports = {
    apps: [
        {
            name: 'alkanes-api',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                port: 20011,
            },
            env_fat: {
                NODE_ENV: 'fat',
                port: 20011,
            },
            env_pro: {
                NODE_ENV: 'pro',
                port: 20011,
            },
        },
        {
            name: 'alkanes-api-2',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                port: 20012,
            },
            env_pro: {
                NODE_ENV: 'pro',
                port: 20012,
            },
        },
        {
            name: 'alkanes-api-3',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                port: 20013,
            },
            env_pro: {
                NODE_ENV: 'pro',
                port: 20013,
            },
        },
        {
            name: 'alkanes-job',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                jobEnable: true
            },
            env_fat: {
                NODE_ENV: 'fat',
                jobEnable: true
            },
            env_pro: {
                NODE_ENV: 'pro',
                jobEnable: true
            },
        },
        {
            name: 'alkanes-job-mintStatus',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                jobMintStatusEnable: true
            },
            env_fat: {
                NODE_ENV: 'fat',
                jobMintStatusEnable: true
            },
            env_pro: {
                NODE_ENV: 'pro',
                jobMintStatusEnable: true
            },
        },
        {
            name: 'alkanes-mempool',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                mempoolEnable: true
            },
            env_fat: {
                NODE_ENV: 'fat',
                mempoolEnable: true
            },
            env_pro: {
                NODE_ENV: 'pro',
                mempoolEnable: true
            },
        },
        {
            name: 'alkanes-indexer',
            script: 'src/app.js',
            env: {
                NODE_ENV: 'dev',
                indexerEnable: true,
                port: 57777,
            },
            env_pro: {
                NODE_ENV: 'pro',
                indexerEnable: true,
                port: 57777,
            },
        },
    ],
};
