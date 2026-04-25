# Web Version Notes

## Run Locally

1. Install dependencies:

```bash
pip install -r requirements-web.txt
```

2. Start server:

```bash
uvicorn webapp.main:app --reload --host 0.0.0.0 --port 8000
```

3. Open:
- Desktop: `http://localhost:8000`
- Mobile (same Wi-Fi): `http://<your-lan-ip>:8000`

---

## API

- `POST /api/analyze`
  - multipart fields:
    - `image_a` (file)
    - `image_b` (file)
    - `operation_a` (string)
    - `operation_b` (string)
  - returns JSON with:
    - processed image previews (base64)
    - extracted features
    - comparison result
    - recommendation summary

---

## Can This Be Deployed on Vercel?

Yes, but with caveats:

- Vercel works best for frontend/static hosting and lightweight serverless functions.
- This project uses OpenCV (large dependency), so cold starts and package size can be an issue on Vercel serverless.

Recommended production setup:
- **Frontend on Vercel** (beautiful UI, CDN delivery)
- **Python API on Render/Railway/Fly.io** (better for OpenCV workloads)

If you still want all-in Vercel:
- It is technically possible with Python serverless functions, but reliability/performance may vary.

