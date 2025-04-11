import Sequelize from 'sequelize';
import config from "../conf/config.js";

const sequelize = new Sequelize(config.database.database, config.database.username, config.database.password, {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    logging: false,
    pool: {
        max: 32,         // 根据业务流量调整
        min: 2,          // 保持一定数量的活跃连接
        acquire: 30000,  // 连接获取的超时时间（毫秒）
        idle: 10000      // 空闲时间（毫秒）自动释放连接
    },
    dialectOptions: {
        connectTimeout: 10000, // 连接超时时间（毫秒）
    }
});

(async () => {
    try {
        await sequelize.authenticate();
    } catch (error) {
        console.error(`Unable to connect to the database`, error);
    }
})();

export default sequelize;
