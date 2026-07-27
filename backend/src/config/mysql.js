const { Sequelize } = require('sequelize');

// Relational store for users, patients, appointments, and prescriptions.
// Clinical notes and AI summaries live in MongoDB instead.
const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  }
);

const connectMySQL = async () => {
  await sequelize.authenticate();
  console.log('MySQL connected');
};

module.exports = { sequelize, connectMySQL };
