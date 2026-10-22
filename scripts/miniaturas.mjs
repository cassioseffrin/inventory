// Gera a miniatura (máx. 256x256) das fotos gravadas antes da coluna `miniatura` existir.
// Idempotente: só processa fotos com miniatura nula. Uso: npm run db:miniaturas
// .env é opcional (no Docker as variáveis vêm do compose)
try { await import('dotenv/config'); } catch {}
import pg from 'pg';
import sharp from 'sharp';

const LADO = 256;
const pool = new pg.Pool({ connectionString: process.env.INV_DATABASE_URL, max: 1 });
let feitas = 0;
try {
  const { rows } = await pool.query('select id from inventario.itens_fotos where miniatura is null order by id');
  for (const { id } of rows) {
    const { rows: [f] } = await pool.query('select dados from inventario.itens_fotos where id = $1', [id]);
    const mini = await sharp(Buffer.from(f.dados, 'base64'))
      .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    await pool.query('update inventario.itens_fotos set miniatura = $1 where id = $2 and miniatura is null', [mini.toString('base64'), id]);
    feitas++;
  }
  console.log(`${feitas} miniatura(s) gerada(s).`);
} catch (e) {
  console.error('falha ao gerar miniaturas:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
