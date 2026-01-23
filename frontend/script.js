/* -------------------------------------------------
   MERMAID
------------------------------------------------- */
mermaid.initialize({ startOnLoad: false });

/* -------------------------------------------------
   STATE
------------------------------------------------- */
let workflow = { steps: [] };
let history = [];
let future = [];

/* -------------------------------------------------
   HELPERS
------------------------------------------------- */
function nextId() {
  return Math.max(0, ...workflow.steps.map(s => s.id)) + 1;
}

function snapshot() {
  history.push(JSON.parse(JSON.stringify(workflow)));
  future.length = 0;
}

/* -------------------------------------------------
   RENDER
------------------------------------------------- */
function workflowToMermaid() {
  const lines = ["graph TD"];

  for (const s of workflow.steps) {
    const id = `S${s.id}`;
    const label = s.text.replace(/"/g, "'");
    if (s.type === "decision") {
      lines.push(`  ${id}{"${label}"}`);
      if (s.branches?.yes) lines.push(`  ${id} -- Yes --> S${s.branches.yes}`);
      if (s.branches?.no) lines.push(`  ${id} -- No --> S${s.branches.no}`);
    } else {
      lines.push(`  ${id}["${label}"]`);
      if (s.next) lines.push(`  ${id} --> S${s.next}`);
    }
  }
  return lines.join("\n");
}

async function render() {
  const { svg } = await mermaid.render("graph", workflowToMermaid());
  document.getElementById("diagram").innerHTML = svg;
}

/* -------------------------------------------------
   SUBMIT (GRAPH-AWARE)
------------------------------------------------- */
async function submit(task) {
  snapshot();

  const res = await fetch("http://127.0.0.1:8000/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      current_workflow: workflow
    })
  });

  const data = await res.json();
  if (!Array.isArray(data.steps)) return;

  const idMap = new Map();

  // 1️⃣ Add new steps
  for (const raw of data.steps) {
    const newId = nextId();
    idMap.set(raw.id, newId);

    workflow.steps.push({
      id: newId,
      text: raw.text,
      type: raw.type,
      approval: !!raw.approval,
      next: null,
      branches: null
    });
  }

  // 2️⃣ Wire edges
  const offset = workflow.steps.length - data.steps.length;

  data.steps.forEach((raw, i) => {
    const step = workflow.steps[offset + i];

    if (raw.next != null) {
      step.next = idMap.get(raw.next) ?? raw.next;
    }

    if (raw.branches) {
      step.branches = {
        yes: idMap.get(raw.branches.yes) ?? raw.branches.yes,
        no: idMap.get(raw.branches.no) ?? raw.branches.no
      };
    }
  });

  await render();
}
