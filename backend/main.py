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

# Allow browser access (local dev / hackathon)
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

Break the task into MULTIPLE clear, ordered steps.

RULES:
- Always return AT LEAST 3 steps
- Each step must be a distinct user action
- Mark steps that require human approval
- Do NOT collapse the task into one step

Output ONLY valid JSON.
No explanations. No markdown. No <think> blocks.

JSON format:
{
  "steps": [
    { "id": 1, "text": "string", "approval": true | false }
  ]
}
"""

# -------------------------------------------------
# Helpers
# -------------------------------------------------
def extract_plan_json(text: str):
    """
    First try to parse the entire response as JSON.
    If that fails, fall back to searching for a JSON object
    that contains a top-level 'steps' array.
    """

    #Try direct parse (BEST CASE)
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "steps" in obj and isinstance(obj["steps"], list):
            return obj
    except json.JSONDecodeError:
        pass

    #Fallback: search for embedded JSON blocks
    candidates = re.findall(r"\{[\s\S]*?\}", text)

    for candidate in candidates:
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict) and "steps" in obj and isinstance(obj["steps"], list):
                return obj
        except json.JSONDecodeError:
            continue

    raise ValueError("No valid plan JSON with 'steps' array found")


# -------------------------------------------------
# Routes
# -------------------------------------------------
@app.post("/plan")
def plan(req: PlanRequest):
    task = req.task

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
{task}

Break this into a step-by-step workflow.
"""
            }
        ]
    }

    # Retry once if Featherless is flaky
    for _ in range(2):
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=60
        )

        if response.status_code != 503:
            break

        time.sleep(1)

    response.raise_for_status()

    raw = response.json()["choices"][0]["message"]["content"]

    try:
        return extract_plan_json(raw)
    except Exception as e:
        return {
            "error": "Failed to extract JSON",
            "details": str(e),
            "raw": raw
        }
