const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Inventory API running" });
});


// ✅ CREATE
app.post("/inventory", async (req, res) => {
  try {
    const {
      product_name,
      quantity,
      price,
      expiry_date,
      batch_no,
      harvest_date,
      shelf_life_days,
      storage_temp,
      quality_grade,
    } = req.body;

    if (
      !product_name ||
      quantity === undefined ||
      price === undefined ||
      !expiry_date ||
      !batch_no ||
      !harvest_date ||
      shelf_life_days === undefined ||
      storage_temp === undefined ||
      !quality_grade
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const result = await pool.query(
      `INSERT INTO inventory 
      (product_name, quantity, price, expiry_date, batch_no, harvest_date, shelf_life_days, storage_temp, quality_grade)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        product_name,
        quantity,
        price,
        expiry_date,
        batch_no,
        harvest_date,
        shelf_life_days,
        storage_temp,
        quality_grade,
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to add item" });
  }
});


// ✅ READ
app.get("/inventory", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM inventory ORDER BY expiry_date ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch" });
  }
});


// ✅ UPDATE
app.put("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      product_name,
      quantity,
      price,
      expiry_date,
      batch_no,
      harvest_date,
      shelf_life_days,
      storage_temp,
      quality_grade,
    } = req.body;

    const result = await pool.query(
      `UPDATE inventory SET
        product_name=$1,
        quantity=$2,
        price=$3,
        expiry_date=$4,
        batch_no=$5,
        harvest_date=$6,
        shelf_life_days=$7,
        storage_temp=$8,
        quality_grade=$9
       WHERE id=$10 RETURNING *`,
      [
        product_name,
        quantity,
        price,
        expiry_date,
        batch_no,
        harvest_date,
        shelf_life_days,
        storage_temp,
        quality_grade,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to update" });
  }
});


// ✅ DELETE
app.delete("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM inventory WHERE id=$1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to delete" });
  }
});


app.listen(5000, () => {
  console.log("Server running on port 5000");
});