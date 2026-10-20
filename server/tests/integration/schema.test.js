const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const SCHEMA_SQL = fs.readFileSync(
  path.join(__dirname, "../../schema.sql"),
  "utf8"
);
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, "../../migrations/001_sync_inventory.sql"),
  "utf8"
);

const LEGACY_SCHEMA_SQL = `
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price FLOAT NOT NULL DEFAULT 0.0,
    expiry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

function uniqueSchema(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

async function columnsFor(client, schema) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'inventory'
      ORDER BY ordinal_position`,
    [schema]
  );
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
}

async function errorFrom(promise) {
  return promise.then(
    () => null,
    (error) => error
  );
}

describeDb("inventory schema (PostgreSQL)", () => {
  const schema = uniqueSchema("schema_test");
  let client;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
  });

  beforeEach(async () => {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query("DROP TABLE IF EXISTS inventory CASCADE");
    await client.query(SCHEMA_SQL);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });

  test("creates the 11 columns the API and client expect", async () => {
    const columns = await columnsFor(client, schema);

    expect(Object.keys(columns)).toEqual([
      "id",
      "product_name",
      "quantity",
      "price",
      "expiry_date",
      "batch_no",
      "harvest_date",
      "shelf_life_days",
      "storage_temp",
      "quality_grade",
      "created_at",
    ]);

    for (const name of [
      "product_name",
      "quantity",
      "price",
      "expiry_date",
      "batch_no",
      "harvest_date",
      "shelf_life_days",
      "storage_temp",
      "quality_grade",
    ]) {
      expect(columns[name].is_nullable).toBe("NO");
    }
  });

  test("stores money and temperature as exact numerics", async () => {
    const columns = await columnsFor(client, schema);

    expect(columns.price.data_type).toBe("numeric");
    expect(columns.price.numeric_precision).toBe(10);
    expect(columns.price.numeric_scale).toBe(2);
    expect(columns.storage_temp.data_type).toBe("numeric");
    expect(columns.storage_temp.numeric_scale).toBe(1);
  });

  test("uses DATE for harvest and expiry", async () => {
    const columns = await columnsFor(client, schema);

    expect(columns.harvest_date.data_type).toBe("date");
    expect(columns.expiry_date.data_type).toBe("date");
  });

  test("seeds seven complete sample batches", async () => {
    const { rows } = await client.query(
      "SELECT * FROM inventory ORDER BY id"
    );

    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.batch_no)).toEqual([
      "BATCH-001",
      "BATCH-002",
      "BATCH-003",
      "BATCH-004",
      "BATCH-005",
      "BATCH-006",
      "BATCH-007",
    ]);
    for (const row of rows) {
      expect(row.product_name).toBeTruthy();
      expect(row.quantity).toBeGreaterThanOrEqual(0);
      expect(row.price).not.toBeNull();
      expect(row.harvest_date).toBeInstanceOf(Date);
      expect(row.expiry_date).toBeInstanceOf(Date);
      expect(row.shelf_life_days).toBeGreaterThanOrEqual(0);
      expect(row.storage_temp).not.toBeNull();
      expect(row.quality_grade).toMatch(/^[ABC]$/);
    }
  });

  test("re-running schema.sql is idempotent", async () => {
    await client.query(SCHEMA_SQL);

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM inventory"
    );

    expect(rows[0].count).toBe(7);
  });

  test("rejects a NULL in a required column", async () => {
    const error = await errorFrom(
      client.query(
        `INSERT INTO inventory (product_name, quantity, price, expiry_date)
         VALUES ('Incomplete', 1, 1.00, '2026-12-01')`
      )
    );

    expect(error).not.toBeNull();
    expect(error.code).toBe("23502");
    expect(error.column).toBe("batch_no");
  });

  test("rejects a quality grade outside A/B/C", async () => {
    const error = await errorFrom(
      client.query(
        `INSERT INTO inventory
           (product_name, quantity, price, expiry_date, batch_no, harvest_date,
            shelf_life_days, storage_temp, quality_grade)
         VALUES ('Bad grade', 1, 1.00, '2026-12-01', 'BAD-1', '2026-11-01', 30, 4.0, 'D')`
      )
    );

    expect(error).not.toBeNull();
    expect(error.code).toBe("23514");
    expect(error.constraint).toBe("inventory_quality_grade_check");
  });

  test("creates the expiry index used by the default sort", async () => {
    const { rows } = await client.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'inventory'`,
      [schema]
    );

    expect(rows.map((row) => row.indexname)).toContain(
      "idx_inventory_expiry"
    );
  });

  test("accepts the exact payload the POST route sends", async () => {
    const { rows } = await client.query(
      `INSERT INTO inventory
         (product_name, quantity, price, expiry_date, batch_no, harvest_date,
          shelf_life_days, storage_temp, quality_grade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        "Route payload",
        5,
        10.5,
        "2026-12-01",
        "ROUTE-001",
        "2026-11-01",
        30,
        4.0,
        "A",
      ]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].batch_no).toBe("ROUTE-001");
    expect(rows[0].price).toBe("10.50");
    expect(rows[0].storage_temp).toBe("4.0");
    expect(rows[0].quality_grade).toBe("A");
  });

  test("orders by expiry date, soonest first", async () => {
    await client.query(
      `INSERT INTO inventory
         (product_name, quantity, price, expiry_date, batch_no, harvest_date,
          shelf_life_days, storage_temp, quality_grade)
       VALUES
         ('Later', 1, 1.00, '2027-01-10', 'ORDER-2', '2026-12-01', 40, 4.0, 'B'),
         ('Earlier', 1, 1.00, '2026-12-15', 'ORDER-1', '2026-11-01', 44, 4.0, 'A')`
    );

    const { rows } = await client.query(
      "SELECT batch_no FROM inventory ORDER BY expiry_date ASC"
    );

    const inserted = rows
      .map((row) => row.batch_no)
      .filter((batchNo) => batchNo.startsWith("ORDER-"));

    expect(inserted).toEqual(["ORDER-1", "ORDER-2"]);
  });
});

