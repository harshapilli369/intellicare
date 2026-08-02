const { Sequelize } = require('sequelize');
const logger = require('./logger');

// Relational store for users, patients, appointments, and prescriptions.
// Clinical notes and AI summaries live in MongoDB instead.
//
// A host normally hands out one connection URL, and copying it whole is far
// harder to get wrong than transcribing five separate values - a single mistyped
// character in a password reads as "access denied" and looks like a permissions
// problem rather than a typo. MYSQL_URL is therefore preferred when it is set,
// and the individual variables remain for local development.
const settings = () => {
  const url = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;

  if (url) {
    const parsed = new URL(url);
    return {
      database: parsed.pathname.replace('/', ''),
      username: decodeURIComponent(parsed.username),
      // Passwords routinely contain characters that have to be escaped in a
      // URL, so what is read back has to be decoded.
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
    };
  }

  return {
    database: process.env.MYSQL_DATABASE,
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
  };
};

const { database, username, password, host, port } = settings();

const sequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect: 'mysql',
  logging: false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

const connectMySQL = async () => {
  await sequelize.authenticate();
  logger.info({ host, port, database }, 'MySQL connected');
};

module.exports = { sequelize, connectMySQL };
