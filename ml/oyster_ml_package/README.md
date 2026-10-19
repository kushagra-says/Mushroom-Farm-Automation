# Oyster Mushroom ML Integration

## What this adds
- Trained anomaly detection model from `mushroom_esp32.csv`
- Flask API on port `8000`
- Separate `ml.html` dashboard for anomaly checks
- React button can open the ML dashboard in a new tab

## Data used
The CSV contains:
- `timestamp`
- `temperature_C`
- `humidity_percent`
- `co2_ppm`
- `growth_phase`

## Install
```bash
cd ml
pip install -r requirements.txt
```

## Train model
```bash
python train_anomaly_model.py
```

## Run API
```bash
python app.py
```

## Open ML page
Open:
`http://localhost:8000`

## React button to add
```jsx
<button onClick={() => window.open("http://localhost:8000", "_blank")}>
  Open ML Dashboard
</button>
```

## Important
Keep these running:
- React inventory app on port `3000`
- Flask ML API on port `8000`
