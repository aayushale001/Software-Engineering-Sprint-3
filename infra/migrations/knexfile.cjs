require("dotenv").config();

module.exports = {
  client: "pg",
  connection: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/hospital",
  migrations: {
    directory: "./migrations",
    extension: "js"
  },
  seeds: {
    directory: "./seeds",
    extension: "js"
  },
  pool: {
    min: 2,
    max: 20
  }
};
