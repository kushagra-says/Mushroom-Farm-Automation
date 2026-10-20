-- Migration 001 — sync the inventory table with the API contract.
--
-- Use this only for databases created from the previous version of
-- schema.sql (which had only id, product_name, quantity, price,
-- expiry_date, and created_at). Fresh databases should run schema.sql.
--
-- The migration is idempotent: it is safe to run more than once.

BEGIN;

-- 1. Add the columns the API and client already depend on.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS batch_no        VARCHAR(100);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS harvest_date    DATE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS storage_temp    NUMERIC(5,1);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS quality_grade   CHAR(1);

-- 2. Backfill legacy rows with defensible defaults.
UPDATE inventory SET batch_no        = 'LEGACY-' || id WHERE batch_no IS NULL;
UPDATE inventory SET harvest_date    = expiry_date - 14 WHERE harvest_date IS NULL;
UPDATE inventory SET shelf_life_days = 14               WHERE shelf_life_days IS NULL;
UPDATE inventory SET storage_temp    = 4.0              WHERE storage_temp IS NULL;
UPDATE inventory SET quality_grade   = 'B'              WHERE quality_grade IS NULL;

-- 3. Enforce the same constraints as schema.sql.
ALTER TABLE inventory ALTER COLUMN batch_no        SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN harvest_date    SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN shelf_life_days SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN storage_temp    SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN quality_grade   SET NOT NULL;

ALTER TABLE inventory
    DROP CONSTRAINT IF EXISTS inventory_quality_grade_check;
ALTER TABLE inventory
    ADD CONSTRAINT inventory_quality_grade_check
    CHECK (quality_grade IN ('A','B','C'));

-- 4. Store money exactly (the old column was FLOAT / double precision).
ALTER TABLE inventory
    ALTER COLUMN price TYPE NUMERIC(10,2) USING price::NUMERIC(10,2);

-- 5. Index the default sort column.
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory (expiry_date);

COMMIT;
