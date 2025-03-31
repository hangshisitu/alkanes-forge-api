import Sequelize from 'sequelize';
import config from "../conf/config.js";

const sequelize = new Sequelize(config.database.database, config.database.username, config.database.password, {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    logging: false,
    pool: {
        max: 32,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});

(async () => {
    try {
        await sequelize.authenticate();
    } catch (error) {
        console.error(`Unable to connect to the database`, error);
    }
})();

export default sequelize;
