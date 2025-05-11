import Sequelize from 'sequelize';
import config from "../conf/config.js";
import * as logger from '../conf/logger.js';

const sequelize = new Sequelize(config.database.database, config.database.username, config.database.password, {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    logging: false,
    pool: {
        max: 64,         // 根据业务流量调整
        min: 8,          // 保持一定数量的活跃连接
        acquire: 30000,  // 连接获取的超时时间（毫秒）
        idle: 10000,      // 空闲时间（毫秒）自动释放连接
        evict: 1000,           // 添加：定期检查空闲连接
        handleDisconnects: true, // 添加：自动处理断开连接
        maxIdleTime: 30000     // 添加：最大空闲时间
    },
    dialectOptions: {
        connectTimeout: 10000, // 连接超时时间（毫秒）
    }
});

(async () => {
    try {
        await sequelize.authenticate();
    } catch (error) {
        logger.error(`Unable to connect to the database`, error);
    }
})();

export default sequelize;
