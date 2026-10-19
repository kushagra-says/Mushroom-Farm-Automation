# Mushroom Inventory Management System

A full-stack inventory management system built with PERN stack (PostgreSQL, Express.js, React.js, Node.js).

## Features

- **CRUD Operations**: Create, Read, Update, Delete inventory items
- **FIFO Logic**: Items sorted by expiry date (oldest first)
- **Low Stock Alert**: Yellow highlight for items with quantity < 5
- **Expiry Alert**: Red highlight for expired items
- **Responsive UI**: Clean dashboard built with Tailwind CSS

## Project Structure

```
mushroom-inventory/
├── server/                 # Backend (Node.js + Express)
│   ├── db.js              # PostgreSQL connection
│   ├── server.js          # Express API server
│   ├── schema.sql         # Database schema
│   └── package.json
└── client/                 # Frontend (React.js)
    ├── src/
    │   ├── App.js         # Main React component
    │   └── App.css        # Tailwind CSS styles
    └── package.json
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)

### Step 1: Database Setup

1. Open pgAdmin or psql terminal
2. Create the database:
   ```sql
   CREATE DATABASE inventory_db;
   ```
3. Connect to inventory_db and run the schema:
   ```sql
   -- Run the contents of server/schema.sql
   ```

Or via command line:
```bash
psql -U postgres -d postgres -c "CREATE DATABASE inventory_db;"
psql -U postgres -d inventory_db -f server/schema.sql
```

### Step 2: Configure Database Connection

Create a `.env` file in the `server/` folder (copy the example):
```bash
cd server
cp .env.example .env
```

Then set your PostgreSQL credentials in `server/.env`:
```env
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventory_db
```

`server/db.js` reads these values at startup. Never commit the `.env` file — it is already listed in `.gitignore`.

### Step 3: Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Step 4: Start the Application

**Terminal 1 - Start Backend:**
```bash
cd server
npm start
```
Server runs on http://localhost:5000

**Terminal 2 - Start Frontend:**
```bash
cd client
npm start
```
Client runs on http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /inventory | Get all items (sorted by expiry_date ASC) |
| POST | /inventory | Add new item |
| PUT | /inventory/:id | Update item |
| DELETE | /inventory/:id | Delete item |

### Request Body Examples

**POST /inventory**
```json
{
  "product_name": "Shiitake Mushrooms",
  "quantity": 15,
  "price": 12.99,
  "expiry_date": "2026-05-15"
}
```

## Color Coding

| Color | Meaning |
|-------|---------|
| Red background | Item has expired |
| Yellow background | Low stock (quantity < 5) |

## Technology Stack

- **Frontend**: React.js 19, Tailwind CSS 3.4, Axios
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
Hadi Jahmi 
