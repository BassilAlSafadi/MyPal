require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const agenticRoutes = require('./src/routes/agenticRoutes');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.NODE_ORCHESTRATOR_PORT || 5003;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mypal_audit';

mongoose
  .connect(MONGO_URL)
  .then(() => console.log('Connected to MongoDB audit store'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use('/', agenticRoutes);

app.listen(PORT, () => console.log(`LLM orchestrator listening on ${PORT}`));