describeDb("001_sync_inventory migration (PostgreSQL)", () => {
  const schema = uniqueSchema("migration_test");
  let client;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
  });

  beforeEach(async () => {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query("DROP TABLE IF EXISTS inventory CASCADE");
    await client.query(LEGACY_SCHEMA_SQL);
    await client.query(
      `INSERT INTO inventory (product_name, quantity, price, expiry_date)
       VALUES
         ('Shiitake Mushrooms', 10, 15.99, '2026-05-15'),
         ('Enoki Mushrooms', 2, 18.99, '2026-04-05')`
    );
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });

  test("adds the missing columns and backfills legacy rows", async () => {
    await client.query(MIGRATION_SQL);

    const { rows } = await client.query(
      `SELECT id, product_name, batch_no, harvest_date::text AS harvest_date,
              expiry_date::text AS expiry_date, shelf_life_days,
              storage_temp, quality_grade, price
         FROM inventory ORDER BY id`
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 1,
      product_name: "Shiitake Mushrooms",
      batch_no: "LEGACY-1",
      harvest_date: "2026-05-01",
      expiry_date: "2026-05-15",
      shelf_life_days: 14,
      storage_temp: "4.0",
      quality_grade: "B",
      price: "15.99",
    });
    expect(rows[1]).toMatchObject({
      batch_no: "LEGACY-2",
      harvest_date: "2026-03-22",
      expiry_date: "2026-04-05",
    });
  });

  test("enforces NOT NULL after the backfill", async () => {
    await client.query(MIGRATION_SQL);

    const columns = await columnsFor(client, schema);
    for (const name of [
      "batch_no",
      "harvest_date",
      "shelf_life_days",
      "storage_temp",
      "quality_grade",
    ]) {
      expect(columns[name].is_nullable).toBe("NO");
    }
  });

  test("converts price from double precision to numeric(10,2)", async () => {
    await client.query(MIGRATION_SQL);

    const columns = await columnsFor(client, schema);
    expect(columns.price.data_type).toBe("numeric");
    expect(columns.price.numeric_precision).toBe(10);
    expect(columns.price.numeric_scale).toBe(2);
  });

  test("is safe to run twice", async () => {
    await client.query(MIGRATION_SQL);
    await client.query(MIGRATION_SQL);

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM inventory"
    );

    expect(rows[0].count).toBe(2);
  });

  test("accepts the full API payload after migrating", async () => {
    await client.query(MIGRATION_SQL);

    const { rows } = await client.query(
      `INSERT INTO inventory
         (product_name, quantity, price, expiry_date, batch_no, harvest_date,
          shelf_life_days, storage_temp, quality_grade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, batch_no, price`,
      [
        "After migration",
        5,
        10.5,
        "2026-12-01",
        "AFTER-001",
        "2026-11-01",
        30,
        4.0,
        "A",
      ]
    );

    expect(rows[0]).toMatchObject({
      batch_no: "AFTER-001",
      price: "10.50",
    });
  });
});
