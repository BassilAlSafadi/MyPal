from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

import numpy as np
import torch
from transformers import AutoTokenizer, AutoModel

from fastapi.middleware.cors import CORSMiddleware


MODEL_NAME_DEFAULT = os.getenv("PRODBERT_MODEL", "sentence-transformers/paraphrase-MiniLM-L3-v2")


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


class RankCandidate(BaseModel):
    id: str
    text: str


class RankRequest(BaseModel):
    query: str
    candidates: List[RankCandidate]
    top_k: Optional[int] = 3


app = FastAPI(title="MyPal ProdBERT Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_model(model_name: str = MODEL_NAME_DEFAULT):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device)
    model.eval()
    return tokenizer, model, device


_tokenizer = None
_model = None
_device = None


def ensure_model():
    global _tokenizer, _model, _device
    if _model is None or _tokenizer is None:
        _tokenizer, _model, _device = load_model()


def _embed_texts(texts: List[str]) -> List[List[float]]:
    ensure_model()
    # Tokenize with truncation to safe length
    encoded = _tokenizer(texts, padding=True, truncation=True, max_length=256, return_tensors="pt")
    for k, v in encoded.items():
        encoded[k] = v.to(_device)

    with torch.no_grad():
        outputs = _model(**encoded)

    # Use max pooling over sequence dimension (aligns with notebook)
    last_hidden = outputs.last_hidden_state  # (batch, seq_len, dim)
    emb = torch.max(last_hidden, dim=1).values  # (batch, dim)

    # Normalize embeddings
    emb = emb.cpu().numpy()
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    emb = emb / norms
    return emb.tolist()


def _cosine_scores(query_vec: List[float], candidate_vecs: List[List[float]]):
    q = np.array(query_vec)
    cand = np.array(candidate_vecs)
    sims = (cand @ q) / (np.linalg.norm(cand, axis=1) * (np.linalg.norm(q) + 1e-12))
    return sims


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    try:
        embeddings = _embed_texts(req.texts)
        return EmbedResponse(embeddings=embeddings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rank")
async def rank(req: RankRequest):
    try:
        # embed query + candidates
        texts = [req.query] + [c.text for c in req.candidates]
        embeddings = _embed_texts(texts)
        query_vec = embeddings[0]
        candidate_vecs = embeddings[1:]

        sims = _cosine_scores(query_vec, candidate_vecs)
        idxs = sims.argsort()[::-1]
        top_k = min(req.top_k or 3, len(req.candidates))
        ranked = []
        for i in idxs[:top_k]:
            ranked.append({"id": req.candidates[int(i)].id, "score": float(sims[int(i)])})

        return {"ranked": ranked}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    ensure_model()
    uvicorn.run("prodbert_service:app", host="0.0.0.0", port=int(os.getenv("PRODBERT_PORT", 8001)), reload=False)
