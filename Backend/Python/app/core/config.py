import os

class AIConfig:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    COHERE_API_KEY = os.getenv("COHERE_API_KEY")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    
    PRODBERT_MODEL = os.getenv("PRODBERT_MODEL", "sentence-transformers/paraphrase-MiniLM-L3-v2")
    PRODBERT_PORT = int(os.getenv("PRODBERT_PORT", 8001))

class ServiceConfig:
    GO_GATEWAY_URL = os.getenv("GO_GATEWAY_URL", "http://localhost:8080")
    CSHARP_MAIN_API_URL = os.getenv("CSHARP_MAIN_API_URL", "http://localhost:5000")
