"""
ai_service/base_client.py
Abstract interface for the AI provider. Any concrete client (Gemini, OpenAI,
a local model, etc.) must implement this so routes never depend on a
specific vendor SDK — swap providers by changing one import.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any


class BaseAIClient(ABC):
    @abstractmethod
    def classify_grievance(self, text: str, image_url: str = None) -> Dict[str, Any]:
        """
        Returns a dict:
        {
            "category": str,        # one of the valid Category enum values
            "department": str,      # human-readable department name
            "urgency_score": int,   # 1-10
            "confidence": float,    # 0-1
            "is_out_of_scope": bool,
            "rejection_reason": str | None
        }
        """
        raise NotImplementedError

    @abstractmethod
    def get_embedding(self, text: str) -> List[float]:
        """Returns a vector embedding for semantic similarity search."""
        raise NotImplementedError

    @abstractmethod
    def score_urgency(self, text: str) -> int:
        """Returns an urgency score 1-10."""
        raise NotImplementedError

    @abstractmethod
    def is_out_of_scope(self, text: str) -> bool:
        """Returns True if the complaint isn't a valid civic grievance."""
        raise NotImplementedError
