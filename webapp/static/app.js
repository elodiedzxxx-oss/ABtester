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
const state = {
  imageA: null,
  imageB: null,
};
const PLACEHOLDER_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='420'>" +
      "<defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%23dff9fb'/>" +
      "<stop offset='1' stop-color='%23ccfbf1'/></linearGradient></defs>" +
      "<rect width='100%' height='100%' fill='url(%23g)'/>" +
      "<text x='50%' y='48%' text-anchor='middle' font-family='Nunito, sans-serif' font-size='28' fill='%230f766e'>✨ Preview Area</text>" +
      "<text x='50%' y='58%' text-anchor='middle' font-family='Nunito, sans-serif' font-size='18' fill='%230f766e'>Upload image to see styled preview</text>" +
    "</svg>"
  );

function setImageState(imageEl, src, isEmpty = false) {
  imageEl.src = src;
  if (isEmpty) imageEl.classList.add("is-empty");
  else imageEl.classList.remove("is-empty");
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function imageDataToDataUrl(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function fileToImageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h));
      };
      img.onerror = () => reject(new Error("Invalid image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function showPreview(input, imageEl, key) {
  const file = input.files[0];
  if (!file) {
    setImageState(imageEl, PLACEHOLDER_DATA_URL, true);
    state[key] = null;
    return;
  }
  fileToImageData(file)
    .then((imageData) => {
      state[key] = imageData;
      setImageState(imageEl, imageDataToDataUrl(imageData), false);
    })
    .catch((err) => alert(err.message));
}

function applyOperation(original, operation) {
  const out = cloneImageData(original);
  const data = out.data;

  if (operation === "Original") return out;

  if (operation === "Grayscale") {
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
    }
    return out;
  }

  if (operation === "Histogram Equalization") {
    const lum = new Uint8Array((data.length / 4) | 0);
    const hist = new Array(256).fill(0);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      lum[p] = y;
      hist[y]++;
    }
    let cdf = 0;
    const map = new Array(256).fill(0);
    const total = lum.length;
    for (let i = 0; i < 256; i++) {
      cdf += hist[i];
      map[i] = Math.round((cdf / total) * 255);
    }
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const yOld = lum[p];
      const yNew = map[yOld];
      const ratio = yOld === 0 ? 0 : yNew / yOld;
      data[i] = Math.min(255, data[i] * ratio);
      data[i + 1] = Math.min(255, data[i + 1] * ratio);
      data[i + 2] = Math.min(255, data[i + 2] * ratio);
    }
    return out;
  }

  return convolve(out, operation);
}

function convolve(imageData, operation) {
  const kernels = {
    "Gaussian Blur": [1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16],
    Sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    "Edge Detection": [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  };

  const kernel = kernels[operation];
  if (!kernel) return imageData;

  const src = imageData.data;
  const out = cloneImageData(imageData);
  const dst = out.data;
  const w = imageData.width;
  const h = imageData.height;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
            sum += src[idx] * kernel[k++];
          }
        }
        const outIdx = (y * w + x) * 4 + c;
        dst[outIdx] = Math.max(0, Math.min(255, sum));
      }
    }
  }
  return out;
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  return { s };
}

function analyzeFeatures(imageData) {
  const d = imageData.data;
  let brightnessSum = 0;
  let satSum = 0;
  const gray = [];
  const rVals = [];
  const gVals = [];
  const bVals = [];

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    brightnessSum += y;
    gray.push(y);
    rVals.push(r);
    gVals.push(g);
    bVals.push(b);
    satSum += rgbToHsv(r, g, b).s;
  }

  const n = gray.length;
  const brightness = brightnessSum / n / 255;
  const saturation = satSum / n;
  const meanGray = brightnessSum / n;
  const variance = gray.reduce((acc, v) => acc + (v - meanGray) ** 2, 0) / n;
  const contrast = Math.sqrt(variance) / 255;

  const std = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
  };
  const colorfulness = (std(rVals) + std(gVals) + std(bVals)) / (3 * 255);

  return { brightness, saturation, contrast, colorfulness, faces: { count: 0, detected: false } };
}

