require("dotenv").config();
const pool = require("./db");
const { createApp } = require("./app");

const app = createApp(pool);
const PORT = 5000;

app.listen(PORT, () => {
  console.log("Server running on port 5000");
});
