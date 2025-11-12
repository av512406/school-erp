import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import fs from 'fs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://school_erp:school_erp_pass@localhost:15432/school_erp';

export const pool = new Pool({ connectionString: DATABASE_URL });

export async function ensureTables() {
  // create minimal tables if missing (safe for local/dev)
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id text PRIMARY KEY,
        admission_number text UNIQUE NOT NULL,
        name text NOT NULL,
        date_of_birth date NOT NULL,
        admission_date date NOT NULL,
        aadhar_number text,
        pen_number text,
        aapar_id text,
        mobile_number text,
        address text,
        grade text,
        section text,
        yearly_fee_amount numeric(10,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fee_transactions (
        id text PRIMARY KEY,
        student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        amount numeric(10,2) NOT NULL,
        payment_date date NOT NULL,
        payment_mode text,
        remarks text
      );

      CREATE TABLE IF NOT EXISTS grades (
        id text PRIMARY KEY,
        student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject text NOT NULL,
        marks numeric(5,2) NOT NULL,
        term text NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}

export function genId() {
  return randomUUID();
}

// optional helper to run ad-hoc SQL from file (not used here but handy)
export async function runSqlFileIfExists(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, 'utf-8');
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    }
  } catch (e) {
    // ignore
  }
}

export default pool;
