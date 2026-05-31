const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');

const agenticRoutes = require('./src/routes/agenticRoutes');
const swaggerSpec = require('./src/swagger');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.PORT || process.env.NODE_ORCHESTRATOR_PORT || 5003;
const MONGO_URL = process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/mypal_audit';

mongoose
  .connect(MONGO_URL)
  .then(() => console.log('Connected to MongoDB audit store'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/', agenticRoutes);

app.listen(PORT, '0.0.0.0', () => console.log(`LLM orchestrator listening on ${PORT}`));
