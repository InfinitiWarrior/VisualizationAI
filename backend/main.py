from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import requests
import json

# -------------------------------------------------
# Environment
# -------------------------------------------------
load_dotenv()

API_KEY = os.getenv("FEATHERLESS_API_KEY")
API_URL = "https://api.featherless.ai/v1/chat/completions"

if not API_KEY:
    raise RuntimeError("FEATHERLESS_API_KEY not found")

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
    current_workflow: dict | None = None
    anchor_step_id: int | None = None   # 👈 KEY IMPROVEMENT

# -------------------------------------------------
# System prompt
# -------------------------------------------------
SYSTEM_PROMPT = """
You are an AI that EDITS an existing workflow graph.

THE EXISTING WORKFLOW IS READ-ONLY.
You MUST NOT modify, delete, or repeat existing steps.

YOUR JOB:
- Add NEW steps only
- Attach them intentionally to the existing graph

ANCHOR RULES:
- If anchor_step_id is provided:
  - New steps MUST connect to that step
  - Use it as the entry point for new logic
  - Loops must originate from or return to the anchor
- Do NOT create free-floating subgraphs

ALLOWED:
- Sequential actions
- Decisions (if / else)
- Loops (branching back to existing steps)

RULES:
- Output ONLY valid JSON
- NO markdown, NO commentary
- New step IDs must be integers (temporary IDs are fine)
- Existing step IDs must be referenced exactly

FORMAT:
{
  "steps": [
    {
      "id": number,
      "text": "string",
      "type": "action | decision",
      "approval": boolean,
      "next": number | null,
      "branches": { "yes": number, "no": number } | null
    }
  ]
}
"""

# -------------------------------------------------
# JSON extraction (robust)
# -------------------------------------------------
def extract_json(text: str):
    if not text or not isinstance(text, str):
        raise ValueError("empty_output")

    text = text.strip()

    if text.startswith("```"):
        text = text.split("```", 1)[1]
        text = text.lstrip()
        if text.lower().startswith("json"):
            text = text[4:]
        if "```" in text:
            text = text.split("```", 1)[0]

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError("no_json_found")

    return json.loads(text[start:end + 1])

# -------------------------------------------------
# Route
# -------------------------------------------------
@app.post("/plan")
def plan(req: PlanRequest):
    current_workflow = req.current_workflow or {"steps": []}

    anchor_text = (
        f"\nAnchor step ID: {req.anchor_step_id}\n"
        if req.anchor_step_id is not None
        else "\nNo anchor step provided.\n"
    )

    payload = {
        "model": "Qwen/Qwen2.5-14B-Instruct",
        "temperature": 0.25,
        "max_tokens": 600,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""
User request:
{req.task}
{anchor_text}
Current workflow (READ ONLY):
{json.dumps(current_workflow, indent=2)}
"""
            }
        ]
    }

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
    except Exception as e:
        return {
            "error": "ai_unreachable",
            "details": str(e),
            "steps": []
        }

    if response.status_code != 200:
        return {
            "error": "ai_failed",
            "details": response.text,
            "steps": []
        }

    try:
        raw = response.json()["choices"][0]["message"]["content"]
        plan = extract_json(raw)

        if not isinstance(plan, dict) or "steps" not in plan:
            raise ValueError("invalid_schema")

        return plan

    except Exception as e:
        return {
            "error": "json_error",
            "details": str(e),
            "raw_preview": raw[:500],
            "steps": []
        }
