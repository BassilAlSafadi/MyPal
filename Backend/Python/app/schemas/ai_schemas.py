from pydantic import BaseModel
from typing import List, Optional

class AIAnalysisRequest(BaseModel):
    ticket_id: str
    content: str

class AIAnalysisResponse(BaseModel):
    sentiment: str
    suggested_tags: List[str]
    confidence_score: float

class AISuggestionRequest(BaseModel):
    ticket_id: str
    context: List[str]
