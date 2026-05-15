# Python Backend Agent Context

## Ownership Boundaries
* Semantic Embedding generation (ProdBERT).
* Local model inference caching.

## Coding Patterns
* FastAPI for endpoints.
* HuggingFace Transformers.
* Numpy/PyTorch matrix representations.

## Testing Commands
* `pip install -r requirements.txt`
* `uvicorn main:app --reload --port 8001`

## Reliability
* Must load models into memory efficiently. No blocking inference directly inside the router logic (use background tasks or queues if scaling).
