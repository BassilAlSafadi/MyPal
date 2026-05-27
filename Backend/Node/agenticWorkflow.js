// Re-export barrel — kept for backward compatibility with existing tests.
// New code should import from src/agents/* directly.
const { MODEL_CONFIG, createLLMProvider } = require('./src/providers/llmProvider');
const { safeParseJSON, stripReasoningAndFences } = require('./src/utils/helpers');
const { MAX_ITERATIONS, createInitialState, runMyPalAgenticWorkflow } = require('./src/agents/agenticSearch');
const { fastSearchFeature } = require('./src/agents/fastSearch');
const { translateText } = require('./src/agents/translator');
const { summarizeContent } = require('./src/agents/summarizer');
const { askProductExpert } = require('./src/agents/productExpert');
const { cleanScrapedContent } = require('./src/agents/dataCleaner');
const { MyPalSellerAnalytics } = require('./src/agents/sellerAnalytics');
const { MyPalProdRecommender } = require('./src/agents/recommender');

module.exports = {
  MAX_ITERATIONS,
  MODEL_CONFIG,
  createLLMProvider,
  createInitialState,
  runMyPalAgenticWorkflow,
  fastSearchFeature,
  translateText,
  summarizeContent,
  askProductExpert,
  cleanScrapedContent,
  safeParseJSON,
  stripReasoningAndFences,
  MyPalSellerAnalytics,
  MyPalProdRecommender,
};
