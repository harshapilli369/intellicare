const mongoose = require('mongoose');

const connectMongoDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
};

module.exports = { connectMongoDB };