function compareAndSummarize(featuresA, featuresB) {
  let scoreA = 0;
  let scoreB = 0;
  const metrics = ["brightness", "saturation", "contrast", "colorfulness"];
  for (const m of metrics) {
    if (featuresA[m] > featuresB[m]) scoreA++;
    else if (featuresB[m] > featuresA[m]) scoreB++;
  }
  const winner = scoreA === scoreB ? "Tie" : scoreA > scoreB ? "A" : "B";
  const visualIndexA =
    0.3 * featuresA.brightness +
    0.25 * featuresA.saturation +
    0.25 * featuresA.contrast +
    0.2 * featuresA.colorfulness;
  const visualIndexB =
    0.3 * featuresB.brightness +
    0.25 * featuresB.saturation +
    0.25 * featuresB.contrast +
    0.2 * featuresB.colorfulness;
  const total = Math.max(scoreA + scoreB, 1);
  const insights = [
    `Brightness lift (A-B): ${(featuresA.brightness - featuresB.brightness).toFixed(3)}`,
    `Saturation lift (A-B): ${(featuresA.saturation - featuresB.saturation).toFixed(3)}`,
    `Contrast lift (A-B): ${(featuresA.contrast - featuresB.contrast).toFixed(3)}`,
    `Colorfulness lift (A-B): ${(featuresA.colorfulness - featuresB.colorfulness).toFixed(3)}`,
    `Visual Impact Index: A ${visualIndexA.toFixed(3)} vs B ${visualIndexB.toFixed(3)}`,
    `Feature win rate: A ${((scoreA / total) * 100).toFixed(1)}% vs B ${((scoreB / total) * 100).toFixed(1)}%`,
    "Subject count (frontend mode): A 0 vs B 0 (face detection disabled in pure frontend version).",
  ];
  return { winner, scoreA, scoreB, insights };
}

function renderResults(processedDataA, processedDataB, featuresA, featuresB, summary) {
  resultCard.classList.remove("hidden");
  winnerText.textContent =
    summary.winner === "Tie" ? "Recommended Choice: Tie" : `Recommended Choice: Image ${summary.winner}`;
  scoreText.textContent = `Overall score A:B = ${summary.scoreA}:${summary.scoreB}`;
  setImageState(processedA, imageDataToDataUrl(processedDataA), false);
  setImageState(processedB, imageDataToDataUrl(processedDataB), false);
  insightList.innerHTML = "";
  summary.insights.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    insightList.appendChild(li);
  });
  drawChart(featuresA, featuresB);
}

function drawChart(featuresA, featuresB) {
  const ctx = document.getElementById("featureChart");
  const labels = ["Brightness", "Saturation", "Contrast", "Colorfulness"];
  const valuesA = [featuresA.brightness, featuresA.saturation, featuresA.contrast, featuresA.colorfulness];
  const valuesB = [featuresB.brightness, featuresB.saturation, featuresB.contrast, featuresB.colorfulness];

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Image A", data: valuesA, backgroundColor: "#0891b2", borderRadius: 6 },
        { label: "Image B", data: valuesB, backgroundColor: "#14b8a6", borderRadius: 6 },
      ],
    },
    options: { responsive: true, scales: { y: { min: 0, max: 1 } } },
  });
}

imageAInput.addEventListener("change", () => showPreview(imageAInput, previewA, "imageA"));
imageBInput.addEventListener("change", () => showPreview(imageBInput, previewB, "imageB"));

analyzeBtn.addEventListener("click", () => {
  if (!state.imageA || !state.imageB) {
    alert("Please upload both Image A and Image B.");
    return;
  }
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  setTimeout(() => {
    const processedDataA = applyOperation(state.imageA, operationA.value);
    const processedDataB = applyOperation(state.imageB, operationB.value);
    const featuresA = analyzeFeatures(processedDataA);
    const featuresB = analyzeFeatures(processedDataB);
    const summary = compareAndSummarize(featuresA, featuresB);
    renderResults(processedDataA, processedDataB, featuresA, featuresB, summary);
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Start Analysis";
  }, 20);
});

resetBtn.addEventListener("click", () => {
  imageAInput.value = "";
  imageBInput.value = "";
  operationA.value = "Original";
  operationB.value = "Original";
  setImageState(previewA, PLACEHOLDER_DATA_URL, true);
  setImageState(previewB, PLACEHOLDER_DATA_URL, true);
  setImageState(processedA, PLACEHOLDER_DATA_URL, true);
  setImageState(processedB, PLACEHOLDER_DATA_URL, true);
  state.imageA = null;
  state.imageB = null;
  resultCard.classList.add("hidden");
  insightList.innerHTML = "";
  if (chart) {
    chart.destroy();
    chart = null;
  }
});

setImageState(previewA, PLACEHOLDER_DATA_URL, true);
setImageState(previewB, PLACEHOLDER_DATA_URL, true);
setImageState(processedA, PLACEHOLDER_DATA_URL, true);
setImageState(processedB, PLACEHOLDER_DATA_URL, true);
