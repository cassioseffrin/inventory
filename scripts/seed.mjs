// Seed idempotente: usuário admin, funcionários de exemplo, dicionário de software e um campo customizado.
// .env é opcional (no Docker as variáveis vêm do compose)
try { await import('dotenv/config'); } catch {}
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.INV_DATABASE_URL, max: 1 });
const c = await pool.connect();
try {
  await c.query('BEGIN');

  const username = process.env.ADMIN_USERNAME || 'admin';
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha || senha.length < 8) throw new Error('defina ADMIN_PASSWORD (mín. 8 caracteres) no .env');
  await c.query(
    `INSERT INTO inventario.usuarios (username, senha_hash, nome, papel)
     VALUES ($1, $2, 'Administrador', 'admin')
     ON CONFLICT (username) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = 'admin', ativo = true, updated_at = now()`,
    [username, await bcrypt.hash(senha, 12)],
  );

  const funcionarios = [
    ['Ana Paula Souza', 'F0001', 'ana.souza@empresa.local', 'Financeiro'],
    ['Bruno Carvalho', 'F0002', 'bruno.carvalho@empresa.local', 'TI'],
    ['Carla Mendes', 'F0003', 'carla.mendes@empresa.local', 'RH'],
    ['Diego Martins', 'F0004', 'diego.martins@empresa.local', 'Comercial'],
    ['Eduarda Lima', 'F0005', 'eduarda.lima@empresa.local', 'TI'],
    ['Fernando Rocha', 'F0006', 'fernando.rocha@empresa.local', 'Produção'],
    ['Gabriela Nunes', 'F0007', 'gabriela.nunes@empresa.local', 'Jurídico'],
    ['Henrique Alves', 'F0008', 'henrique.alves@empresa.local', 'Logística'],
  ];
  for (const [nome, matricula, email, setor] of funcionarios) {
    await c.query(
      `INSERT INTO inventario.funcionarios (nome, matricula, email, setor) VALUES ($1,$2,$3,$4)
       ON CONFLICT (matricula) DO NOTHING`,
      [nome, matricula, email, setor],
    );
  }

  const dicionario = [
    ['Google Chrome', 'navegador', 'Google LLC', ['google chrome*']],
    ['Mozilla Firefox', 'navegador', 'Mozilla', ['mozilla firefox*', 'firefox*']],
    ['Microsoft Office', 'office', 'Microsoft', ['microsoft office*', 'microsoft 365*', 'libreoffice*']],
    ['7-Zip', 'utilitario', 'Igor Pavlov', ['7-zip*', 'p7zip*']],
    ['AnyDesk', 'comunicacao', 'AnyDesk Software', ['anydesk*']],
    ['uTorrent', 'proibido', 'BitTorrent', ['*utorrent*', '*bittorrent*']],
    ['CCleaner', 'proibido', 'Piriform', ['ccleaner*']],
    ['Windows Defender', 'seguranca', 'Microsoft', ['windows defender*', 'microsoft defender*']],
  ];
  for (const [nome, cat, editor, padroes] of dicionario) {
    const { rows } = await c.query(
      `INSERT INTO inventario.software_dicionario (nome_canonico, categoria, editor) VALUES ($1,$2,$3)
       ON CONFLICT (nome_canonico) DO UPDATE SET updated_at = now() RETURNING id`,
      [nome, cat, editor],
    );
    for (const p of padroes) {
      await c.query(
        `INSERT INTO inventario.software_variacoes (dicionario_id, padrao) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [rows[0].id, p],
      );
    }
  }

  await c.query(
    `INSERT INTO inventario.campos_customizados (chave, nome, tipo, opcoes, obrigatorio, ordem)
     VALUES ('centro_custo', 'Centro de custo', 'lista', '["CC-100 Administrativo","CC-200 Operações","CC-300 TI"]', false, 1)
     ON CONFLICT (chave) DO NOTHING`,
  );

  await c.query('COMMIT');
  console.log(`seed ok — usuário admin: ${username}`);
} catch (e) {
  await c.query('ROLLBACK');
  console.error('seed falhou:', e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
