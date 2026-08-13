// Entry point. dotenv runs before ./app so JWT_SECRET and DATABASE_URL are set
// by the time the services read them at module load.
require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});