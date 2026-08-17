"""
ai_service/utils.py
Similarity helpers used for duplicate detection. Uses pgvector's cosine
distance operator (<=>) for the actual DB query; the pure-python cosine
function here is used for smaller in-memory comparisons/tests.
"""
import math
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text

SIMILARITY_THRESHOLD = 0.85  # cosine similarity above this = likely duplicate


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def find_similar_grievances(db: Session, embedding: List[float], category: str, exclude_id=None, limit: int = 5):
    """
    Query nearby grievances in the same category using pgvector cosine
    distance (<=>). Distance is 1 - cosine_similarity, so we filter for
    distance < (1 - SIMILARITY_THRESHOLD).
    """
    max_distance = 1 - SIMILARITY_THRESHOLD
    params = {
        "embedding": str(embedding),
        "category": category,
        "max_distance": max_distance,
        "limit": limit,
    }
    query = sql_text("""
        SELECT id, text, (embedding <=> CAST(:embedding AS vector)) AS distance
        FROM grievances
        WHERE category = :category
          AND embedding IS NOT NULL
          AND (embedding <=> CAST(:embedding AS vector)) < :max_distance
        ORDER BY distance ASC
        LIMIT :limit
    """)
    if exclude_id:
        query = sql_text(str(query) + " ")  # placeholder if exclusion needed later
    rows = db.execute(query, params).fetchall()
    return [{"id": str(r.id), "text": r.text, "distance": float(r.distance)} for r in rows
            if not exclude_id or str(r.id) != str(exclude_id)]
