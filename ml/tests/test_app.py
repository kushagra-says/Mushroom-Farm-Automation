import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as ml_app  # noqa: E402


@pytest.fixture()
def client():
    ml_app.app.config.update(TESTING=True)
    with ml_app.app.test_client() as test_client:
        yield test_client


def predict(client, payload):
    return client.post("/predict", json=payload)


def test_health_reports_the_trained_model():
    with ml_app.app.test_client() as client:
        res = client.get("/health")

    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "ok"
    assert body["model"] == "IsolationForest"
    assert body["features"] == ["temperature_C", "humidity_percent", "co2_ppm"]
    assert body["training_rows"] == 1344
    assert 0 < body["anomaly_rate"] < 1


def test_predict_accepts_a_typical_reading(client):
    res = predict(
        client,
        {
            "temperature_C": 24.76,
            "humidity_percent": 89.98,
            "co2_ppm": 2339,
        },
    )

    assert res.status_code == 200
    body = res.get_json()
    assert body["prediction"] == "normal"
    assert isinstance(body["score"], float)
    assert 1 <= body["confidence"] <= 99
    assert isinstance(body["explanation"], list)


def test_predict_flags_a_clearly_abnormal_reading(client):
    res = predict(
        client,
        {
            "temperature_C": 40.0,
            "humidity_percent": 40.0,
            "co2_ppm": 12000,
        },
    )

    assert res.status_code == 200
    body = res.get_json()
    assert body["prediction"] == "anomaly"
    assert body["score"] < 0
    assert len(body["explanation"]) == 3


@pytest.mark.parametrize(
    "missing",
    ["temperature_C", "humidity_percent", "co2_ppm"],
)
def test_predict_rejects_a_missing_field(client, missing):
    payload = {
        "temperature_C": 24.8,
        "humidity_percent": 90.0,
        "co2_ppm": 2100,
    }
    del payload[missing]

    res = predict(client, payload)

    assert res.status_code == 400
    assert missing in res.get_json()["error"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("temperature_C", "not-a-number"),
        ("humidity_percent", None),
        ("co2_ppm", []),
    ],
)
def test_predict_rejects_a_non_numeric_value(client, field, value):
    payload = {
        "temperature_C": 24.8,
        "humidity_percent": 90.0,
        "co2_ppm": 2100,
        field: value,
    }

    res = predict(client, payload)

    assert res.status_code == 400
    assert res.get_json()["error"].startswith("Invalid value")


def test_predict_ignores_extra_fields(client):
    res = predict(
        client,
        {
            "temperature_C": 24.8,
            "humidity_percent": 90.0,
            "co2_ppm": 2100,
            "growth_phase": "fruiting",
            "unexpected": "ignored",
        },
    )

    assert res.status_code == 200
    assert res.get_json()["prediction"] in {"normal", "anomaly"}


def test_explain_row_reports_normal_data():
    notes = ml_app.explain_row(
        {
            "temperature_C": 24.8,
            "humidity_percent": 90.0,
            "co2_ppm": 2100,
        }
    )

    assert notes == ["Pattern is close to normal training data."]


@pytest.mark.parametrize(
    "row,expected",
    [
        (
            {"temperature_C": 40.0, "humidity_percent": 90.0, "co2_ppm": 2100},
            "Temperature",
        ),
        (
            {"temperature_C": 24.8, "humidity_percent": 40.0, "co2_ppm": 2100},
            "Humidity",
        ),
        (
            {"temperature_C": 24.8, "humidity_percent": 90.0, "co2_ppm": 12000},
            "CO₂",
        ),
    ],
)
def test_explain_row_names_each_out_of_range_feature(row, expected):
    notes = ml_app.explain_row(row)

    assert len(notes) == 1
    assert expected in notes[0]
