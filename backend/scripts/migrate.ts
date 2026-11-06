import 'dotenv/config';
import { runMigrations } from '../src/db/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

runMigrations(url)
  .then(() => console.log('Migrations complete'))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
