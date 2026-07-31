require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectMySQL } = require('./config/mysql');
const { syncModels } = require('./models/mysql');
const { connectMongoDB } = require('./config/mongodb');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const aiRoutes = require('./routes/aiRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectMySQL();
    await syncModels();
    await connectMongoDB();
  } catch (err) {
    console.error(`Database connection failed: ${err.message}`);
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`IntelliCare API running on port ${PORT}`));
}

start();
