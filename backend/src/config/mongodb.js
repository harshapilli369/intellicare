const mongoose = require('mongoose');
const logger = require('./logger');

const connectMongoDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info('MongoDB connected');
};

module.exports = { connectMongoDB };
