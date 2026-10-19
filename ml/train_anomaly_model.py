import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent
CSV_PATH = "mushroom_esp32.csv"
MODEL_PATH = ROOT / "oyster_anomaly_model.joblib"
REPORT_PATH = ROOT / "training_report.json"

FEATURES = ["temperature_C", "humidity_percent", "co2_ppm"]

def main():
    df = pd.read_csv(CSV_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    X = df[FEATURES].copy()

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("model", IsolationForest(
            n_estimators=200,
            contamination=0.05,
            random_state=42,
            n_jobs=-1
        )),
    ])

    pipeline.fit(X)
    preds = pipeline.predict(X)

    artifact = {
        "pipeline": pipeline,
        "features": FEATURES,
        "training_rows": int(len(df)),
        "anomaly_count": int((preds == -1).sum()),
        "anomaly_rate": float((preds == -1).mean()),
        "feature_ranges": {
            c: {
                "min": float(df[c].min()),
                "p05": float(df[c].quantile(.05)),
                "median": float(df[c].median()),
                "p95": float(df[c].quantile(.95)),
                "max": float(df[c].max()),
            }
            for c in FEATURES
        },
    }

    joblib.dump(artifact, MODEL_PATH)
    REPORT_PATH.write_text(json.dumps({
        "training_rows": artifact["training_rows"],
        "anomaly_count": artifact["anomaly_count"],
        "anomaly_rate": artifact["anomaly_rate"],
        "feature_ranges": artifact["feature_ranges"],
    }, indent=2))

    print(f"Saved model to: {MODEL_PATH}")
    print(f"Anomalies found in training set: {artifact['anomaly_count']} / {artifact['training_rows']}")

if __name__ == "__main__":
    main()
