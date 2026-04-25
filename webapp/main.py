import base64
from io import BytesIO
from typing import Dict, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image


face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def read_upload_as_cv(file: UploadFile) -> np.ndarray:
    data = file.file.read()
    arr = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image file.")
    return image


def apply_operation(cv_img: np.ndarray, operation: str) -> np.ndarray:
    if operation == "Grayscale":
        gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if operation == "Histogram Equalization":
        ycrcb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2YCrCb)
        ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
        return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
    if operation == "Gaussian Blur":
        return cv2.GaussianBlur(cv_img, (7, 7), 0)
    if operation == "Sharpen":
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        return cv2.filter2D(cv_img, -1, kernel)
    if operation == "Edge Detection":
        gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    return cv_img.copy()


def analyze_features(cv_img: np.ndarray) -> Dict:
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2HSV)
    rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)

    brightness = gray.mean() / 255.0
    saturation = hsv[:, :, 1].mean() / 255.0
    contrast = gray.std() / 255.0
    colorfulness = (rgb[:, :, 0].std() + rgb[:, :, 1].std() + rgb[:, :, 2].std()) / (3 * 255.0)

    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    return {
        "brightness": float(brightness),
        "saturation": float(saturation),
        "contrast": float(contrast),
        "colorfulness": float(colorfulness),
        "faces": {"count": int(len(faces)), "detected": len(faces) > 0},
    }


def compare_images(features_a: Dict, features_b: Dict) -> Tuple[Dict, int, int]:
    comparison = {}
    score_a = 0
    score_b = 0

    for metric in ["brightness", "saturation", "contrast", "colorfulness"]:
        if features_a[metric] > features_b[metric]:
            comparison[metric] = "A"
            score_a += 1
        elif features_b[metric] > features_a[metric]:
            comparison[metric] = "B"
            score_b += 1
        else:
            comparison[metric] = "Equal"

    if features_a["faces"]["count"] > features_b["faces"]["count"]:
        comparison["faces"] = "A"
        score_a += 1
    elif features_b["faces"]["count"] > features_a["faces"]["count"]:
        comparison["faces"] = "B"
        score_b += 1
    else:
        comparison["faces"] = "Equal"

    return comparison, score_a, score_b


def build_recommendations(features_a: Dict, features_b: Dict, score_a: int, score_b: int) -> Dict:
    if score_a > score_b:
        winner = "A"
    elif score_b > score_a:
        winner = "B"
    else:
        winner = "Tie"

    visual_index_a = (
        0.30 * features_a["brightness"]
        + 0.25 * features_a["saturation"]
        + 0.25 * features_a["contrast"]
        + 0.20 * features_a["colorfulness"]
    )
    visual_index_b = (
        0.30 * features_b["brightness"]
        + 0.25 * features_b["saturation"]
        + 0.25 * features_b["contrast"]
        + 0.20 * features_b["colorfulness"]
    )

    score_total = max(score_a + score_b, 1)
    win_rate_a = (score_a / score_total) * 100
    win_rate_b = (score_b / score_total) * 100

    insights = [
        f"Brightness lift (A-B): {features_a['brightness'] - features_b['brightness']:+.3f}",
        f"Saturation lift (A-B): {features_a['saturation'] - features_b['saturation']:+.3f}",
        f"Contrast lift (A-B): {features_a['contrast'] - features_b['contrast']:+.3f}",
        f"Colorfulness lift (A-B): {features_a['colorfulness'] - features_b['colorfulness']:+.3f}",
        f"Visual Impact Index: A {visual_index_a:.3f} vs B {visual_index_b:.3f}",
        f"Feature win rate: A {win_rate_a:.1f}% vs B {win_rate_b:.1f}%",
        f"Subject count: A {features_a['faces']['count']} vs B {features_b['faces']['count']}",
    ]

    return {
        "winner": winner,
        "score_a": score_a,
        "score_b": score_b,
        "visual_index_a": round(visual_index_a, 3),
        "visual_index_b": round(visual_index_b, 3),
        "insights": insights,
    }


def cv_to_data_url(cv_img: np.ndarray) -> str:
    rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    buffer = BytesIO()
    pil_img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


app = FastAPI(title="AB Tester Web API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="webapp/static"), name="static")


@app.get("/")
def index():
    return FileResponse("webapp/static/index.html")


@app.post("/api/analyze")
def analyze(
    image_a: UploadFile = File(...),
    image_b: UploadFile = File(...),
    operation_a: str = Form("Original"),
    operation_b: str = Form("Original"),
):
    cv_a = read_upload_as_cv(image_a)
    cv_b = read_upload_as_cv(image_b)

    processed_a = apply_operation(cv_a, operation_a)
    processed_b = apply_operation(cv_b, operation_b)

    features_a = analyze_features(processed_a)
    features_b = analyze_features(processed_b)

    comparison, score_a, score_b = compare_images(features_a, features_b)
    summary = build_recommendations(features_a, features_b, score_a, score_b)

    return {
        "operations": {"a": operation_a, "b": operation_b},
        "processed_images": {"a": cv_to_data_url(processed_a), "b": cv_to_data_url(processed_b)},
        "features": {"a": features_a, "b": features_b},
        "comparison": comparison,
        "summary": summary,
    }
