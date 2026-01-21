from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import requests
import json
import re
import time

# -------------------------------------------------
# Environment
# -------------------------------------------------
load_dotenv()

API_KEY = os.getenv("FEATHERLESS_API_KEY")
API_URL = "https://api.featherless.ai/v1/chat/completions"

if not API_KEY:
    raise RuntimeError("FEATHERLESS_API_KEY not found in .env")

# -------------------------------------------------
# App
# -------------------------------------------------
app = FastAPI(title="VisualizationAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Request schema
# -------------------------------------------------
class PlanRequest(BaseModel):
    task: str

# -------------------------------------------------
# Prompt
# -------------------------------------------------
SYSTEM_PROMPT = """
You are a workflow planning system.

Break the task into a structured workflow that MAY include decisions.

RULES:
- Always return AT LEAST 3 steps
- Steps may be either:
  - action (single next step)
  - decision (if/else branching)
- Decision steps MUST have:
  - type: "decision"
  - branches: { "yes": <step id>, "no": <step id> }
- Action steps MUST have:
  - type: "action"
  - next: <step id> or null
- All step IDs must be unique integers
- Branches MUST eventually rejoin the flow
- Mark steps that require human approval

Output ONLY valid JSON.
No explanations. No markdown.

JSON format:
{
  "steps": [
    {
      "id": 1,
      "text": "string",
      "type": "action | decision",
      "approval": true | false,
      "next": number | null,
      "branches": { "yes": number, "no": number } | null
    }
  ]
}
"""

# -------------------------------------------------
# Helpers
# -------------------------------------------------
def extract_plan_json(text: str):
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and isinstance(obj.get("steps"), list):
            return obj
    except json.JSONDecodeError:
        pass

    candidates = re.findall(r"\{[\s\S]*?\}", text)
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict) and isinstance(obj.get("steps"), list):
                return obj
        except json.JSONDecodeError:
            continue

    raise ValueError("No valid plan JSON with 'steps' array found")

# -------------------------------------------------
# Routes
# -------------------------------------------------
@app.post("/plan")
def plan(req: PlanRequest):
    payload = {
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "temperature": 0.3,
        "max_tokens": 400,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""
Task:
{req.task}

Break this into a step-by-step workflow.
"""
            }
        ]
    }

    response = None

    # Retry once if Featherless is flaky
    for _ in range(2):
        try:
            response = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=60
            )
        except requests.RequestException as e:
            # Network / DNS / timeout error
            return {
                "error": "AI service unreachable",
                "details": str(e),
                "steps": []
            }

        if response.status_code != 503:
            break

        time.sleep(1)

    # 🔒 DO NOT CRASH ON AI FAILURE
    if response is None or response.status_code >= 500:
        return {
            "error": "AI service unavailable",
            "details": f"Upstream error {response.status_code if response else 'no response'}",
            "steps": []
        }

    # Handle non-200 cleanly
    if response.status_code != 200:
        return {
            "error": "AI request failed",
            "details": response.text,
            "steps": []
        }

    # Parse model output safely
    try:
        raw = response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return {
            "error": "Invalid AI response format",
            "details": str(e),
            "steps": []
        }

    try:
        return extract_plan_json(raw)
    except Exception as e:
        return {
            "error": "Failed to extract JSON",
            "details": str(e),
            "raw": raw,
            "steps": []
        }
