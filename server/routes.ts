import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { pool, ensureTables, genId } from './db';
import { insertStudentSchema, insertGradeSchema } from '../shared/schema';
import { ZodError } from 'zod';

export async function registerRoutes(app: Express): Promise<Server> {
  // ensure DB tables exist (helpful for local Docker)
  await ensureTables();

  // Students APIs
  app.get('/api/students', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM students ORDER BY admission_number');
    res.json(rows);
  });

  app.post('/api/students', async (req, res) => {
    try {
      const data = insertStudentSchema.parse(req.body);
      // check exists
    const exists = await pool.query('SELECT 1 FROM students WHERE admission_number = $1', [data.admissionNumber]);
    if ((exists.rowCount ?? 0) > 0) return res.status(409).json({ message: 'admissionNumber exists' });
      const id = genId();
      const q = await pool.query(
        `INSERT INTO students (id, admission_number, name, date_of_birth, admission_date, aadhar_number, pen_number, aapar_id, mobile_number, address, grade, section, yearly_fee_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [id, data.admissionNumber, data.name, data.dateOfBirth, data.admissionDate, data.aadharNumber || null, data.penNumber || null, data.aaparId || null, data.mobileNumber || null, data.address || null, data.grade || null, data.section || null, data.yearlyFeeAmount]
      );
      res.status(201).json(q.rows[0]);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: 'validation', issues: e.format() });
      console.error(e);
      res.status(500).json({ message: 'internal error' });
    }
  });

  app.put('/api/students/:admissionNumber', async (req, res) => {
    try {
      const admissionNumber = req.params.admissionNumber;
      const data = insertStudentSchema.partial().parse(req.body);
      const existing = await pool.query('SELECT * FROM students WHERE admission_number = $1', [admissionNumber]);
    if ((existing.rowCount ?? 0) === 0) return res.status(404).json({ message: 'not found' });
      // build update set dynamically
      const keys = Object.keys(data);
      const values: any[] = [];
      const sets: string[] = [];
      keys.forEach((k, i) => {
        // map camelCase keys to snake_case DB columns
        const col = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()).replace(/^admission_number$/, 'admission_number');
        sets.push(`${col} = $${i + 1}`);
        values.push((data as any)[k]);
      });
      if (sets.length === 0) return res.json(existing.rows[0]);
      const q = await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE admission_number = $${sets.length + 1} RETURNING *`, [...values, admissionNumber]);
      res.json(q.rows[0]);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: 'validation', issues: e.format() });
      console.error(e);
      res.status(500).json({ message: 'internal error' });
    }
  });

  app.delete('/api/students/:id', async (req, res) => {
    const id = req.params.id;
    await pool.query('DELETE FROM students WHERE id = $1', [id]);
    res.json({ deleted: id });
  });

  // bulk import: supports strategy=skip|upsert
  app.post('/api/students/import', async (req, res) => {
    const { students: imported, strategy } = req.body as { students: any[]; strategy?: string };
    if (!Array.isArray(imported)) return res.status(400).json({ message: 'students array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const added: any[] = [];
      const skipped: string[] = [];
      let updated = 0;
      for (const row of imported) {
        try {
          const data = insertStudentSchema.parse(row);
          const exists = await client.query('SELECT * FROM students WHERE admission_number = $1', [data.admissionNumber]);
            if ((exists.rowCount ?? 0) > 0) {
            if (strategy === 'upsert') {
              // update
              await client.query(
                `UPDATE students SET name=$1, date_of_birth=$2, admission_date=$3, aadhar_number=$4, pen_number=$5, aapar_id=$6, mobile_number=$7, address=$8, grade=$9, section=$10, yearly_fee_amount=$11 WHERE admission_number=$12`,
                [data.name, data.dateOfBirth, data.admissionDate, data.aadharNumber || null, data.penNumber || null, data.aaparId || null, data.mobileNumber || null, data.address || null, data.grade || null, data.section || null, data.yearlyFeeAmount, data.admissionNumber]
              );
              updated++;
            } else {
              skipped.push(data.admissionNumber);
            }
          } else {
            const id = genId();
            await client.query(
              `INSERT INTO students (id, admission_number, name, date_of_birth, admission_date, aadhar_number, pen_number, aapar_id, mobile_number, address, grade, section, yearly_fee_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [id, data.admissionNumber, data.name, data.dateOfBirth, data.admissionDate, data.aadharNumber || null, data.penNumber || null, data.aaparId || null, data.mobileNumber || null, data.address || null, data.grade || null, data.section || null, data.yearlyFeeAmount]
            );
            added.push(data.admissionNumber);
          }
        } catch (e) {
          // validation error for this row -> skip
        }
      }
      await client.query('COMMIT');
      res.json({ added: added.length, skipped: skipped.length, skippedAdmissionNumbers: skipped, updated });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ message: 'import failed' });
    } finally {
      client.release();
    }
  });

  // Grades APIs
  app.get('/api/grades', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM grades');
    res.json(rows);
  });

  // upsert grades in bulk
  app.post('/api/grades', async (req, res) => {
    const incoming = req.body as any[];
    if (!Array.isArray(incoming)) return res.status(400).json({ message: 'grades array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const g of incoming) {
        try {
          const data = insertGradeSchema.parse(g);
          const exists = await client.query('SELECT id FROM grades WHERE student_id=$1 AND subject=$2 AND term=$3', [data.studentId, data.subject, data.term]);
            if ((exists.rowCount ?? 0) > 0) {
            await client.query('UPDATE grades SET marks=$1 WHERE id=$2', [data.marks, exists.rows[0].id]);
          } else {
            const id = genId();
            await client.query('INSERT INTO grades (id, student_id, subject, marks, term) VALUES ($1,$2,$3,$4,$5)', [id, data.studentId, data.subject, data.marks, data.term]);
          }
        } catch (e) {
          // skip invalid row
        }
      }
      await client.query('COMMIT');
      res.json({ updated: incoming.length });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ message: 'failed' });
    } finally {
      client.release();
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
