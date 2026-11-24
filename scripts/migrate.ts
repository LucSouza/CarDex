import { runMigrations } from "../src/db";

const url = process.env.DATABASE_URL;
const target =
  url && /^postgres(ql)?:\/\//.test(url) ? `Postgres em ${new URL(url).host} (schema "pokedex")` : "PGlite local (.pglite/)";
console.log(`Banco de destino: ${target}`);

runMigrations()
  .then(() => {
    console.log("✓ Migrations aplicadas.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
