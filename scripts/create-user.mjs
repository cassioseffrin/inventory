// Cria/atualiza um usuário de login.  Uso: npm run user:create -- <username> <senha> [admin|operador] [nome]
// .env é opcional (no Docker as variáveis vêm do compose)
try { await import('dotenv/config'); } catch {}
import pg from 'pg';
import bcrypt from 'bcryptjs';

const [username, senha, papel = 'operador', ...nome] = process.argv.slice(2);
if (!username || !senha || senha.length < 8 || !['admin', 'operador'].includes(papel)) {
  console.error('uso: npm run user:create -- <username> <senha(min 8)> [admin|operador] [nome]');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.INV_DATABASE_URL, max: 1 });
await pool.query(
  `INSERT INTO inventario.usuarios (username, senha_hash, nome, papel) VALUES ($1,$2,$3,$4)
   ON CONFLICT (username) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = EXCLUDED.papel, nome = EXCLUDED.nome, ativo = true, updated_at = now()`,
  [username, await bcrypt.hash(senha, 12), nome.join(' ') || username, papel],
);
console.log(`usuário ${username} (${papel}) salvo.`);
await pool.end();
