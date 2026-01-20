// Mermaid setup
mermaid.initialize({ startOnLoad: false });

// DOM elements
const generateBtn = document.getElementById("generateBtn");
const newWorkflowBtn = document.getElementById("newWorkflowBtn");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

const input = document.getElementById("taskInput");
const status = document.getElementById("status");
const diagramEl = document.getElementById("diagram");

// State
let lastWorkflow = null;
let isExtending = false;
let activeRequestId = 0;

// Undo / Redo state
let history = [];
let future = [];

/* -------------------------------------------------
   UNDO HELPERS
------------------------------------------------- */
function snapshot() {
  if (!lastWorkflow) return;
  history.push(JSON.parse(JSON.stringify(lastWorkflow)));
  future.length = 0;
  updateUndoButtons();
}

function undo() {
  if (!history.length) return;

  future.push(JSON.parse(JSON.stringify(lastWorkflow)));
  lastWorkflow = history.pop();

  status.textContent = "Undo";
  renderMermaid(stepsToMermaid(lastWorkflow));
  updateUndoButtons();
}

function redo() {
  if (!future.length) return;

  history.push(JSON.parse(JSON.stringify(lastWorkflow)));
  lastWorkflow = future.pop();

  status.textContent = "Redo";
  renderMermaid(stepsToMermaid(lastWorkflow));
  updateUndoButtons();
}

function updateUndoButtons() {
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = future.length === 0;
}

/* -------------------------------------------------
   STEPS → MERMAID
------------------------------------------------- */
function stepsToMermaid(steps) {
  const lines = ["graph TD"];

  steps.forEach((step, index) => {
    const id = `S${step.id}`;
    const label = step.text.replace(/"/g, "'");

    lines.push(`  ${id}["${label}"]`);

    if (index > 0) {
      lines.push(`  S${steps[index - 1].id} --> ${id}`);
    }
  });

  if (steps.some(s => s.approval)) {
    lines.push("");
    lines.push(
      "  classDef approval fill:#ffe4e1,stroke:#f87171,stroke-width:2px;"
    );
    steps
      .filter(s => s.approval)
      .forEach(s => lines.push(`  class S${s.id} approval;`));
  }

  return lines.join("\n");
}

/* -------------------------------------------------
   RENDER
------------------------------------------------- */
async function renderMermaid(source) {
  diagramEl.innerHTML = "";
  const { svg } = await mermaid.render("workflowDiagram", source);
  diagramEl.innerHTML = svg;
}

/* -------------------------------------------------
   SUBMIT (generate OR extend)
------------------------------------------------- */
async function submit() {
  const text = input.value.trim();
  if (!text) return;

  const requestId = ++activeRequestId;

  status.textContent = isExtending
    ? "Extending workflow..."
    : "Planning workflow...";

  try {
    const res = await fetch("http://127.0.0.1:8000/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: text,
        existing_steps: isExtending ? lastWorkflow : null
      })
    });

    if (!res.ok) throw new Error("Backend error");

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (requestId !== activeRequestId) return;

    // SNAPSHOT BEFORE MUTATION (UNDO SAFETY)
    if (lastWorkflow) snapshot();

    if (!isExtending) {
      // First submit → replace workflow
      lastWorkflow = data.steps;
      isExtending = true;
    } else {
      // Extend → append steps
      const offset = lastWorkflow.length;
      data.steps.forEach((s, i) => {
        lastWorkflow.push({
          ...s,
          id: offset + i + 1
        });
      });
    }

    input.value = "";
    status.textContent = `Workflow has ${lastWorkflow.length} steps`;

    exportMdBtn.disabled = false;
    exportJsonBtn.disabled = false;

    await renderMermaid(stepsToMermaid(lastWorkflow));
    updateUndoButtons();
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
  lastWorkflow = null;
  isExtending = false;

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
  if (!lastWorkflow) return;
  download(
    new Blob(
      [JSON.stringify({ steps: lastWorkflow }, null, 2)],
      { type: "application/json" }
    ),
    "workflow.json"
  );
};

exportMdBtn.onclick = () => {
  if (!lastWorkflow) return;

  let md = "# Workflow\n\n";
  lastWorkflow.forEach(s => {
    md += `- **${s.id}. ${s.text}**${
      s.approval ? " (approval required)" : ""
    }\n`;
  });

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
