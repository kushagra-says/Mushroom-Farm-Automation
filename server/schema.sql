-- Create database (run this separately if database doesn't exist)
-- CREATE DATABASE inventory_db;

-- Connect to inventory_db and run the following:

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price FLOAT NOT NULL DEFAULT 0.0,
    expiry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO inventory (product_name, quantity, price, expiry_date) VALUES
('Shiitake Mushrooms', 10, 15.99, '2026-05-15'),
('Portobello Mushrooms', 3, 12.50, '2026-04-20'),
('Oyster Mushrooms', 25, 8.99, '2026-06-01'),
('White Button Mushrooms', 8, 5.99, '2026-04-10'),
('Cremini Mushrooms', 15, 7.49, '2026-05-30'),
('Enoki Mushrooms', 2, 18.99, '2026-04-05'),
(' Maitake Mushrooms', 12, 22.99, '2026-07-01');
