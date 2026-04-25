const imageAInput = document.getElementById("imageA");
const imageBInput = document.getElementById("imageB");
const previewA = document.getElementById("previewA");
const previewB = document.getElementById("previewB");
const processedA = document.getElementById("processedA");
const processedB = document.getElementById("processedB");
const operationA = document.getElementById("operationA");
const operationB = document.getElementById("operationB");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn = document.getElementById("resetBtn");
const resultCard = document.getElementById("resultCard");
const winnerText = document.getElementById("winnerText");
const scoreText = document.getElementById("scoreText");
const insightList = document.getElementById("insightList");

let chart;

function showPreview(input, imageEl) {
  const file = input.files[0];
  if (!file) {
    imageEl.removeAttribute("src");
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    imageEl.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

imageAInput.addEventListener("change", () => showPreview(imageAInput, previewA));
imageBInput.addEventListener("change", () => showPreview(imageBInput, previewB));

analyzeBtn.addEventListener("click", async () => {
  const fileA = imageAInput.files[0];
  const fileB = imageBInput.files[0];

  if (!fileA || !fileB) {
    alert("Please upload both Image A and Image B.");
    return;
  }

  const formData = new FormData();
  formData.append("image_a", fileA);
  formData.append("image_b", fileB);
  formData.append("operation_a", operationA.value);
  formData.append("operation_b", operationB.value);

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error("Failed to analyze images.");
    }
    const data = await res.json();
    renderResults(data);
  } catch (error) {
    alert(error.message);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Start Analysis";
  }
});

resetBtn.addEventListener("click", () => {
  imageAInput.value = "";
  imageBInput.value = "";
  operationA.value = "Original";
  operationB.value = "Original";
  previewA.removeAttribute("src");
  previewB.removeAttribute("src");
  processedA.removeAttribute("src");
  processedB.removeAttribute("src");
  resultCard.classList.add("hidden");
  insightList.innerHTML = "";
  if (chart) {
    chart.destroy();
    chart = null;
  }
});

function renderResults(data) {
  resultCard.classList.remove("hidden");
  const summary = data.summary;

  winnerText.textContent =
    summary.winner === "Tie"
      ? "Recommended Choice: Tie"
      : `Recommended Choice: Image ${summary.winner}`;
  scoreText.textContent = `Overall score A:B = ${summary.score_a}:${summary.score_b}`;

  processedA.src = data.processed_images.a;
  processedB.src = data.processed_images.b;

  insightList.innerHTML = "";
  summary.insights.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    insightList.appendChild(li);
  });

  drawChart(data.features.a, data.features.b);
}

function drawChart(featuresA, featuresB) {
  const ctx = document.getElementById("featureChart");
  const labels = ["Brightness", "Saturation", "Contrast", "Colorfulness"];
  const valuesA = [
    featuresA.brightness,
    featuresA.saturation,
    featuresA.contrast,
    featuresA.colorfulness,
  ];
  const valuesB = [
    featuresB.brightness,
    featuresB.saturation,
    featuresB.contrast,
    featuresB.colorfulness,
  ];

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Image A",
          data: valuesA,
          backgroundColor: "#0891b2",
          borderRadius: 6,
        },
        {
          label: "Image B",
          data: valuesB,
          backgroundColor: "#14b8a6",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
      },
      scales: {
        y: {
          min: 0,
          max: 1,
        },
      },
    },
  });
}
