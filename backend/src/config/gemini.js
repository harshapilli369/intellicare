const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const getModel = () => {
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  return genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
};

module.exports = { getModel };
