/**
 * Creates (or promotes) an administrator account. Admins sign in to the dashboard with OTP like everyone else.
 *
 *   npm run create-admin -- --name "Asha Admin" --phone 9000000001 --email admin@example.com
 */
import 'dotenv/config';
import { Client } from 'pg';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg('name');
  const rawPhone = arg('phone');
  const email = arg('email')?.toLowerCase();
  if (!name || !rawPhone) {
    console.error('Usage: npm run create-admin -- --name "Full Name" --phone 9XXXXXXXXX [--email you@example.com]');
    process.exit(1);
  }
  const digits = rawPhone.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new Error('Phone must be a 10-digit Indian mobile number');
  const phone = `+91${digits}`;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO users (role, full_name, phone, email, phone_verified)
       VALUES ('ADMIN', $1, $2, $3, true)
       ON CONFLICT (phone) DO UPDATE SET role = 'ADMIN', full_name = EXCLUDED.full_name, phone_verified = true
       RETURNING id`,
      [name, phone, email ?? null],
    );
    console.log(`Admin ready: ${name} (${phone}) id=${rows[0].id}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
