const request = require("supertest");
const { createApp } = require("../../app");

const VALID_BODY = {
  product_name: "Oyster Mushrooms",
  quantity: 10,
  price: 180.5,
  expiry_date: "2026-11-15",
  batch_no: "BATCH-001",
  harvest_date: "2026-10-20",
  shelf_life_days: 26,
  storage_temp: 4,
  quality_grade: "A",
};

const REQUIRED_FIELDS = [
  "product_name",
  "quantity",
  "price",
  "expiry_date",
  "batch_no",
  "harvest_date",
  "shelf_life_days",
  "storage_temp",
  "quality_grade",
];

const REQUIRED_STRINGS = [
  "product_name",
  "expiry_date",
  "batch_no",
  "harvest_date",
  "quality_grade",
];

function makeItem(overrides = {}) {
  return {
    id: 1,
    ...VALID_BODY,
    created_at: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeApp() {
  const pool = { query: jest.fn() };
  return { app: createApp(pool), pool };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /", () => {
  test("reports the API is running", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Inventory API running" });
  });
});

describe("GET /inventory", () => {
  test("returns every row ordered by expiry date", async () => {
    const { app, pool } = makeApp();
    const rows = [
      makeItem({ id: 1, expiry_date: "2026-11-15" }),
      makeItem({ id: 2, expiry_date: "2026-10-25" }),
    ];
    pool.query.mockResolvedValue({ rows });

    const res = await request(app).get("/inventory");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SELECT * FROM inventory");
    expect(sql).toContain("ORDER BY expiry_date ASC");
    expect(params).toBeUndefined();
  });

  test("returns an empty array when there is no inventory", async () => {
    const { app, pool } = makeApp();
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get("/inventory");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("maps a database failure to a 500", async () => {
    const { app, pool } = makeApp();
    pool.query.mockRejectedValue(new Error("db down"));

    const res = await request(app).get("/inventory");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch" });
    expect(console.error).toHaveBeenCalledWith("db down");
  });
});

describe("POST /inventory", () => {
  test("inserts all nine fields and returns the created row", async () => {
    const { app, pool } = makeApp();
    const created = makeItem({ id: 7 });
    pool.query.mockResolvedValue({ rows: [created] });

    const res = await request(app).post("/inventory").send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO inventory");
    expect(params).toEqual([
      VALID_BODY.product_name,
      VALID_BODY.quantity,
      VALID_BODY.price,
      VALID_BODY.expiry_date,
      VALID_BODY.batch_no,
      VALID_BODY.harvest_date,
      VALID_BODY.shelf_life_days,
      VALID_BODY.storage_temp,
      VALID_BODY.quality_grade,
    ]);
  });

  test.each(REQUIRED_FIELDS)("rejects a payload missing %s", async (field) => {
    const { app, pool } = makeApp();
    const body = { ...VALID_BODY };
    delete body[field];

    const res = await request(app).post("/inventory").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "All fields are required" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(REQUIRED_STRINGS)("rejects an empty %s", async (field) => {
    const { app, pool } = makeApp();

    const res = await request(app)
      .post("/inventory")
      .send({ ...VALID_BODY, [field]: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "All fields are required" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("accepts zero for every numeric field (boundary)", async () => {
    const { app, pool } = makeApp();
    const body = {
      ...VALID_BODY,
      quantity: 0,
      price: 0,
      shelf_life_days: 0,
      storage_temp: 0,
    };
    pool.query.mockResolvedValue({ rows: [makeItem(body)] });

    const res = await request(app).post("/inventory").send(body);

    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([0])
    );
  });

  test("passes user input as a parameter, never as SQL text", async () => {
    const { app, pool } = makeApp();
    const injection = "Oyster'; DROP TABLE inventory;--";
    pool.query.mockResolvedValue({ rows: [makeItem()] });

    await request(app)
      .post("/inventory")
      .send({ ...VALID_BODY, product_name: injection });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toContain(injection);
    expect(params[0]).toBe(injection);
  });

  test("maps an insert failure to a 500", async () => {
    const { app, pool } = makeApp();
    pool.query.mockRejectedValue(new Error("insert failed"));

    const res = await request(app).post("/inventory").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to add item" });
  });
});

describe("PUT /inventory/:id", () => {
  test("updates every field and returns the updated row", async () => {
    const { app, pool } = makeApp();
    const updated = makeItem({ id: 42, quantity: 7 });
    pool.query.mockResolvedValue({ rows: [updated] });

    const res = await request(app)
      .put("/inventory/42")
      .send({ ...VALID_BODY, quantity: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE inventory SET");
    expect(sql).toContain("WHERE id=$10");
    expect(params[9]).toBe("42");
  });

  test("returns 404 when the id does not exist", async () => {
    const { app, pool } = makeApp();
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).put("/inventory/999").send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  test("maps an update failure to a 500", async () => {
    const { app, pool } = makeApp();
    pool.query.mockRejectedValue(new Error("update failed"));

    const res = await request(app).put("/inventory/1").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update" });
  });
});

describe("DELETE /inventory/:id", () => {
  test("deletes the row and confirms", async () => {
    const { app, pool } = makeApp();
    pool.query.mockResolvedValue({ rows: [makeItem()] });

    const res = await request(app).delete("/inventory/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Deleted successfully" });
    expect(pool.query).toHaveBeenCalledWith(
      "DELETE FROM inventory WHERE id=$1 RETURNING *",
      ["1"]
    );
  });

  test("returns 404 when the id does not exist", async () => {
    const { app, pool } = makeApp();
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).delete("/inventory/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Item not found" });
  });

  test("maps a delete failure to a 500", async () => {
    const { app, pool } = makeApp();
    pool.query.mockRejectedValue(new Error("delete failed"));

    const res = await request(app).delete("/inventory/1");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to delete" });
  });
});
