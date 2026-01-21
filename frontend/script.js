/* -------------------------------------------------
   MERMAID INIT
------------------------------------------------- */
mermaid.initialize({
  startOnLoad: false,
  flowchart: { curve: "basis" }
});

/* -------------------------------------------------
   DOM ELEMENTS
------------------------------------------------- */
const generateBtn = document.getElementById("generateBtn");
const newWorkflowBtn = document.getElementById("newWorkflowBtn");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

const input = document.getElementById("taskInput");
const status = document.getElementById("status");
const diagramEl = document.getElementById("diagram");

/* -------------------------------------------------
   STATE (FRONTEND IS SOURCE OF TRUTH)
------------------------------------------------- */
let workflow = { steps: [] };
let history = [];
let future = [];
let activeRequestId = 0;

/* -------------------------------------------------
   UNDO / REDO
------------------------------------------------- */
function snapshot() {
  history.push(JSON.parse(JSON.stringify(workflow)));
  future.length = 0;
  updateUndoButtons();
}

function undo() {
  if (!history.length) return;
  future.push(JSON.parse(JSON.stringify(workflow)));
  workflow = history.pop();
  render();
}

function redo() {
  if (!future.length) return;
  history.push(JSON.parse(JSON.stringify(workflow)));
  workflow = future.pop();
  render();
}

function updateUndoButtons() {
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = future.length === 0;
}

/* -------------------------------------------------
   ID SAFETY (AI CANNOT OVERWRITE)
------------------------------------------------- */
function nextId() {
  return (
    Math.max(0, ...workflow.steps.map(s => s.id)) + 1
  );
}

/* -------------------------------------------------
   WORKFLOW → MERMAID
------------------------------------------------- */
function workflowToMermaid() {
  const lines = ["graph TD"];

  for (const step of workflow.steps) {
    const id = `S${step.id}`;
    const label = step.text.replace(/"/g, "'");

    if (step.type === "decision") {
      lines.push(`  ${id}{"${label}"}`);

      if (step.branches?.yes)
        lines.push(`  ${id} -- Yes --> S${step.branches.yes}`);
      if (step.branches?.no)
        lines.push(`  ${id} -- No --> S${step.branches.no}`);
    } else {
      lines.push(`  ${id}["${label}"]`);

      if (step.next)
        lines.push(`  ${id} --> S${step.next}`);
    }
  }

  const approvals = workflow.steps.filter(s => s.approval);
  if (approvals.length) {
    lines.push("");
    lines.push(
      "  classDef approval fill:#fff1f2,stroke:#e11d48,stroke-width:2px;"
    );
    approvals.forEach(s =>
      lines.push(`  class S${s.id} approval;`)
    );
  }

  return lines.join("\n");
}

/* -------------------------------------------------
   RENDER
------------------------------------------------- */
async function render() {
  diagramEl.innerHTML = "";

  if (!workflow.steps.length) {
    status.textContent = "Empty workflow";
    exportMdBtn.disabled = true;
    exportJsonBtn.disabled = true;
    updateUndoButtons();
    return;
  }

  const source = workflowToMermaid();
  const { svg } = await mermaid.render(
    "workflowDiagram",
    source
  );
  diagramEl.innerHTML = svg;

  status.textContent = `Workflow has ${workflow.steps.length} steps`;
  exportMdBtn.disabled = false;
  exportJsonBtn.disabled = false;
  updateUndoButtons();
}

/* -------------------------------------------------
   SUBMIT (APPEND-ONLY AI SUGGESTIONS)
------------------------------------------------- */
async function submit() {
  const text = input.value.trim();
  if (!text) return;

  const requestId = ++activeRequestId;
  status.textContent = "AI suggesting additions...";

  try {
    const res = await fetch("http://127.0.0.1:8000/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: text })
    });

    if (!res.ok) throw new Error("Backend error");

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (requestId !== activeRequestId) return;

    if (!Array.isArray(data.steps)) {
      status.textContent = "No valid steps returned";
      return;
    }

    snapshot();

    // 🔒 HARD GUARANTEE: AI CANNOT OVERWRITE
    for (const raw of data.steps) {
      const step = {
        id: nextId(),               // frontend owns IDs
        text: raw.text ?? "New step",
        type: raw.type ?? "action",
        approval: !!raw.approval,
        next: raw.next ?? null,
        branches: raw.branches ?? null
      };

      workflow.steps.push(step);
    }

    input.value = "";
    await render();

  } catch (err) {
    if (requestId !== activeRequestId) return;
    status.textContent = "Error";
    diagramEl.textContent = err.message;
  }
}

/* -------------------------------------------------
   NEW WORKFLOW
------------------------------------------------- */
function newWorkflow() {
  activeRequestId++;
  workflow = { steps: [] };
  history = [];
  future = [];

  input.value = "";
  diagramEl.innerHTML = "";
  status.textContent = "New workflow started";

  exportMdBtn.disabled = true;
  exportJsonBtn.disabled = true;
  updateUndoButtons();
}

/* -------------------------------------------------
   EXPORTS
------------------------------------------------- */
function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

exportJsonBtn.onclick = () => {
  download(
    new Blob(
      [JSON.stringify(workflow, null, 2)],
      { type: "application/json" }
    ),
    "workflow.json"
  );
};

exportMdBtn.onclick = () => {
  let md = "# Workflow\n\n";
  for (const s of workflow.steps) {
    md += `- **${s.id}. ${s.text}**`;
    if (s.type === "decision") md += " _(decision)_";
    if (s.approval) md += " _(approval required)_";
    md += "\n";
  }

  download(
    new Blob([md], { type: "text/markdown" }),
    "workflow.md"
  );
};

/* -------------------------------------------------
   EVENTS
------------------------------------------------- */
generateBtn.onclick = submit;
newWorkflowBtn.onclick = newWorkflow;
undoBtn.onclick = undo;
redoBtn.onclick = redo;

/* -------------------------------------------------
   INIT
------------------------------------------------- */
exportMdBtn.disabled = true;
exportJsonBtn.disabled = true;
updateUndoButtons();
