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
const { startGrpcServer } = require('./src/grpc/server');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.PORT || process.env.NODE_ORCHESTRATOR_PORT || 5003;
const MONGO_URL = process.env.MONGO_URL || process.env.MONGO_URI;

// Chat threads + AI feature history now live in Postgres (see agenticRoutes).
// MongoDB is only used for optional audit logs (AgentExecutionTrace, validation
// logs). Disable command buffering so that, when no Mongo is configured, those
// optional writes fail instantly instead of hanging 10s and stalling requests.
mongoose.set('bufferCommands', false);

if (MONGO_URL) {
  mongoose
    .connect(MONGO_URL)
    .then(() => console.log('Connected to MongoDB audit store'))
    .catch((err) => console.error('MongoDB connection error:', err));
} else {
  console.log('No MONGO_URL configured — audit logging disabled (chat + history use Postgres)');
}

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/', agenticRoutes);

const GRPC_PORT = process.env.NODE_GRPC_PORT || 5013;

// Start gRPC server after Express is ready so self-calls can reach the REST API.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`LLM orchestrator HTTP listening on ${PORT}`);
  startGrpcServer(GRPC_PORT);
});
