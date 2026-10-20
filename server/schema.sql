-- Create database (run this separately if database doesn't exist)
-- CREATE DATABASE inventory_db;

-- Connect to inventory_db and run the following:

-- Create inventory table.
-- The columns below must stay in sync with the payload accepted by
-- server/server.js and the fields used by client/src/App.js.
CREATE TABLE IF NOT EXISTS inventory (
    id              SERIAL PRIMARY KEY,
    product_name    VARCHAR(255)  NOT NULL,
    quantity        INTEGER       NOT NULL DEFAULT 0,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.0,
    expiry_date     DATE          NOT NULL,
    batch_no        VARCHAR(100)  NOT NULL,
    harvest_date    DATE          NOT NULL,
    shelf_life_days INTEGER       NOT NULL,
    storage_temp    NUMERIC(5,1)  NOT NULL,
    quality_grade   CHAR(1)       NOT NULL CHECK (quality_grade IN ('A','B','C')),
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory (expiry_date);

-- Insert sample data only when the table is empty, so re-running this
-- file does not duplicate rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM inventory) THEN
        INSERT INTO inventory
            (product_name, quantity, price, expiry_date, batch_no, harvest_date,
             shelf_life_days, storage_temp, quality_grade)
        VALUES
            ('Shiitake Mushrooms',      10, 15.99, '2026-05-15', 'BATCH-001', '2026-04-20', 25, 4.0, 'A'),
            ('Portobello Mushrooms',     3, 12.50, '2026-04-20', 'BATCH-002', '2026-04-01', 19, 4.0, 'B'),
            ('Oyster Mushrooms',        25,  8.99, '2026-06-01', 'BATCH-003', '2026-05-10', 22, 4.0, 'A'),
            ('White Button Mushrooms',   8,  5.99, '2026-04-10', 'BATCH-004', '2026-03-25', 16, 3.5, 'B'),
            ('Cremini Mushrooms',       15,  7.49, '2026-05-30', 'BATCH-005', '2026-05-01', 29, 4.0, 'A'),
            ('Enoki Mushrooms',          2, 18.99, '2026-04-05', 'BATCH-006', '2026-03-20', 16, 2.5, 'C'),
            ('Maitake Mushrooms',       12, 22.99, '2026-07-01', 'BATCH-007', '2026-06-01', 30, 4.0, 'A');
    END IF;
END
$$;
