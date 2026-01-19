mermaid.initialize({ startOnLoad: false });

const generateBtn = document.getElementById("generateBtn");
const diagramDiv = document.getElementById("diagram");
const stepsList = document.getElementById("steps");

generateBtn.addEventListener("click", () => {
  // Fake structured response (this WILL come from backend later)
  const response = {
    steps: [
      { id: 1, text: "Open dashboard", approval: false },
      { id: 2, text: "Find active ticket", approval: false },
      { id: 3, text: "Read required permissions", approval: false },
      { id: 4, text: "Request access", approval: true }
    ]
  };

  const mermaidCode = buildMermaidFromSteps(response.steps);

  renderDiagram(mermaidCode);
  renderSteps(response.steps);
});

function buildMermaidFromSteps(steps) {
  let lines = ["graph TD"];

  // Create nodes
  steps.forEach((step, index) => {
    const nodeId = `S${index}`;
    const label = step.approval
      ? `${step.text} `
      : step.text;

    lines.push(`${nodeId}["${label}"]`);
  });

  // Create edges
  for (let i = 0; i < steps.length - 1; i++) {
    lines.push(`S${i} --> S${i + 1}`);
  }

  return lines.join("\n");
}

function renderDiagram(mermaidCode) {
  diagramDiv.innerHTML = mermaidCode;
  mermaid.init(undefined, diagramDiv);
}

function renderSteps(steps) {
    stepsList.innerHTML = "";

    if (step.approval) {
        li.classList.add("approval");
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Approval required";
        li.appendChild(badge);
    }

    steps.forEach(step => {
        const li = document.createElement("li");
        li.textContent = step.text;

        if (step.approval) {
            li.classList.add("approval");
        }

        stepsList.appendChild(li);
    });
}

