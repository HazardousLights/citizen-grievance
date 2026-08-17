"""
ai_service/gemini_client.py
Concrete Gemini-backed implementation of BaseAIClient.

Design notes:
- classify_grievance asks Gemini for strict JSON output, which we parse
  defensively (JSON responses from LLMs occasionally include stray text).
- If GEMINI_API_KEY is missing or any call fails, we fall back to a simple
  keyword-based heuristic so the app keeps working in dev/demo environments
  instead of hard-crashing on every request.
"""
import json
import logging
import re
from typing import List, Dict, Any

import google.generativeai as genai

from config import settings
from ai_service.base_client import BaseAIClient

logger = logging.getLogger("grievance_app.ai_service")

VALID_CATEGORIES = [
    "water_supply", "electricity", "roads", "sanitation",
    "public_safety", "street_lights", "garbage_waste", "out_of_scope",
]

DEPARTMENT_MAP = {
    "water_supply": "Water Supply Department",
    "electricity": "Electricity Board",
    "roads": "Public Works Department (Roads)",
    "sanitation": "Sanitation Department",
    "public_safety": "Public Safety / Municipal Enforcement",
    "street_lights": "Electricity Board (Street Lighting)",
    "garbage_waste": "Solid Waste Management",
    "out_of_scope": "N/A",
}

OUT_OF_SCOPE_HINTS = {
    "theft": "This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.",
    "assault": "This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.",
    "robbery": "This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.",
    "job": "This looks like an employment request. Please contact your local employment exchange.",
    "employment": "This looks like an employment request. Please contact your local employment exchange.",
    "vacancy": "This looks like an employment request. Please contact your local employment exchange.",
    "election": "Political opinions aren't actionable civic grievances.",
    "vote": "Political opinions aren't actionable civic grievances.",
    "property dispute": "This looks like a private property dispute. Please consult a civil court or lawyer.",
    "land dispute": "This looks like a private property dispute. Please consult a civil court or lawyer.",
}

CLASSIFY_PROMPT = """You are a civic grievance triage assistant for a municipal government portal.
Classify the following citizen complaint STRICTLY as JSON with this exact shape and nothing else:

{{
  "category": one of {categories},
  "urgency_score": integer 1-10 (10 = life-threatening/emergency, 1 = minor cosmetic issue),
  "confidence": float 0-1,
  "is_out_of_scope": boolean,
  "rejection_reason": string or null (only if is_out_of_scope is true, explain briefly and suggest where to go instead)
}}

Rules:
- out_of_scope covers: personal crimes (theft/assault), employment requests, political opinions,
  private property disputes, spam, or anything not a civic infrastructure/service issue.
- Base urgency on safety risk, number of people affected, and severity described.
- Respond with ONLY the JSON object, no markdown fences, no extra text.

Complaint: "{text}"
"""


class GeminiAIClient(BaseAIClient):
    def __init__(self):
        self.enabled = bool(settings.GEMINI_API_KEY)
        if self.enabled:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
        else:
            self.model = None
            logger.warning("GeminiAIClient running in fallback/mock mode (no API key).")

    # ---------- Public interface ----------

    def classify_grievance(self, text: str, image_url: str = None) -> Dict[str, Any]:
        if not self.enabled:
            return self._fallback_classify(text)

        try:
            prompt = CLASSIFY_PROMPT.format(categories=VALID_CATEGORIES, text=text.replace('"', "'"))
            response = self.model.generate_content(prompt)
            parsed = self._parse_json_response(response.text)

            category = parsed.get("category") if parsed.get("category") in VALID_CATEGORIES else "out_of_scope"
            urgency = int(parsed.get("urgency_score", 1))
            urgency = max(1, min(10, urgency))

            return {
                "category": category,
                "department": DEPARTMENT_MAP.get(category, "General Municipal Office"),
                "urgency_score": urgency,
                "confidence": float(parsed.get("confidence", 0.5)),
                "is_out_of_scope": bool(parsed.get("is_out_of_scope", category == "out_of_scope")),
                "rejection_reason": parsed.get("rejection_reason"),
            }
        except Exception as exc:
            logger.error(f"Gemini classification failed, using fallback: {exc}")
            return self._fallback_classify(text)

    def get_embedding(self, text: str) -> List[float]:
        if not self.enabled:
            return self._fallback_embedding(text)
        try:
            result = genai.embed_content(model=settings.GEMINI_EMBEDDING_MODEL, content=text)
            return result["embedding"]
        except Exception as exc:
            logger.error(f"Gemini embedding failed, using fallback: {exc}")
            return self._fallback_embedding(text)

    def score_urgency(self, text: str) -> int:
        return self.classify_grievance(text).get("urgency_score", 1)

    def is_out_of_scope(self, text: str) -> bool:
        return self.classify_grievance(text).get("is_out_of_scope", False)

    # ---------- Helpers ----------

    @staticmethod
    def _parse_json_response(raw_text: str) -> Dict[str, Any]:
        """Strip markdown fences etc. and parse JSON defensively."""
        cleaned = raw_text.strip()
        cleaned = re.sub(r"^```(json)?|```$", "", cleaned, flags=re.MULTILINE).strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in AI response")
        return json.loads(match.group(0))

    @staticmethod
    def _fallback_classify(text: str) -> Dict[str, Any]:
        """Keyword-based heuristic used when Gemini is unavailable or errors out."""
        lower = text.lower()

        for keyword, reason in OUT_OF_SCOPE_HINTS.items():
            if keyword in lower:
                return {
                    "category": "out_of_scope",
                    "department": "N/A",
                    "urgency_score": 1,
                    "confidence": 0.6,
                    "is_out_of_scope": True,
                    "rejection_reason": reason,
                }

        keyword_map = {
            "water_supply": ["water", "leak", "pipe", "tap", "supply"],
            "electricity": ["power", "electricity", "transformer", "outage", "wire"],
            "roads": ["pothole", "road", "footpath", "pavement"],
            "sanitation": ["sewage", "drain", "toilet", "sanitation"],
            "street_lights": ["street light", "streetlight", "lamp post"],
            "garbage_waste": ["garbage", "trash", "waste", "dump"],
            "public_safety": ["accident", "danger", "unsafe", "fire hazard"],
        }
        urgent_words = ["emergency", "urgent", "danger", "fire", "collapse", "injured", "flooding"]

        category = "out_of_scope"
        for cat, words in keyword_map.items():
            if any(w in lower for w in words):
                category = cat
                break

        if category == "out_of_scope":
            return {
                "category": "out_of_scope",
                "department": "N/A",
                "urgency_score": 1,
                "confidence": 0.3,
                "is_out_of_scope": True,
                "rejection_reason": "Could not confidently match this to a civic service category. "
                                     "Please rephrase with more detail (location, issue type).",
            }

        urgency = 7 if any(w in lower for w in urgent_words) else 4
        return {
            "category": category,
            "department": DEPARTMENT_MAP[category],
            "urgency_score": urgency,
            "confidence": 0.5,
            "is_out_of_scope": False,
            "rejection_reason": None,
        }

    @staticmethod
    def _fallback_embedding(text: str, dims: int = 768) -> List[float]:
        """
        Deterministic pseudo-embedding (hash-based) so duplicate detection
        still functions in a degraded way without a real embedding API.
        NOT semantically meaningful — replace with a real model in production.
        """
        import hashlib
        h = hashlib.sha256(text.lower().encode()).digest()
        vec = [(b / 255.0) for b in h]
        while len(vec) < dims:
            vec += vec
        return vec[:dims]


# Singleton instance used across the app
ai_client = GeminiAIClient()
