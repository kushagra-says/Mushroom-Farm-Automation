from pathlib import Path
import joblib
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "oyster_anomaly_model.joblib"
PUBLIC_HTML = ROOT / "public"

artifact = joblib.load(MODEL_PATH)
pipeline = artifact["pipeline"]
features = artifact["features"]
feature_ranges = artifact["feature_ranges"]

app = Flask(__name__, static_folder=str(PUBLIC_HTML), static_url_path="")
CORS(app)

def explain_row(row: dict):
    notes = []

    temp = float(row["temperature_C"])
    hum = float(row["humidity_percent"])
    co2 = float(row["co2_ppm"])

    tr = feature_ranges["temperature_C"]
    hr = feature_ranges["humidity_percent"]
    cr = feature_ranges["co2_ppm"]

    if temp < tr["p05"] or temp > tr["p95"]:
        notes.append("Temperature is outside the usual training range.")
    if hum < hr["p05"] or hum > hr["p95"]:
        notes.append("Humidity is outside the usual training range.")
    if co2 < cr["p05"] or co2 > cr["p95"]:
        notes.append("CO₂ is outside the usual training range.")

    if not notes:
        notes.append("Pattern is close to normal training data.")
    return notes

@app.get("/")
def home():
    return send_from_directory(PUBLIC_HTML, "ml.html")

@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "model": "IsolationForest",
        "features": features,
        "training_rows": artifact["training_rows"],
        "anomaly_rate": artifact["anomaly_rate"],
    })

@app.post("/predict")
def predict():
    try:
        data = request.get_json(force=True)

        row = {
            "temperature_C": float(data["temperature_C"]),
            "humidity_percent": float(data["humidity_percent"]),
            "co2_ppm": float(data["co2_ppm"]),
        }

        df = pd.DataFrame([row])[features]
        pred = pipeline.predict(df)[0]              # 1 normal, -1 anomaly
        score = float(pipeline.decision_function(df)[0])

        result = {
            "prediction": "anomaly" if pred == -1 else "normal",
            "score": round(score, 6),
            "confidence": round(min(99.0, max(1.0, abs(score) * 100)), 2),
            "explanation": explain_row(row),
        }
        return jsonify(result)
    except KeyError as e:
        return jsonify({"error": f"Missing field: {str(e)}"}), 400
    except (TypeError, ValueError) as e:
        return jsonify({"error": f"Invalid value: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
