// Mermaid setup
mermaid.initialize({ startOnLoad: false });

// DOM elements
const generateBtn = document.getElementById("generateBtn");
const newWorkflowBtn = document.getElementById("newWorkflowBtn");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");

const input = document.getElementById("taskInput");
const status = document.getElementById("status");
const diagramEl = document.getElementById("diagram");

// State
let lastWorkflow = null;
let activeRequestId = 0;

/* -------------------------------------------------
   STEPS → CANONICAL MERMAID
------------------------------------------------- */
function stepsToMermaid(steps) {
  const lines = [];
  lines.push("graph TD");

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
   WORKFLOW ACTIONS
------------------------------------------------- */
async function generateWorkflow() {
  const task = input.value.trim();
  if (!task) return;

  const requestId = ++activeRequestId;

  status.textContent = "Planning workflow...";
  diagramEl.innerHTML = "";
  lastWorkflow = null;

  try {
    const res = await fetch("http://127.0.0.1:8000/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task })
    });

    if (!res.ok) throw new Error("Backend error");

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Ignore stale responses after New Workflow
    if (requestId !== activeRequestId) return;

    lastWorkflow = data.steps;
    status.textContent = `Generated ${lastWorkflow.length} steps`;

    exportMdBtn.disabled = false;
    exportJsonBtn.disabled = false;

    await renderMermaid(stepsToMermaid(lastWorkflow));
  } catch (err) {
    if (requestId !== activeRequestId) return;
    status.textContent = "Error";
    diagramEl.textContent = err.message;
  }
}

function newWorkflow() {
  // Invalidate any in-flight requests
  activeRequestId++;

  // Reset state
  lastWorkflow = null;

  // Clear UI
  input.value = "";
  diagramEl.innerHTML = "";
  status.textContent = "New workflow started";

  // Disable exports until new generation
  exportMdBtn.disabled = true;
  exportJsonBtn.disabled = true;
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
generateBtn.onclick = generateWorkflow;
newWorkflowBtn.onclick = newWorkflow;

/* -------------------------------------------------
   INIT
------------------------------------------------- */
exportMdBtn.disabled = true;
exportJsonBtn.disabled = true;
