# rodar migrate
node scripts/migrate.mjs 
migrations aplicadas.


# 1. uma vez só: ambiente Python com as dependências (.venv já está no .gitignore)
python3 -m venv .venv
.venv/bin/pip install -r scripts/merge_planilha/requirements.txt

# 2. se for um banco novo, criar as colunas antes (gerente, MAC único, descrição)
yarn db:migrate

# 3. simular: mostra o que faria e desfaz tudo no final
.venv/bin/python scripts/merge_planilha/merge_colaboradores.py data_merge/inventory17.10.26.xlsx
.venv/bin/python scripts/merge_planilha/merge_patrimonial.py  data_merge/patrimonio-nesi.xlsx

# 4. gravar de verdade
.venv/bin/python scripts/merge_planilha/merge_colaboradores.py data_merge/inventory17.10.26.xlsx --aplicar
.venv/bin/python scripts/merge_planilha/merge_patrimonial.py  data_merge/patrimonio-nesi.xlsx --aplicar



# Inventário de TI (fonte: Metasploit)

Sistema web de inventário de ativos de TI. Ele usa como fonte os hosts que o **Metasploit Framework** descobre nos scans (`db_nmap`) feitos no Kali Linux. Os hosts são lidos do banco do msf **somente em modo leitura** e copiados (snapshot) para um banco próprio, `inventario`, onde ganham dados administrativos: patrimônio, responsável, setor, hardware, software, grupos e histórico.

O sistema incorpora conceitos do OCS Inventory NG, adaptados para uma fonte de dados de rede (sem agente instalado): dados administrativos customizáveis, abas de hardware/software, dicionário de software, IPDiscover, duplicados, grupos dinâmicos e "último visto".

```
 Kali (192.168.50.217)                       Servidor do inventário
 ┌──────────────────────────┐   SELECT     ┌───────────────────────────────┐
 │ msfconsole / db_nmap     │◄─────────────│ Next.js (UI + API REST)       │
 │ PostgreSQL: banco `msf`  │ inv_msf_ro   │  - pool RO  → msf             │
 └──────────┬───────────────┘ (read-only)  │  - pool RW  → inventario      │──► PostgreSQL 192.168.50.21
            │ scan-e-exporta.sh            └───────────────▲───────────────┘     banco `inventario`
            └── POST /api/msf/importar (Bearer token) ─────┘                     schema `inventario`
```

## Sumário

1. [Stack](#stack)
2. [Schema do msf encontrado](#schema-do-msf-encontrado)
3. [Modelo de dados](#modelo-de-dados-banco-inventario-schema-inventario)
4. [Estrutura de pastas](#estrutura-de-pastas)
5. [Setup do banco](#setup-do-banco)
6. [Variáveis de ambiente](#variáveis-de-ambiente)
7. [Rodando em desenvolvimento](#rodando-em-desenvolvimento)
8. [Rodando com Docker](#rodando-com-docker)
9. [Fluxo Kali → inventário](#fluxo-kali--inventário)
10. [Coleta de software/hardware](#coleta-de-softwarehardware)
11. [Funcionalidades](#funcionalidades)
12. [API REST](#api-rest)
13. [Segurança](#segurança)
14. [Limitações conhecidas](#limitações-conhecidas)

## Stack

| Camada | Tecnologia |
|---|---|
| App | **Next.js 15** (App Router). Frontend React e API REST (route handlers) no mesmo servidor Node |
| UI | Mantine 7, TanStack Query, TanStack Table, React Hook Form + Zod |
| Banco | PostgreSQL. **Drizzle ORM** com migrations versionadas em `drizzle/` |
| Conexões | `pg` pool **read-only** para o msf + pool **read-write** para o inventário |
| Auth | Usuário/senha (bcrypt) e JWT HS256 em cookie `httpOnly` (`jose`); middleware protege páginas e API |

> O requisito pedia frontend e backend separados. Com o Next.js os dois rodam no mesmo processo: a UI chama a API REST em `/api/*`, que é o backend, e tudo é servido por um único container.

## Schema do msf encontrado

Inspecionado no PostgreSQL 18.4 do Kali (`192.168.50.217`, banco `msf`):

| Tabela | Linhas* | Colunas usadas |
|---|---|---|
| `hosts` | 130 | id, address (**inet**), mac, name, state, os_name, os_flavor, os_sp, os_family, arch, detected_arch, purpose, info, comments, workspace_id, created_at, updated_at |
| `host_details` | 0 | id, host_id, nx_console_id, nx_device_id, src, nx_site_name, nx_site_importance, nx_scan_template, nx_risk_score |
| `workspaces` | 1 | id, name, boundary, description |
| `services` | 626 | id, host_id, port, proto, state, name, info, resource (jsonb) |
| `notes` | 1316 | id, host_id, service_id, ntype, data, critical |

\* no momento da inspeção. As datas do msf são `timestamp without time zone` em UTC (Rails). O app converte com `AT TIME ZONE 'UTC'`.

## Modelo de dados (banco `inventario`, schema `inventario`)

| Tabela | Conteúdo |
|---|---|
| `usuarios` | login do sistema (username, senha_hash bcrypt, papel admin/operador) |
| `funcionarios` | nome, matrícula **UNIQUE**, e-mail, setor, ativo |
| `itens` | **snapshot** do host + dados administrativos. `numero_patrimonio` UNIQUE, `patrimonio_provisorio`, `tag`, `msf_host_id`/`msf_workspace_id` (**sem FK**), ip, mac, hostname, os_*, arch, tipo, status, funcionario_id (FK, SET NULL), setor, localização, fabricante, modelo, numero_serie, aquisição/NF/fornecedor, observações, `ultima_sincronizacao`, `ultimo_visto_msf` |
| `itens_historico` | auditoria: item_id (SET NULL; o histórico sobrevive à exclusão), acao, campo, valor_antigo, valor_novo, usuario, created_at |
| `campos_customizados` / `itens_campos_valores` | dados administrativos definidos pelo admin (texto/número/data/lista, obrigatório) |
| `itens_hardware` (1:1), `itens_discos`, `itens_interfaces`, `itens_softwares` (1:N) | seções do item, com `origem` = msf / manual / importação |
| `software_dicionario` / `software_variacoes` | nome canônico + categoria (incl. **proibido**) e variações com curinga `*` |
| `dispositivos_identificados` | classificação IPDiscover (conhecido/ignorado) por MAC; sem MAC, por IP |
| `grupos` / `grupos_itens` | grupos estáticos e dinâmicos (`criterios` jsonb, consulta recalculada a cada uso) |

Migrations: `drizzle/0000_init.sql`, `drizzle/0001_patrimonio_provisorio.sql`. Para alterar o schema, edite `src/db/schema.ts`, rode `npm run db:generate -- --name <descricao>` e depois `npm run db:migrate`.

**Por que um banco separado?** O `msfdb reinit` apaga o banco `msf` inteiro. Por isso o inventário fica em outro banco (inclusive em outro servidor). A referência ao host de origem é só informativa: depois de um reinit os ids mudam, e a sincronização re-localiza o host por MAC/IP.

## Estrutura de pastas

```
├── drizzle/                     migrations SQL versionadas (geradas pelo drizzle-kit)
├── sql/
│   ├── 01-msf-readonly.sql      cria o usuário inv_msf_ro (SELECT only) no msf — rodar de novo após msfdb reinit
│   └── 02-inventario-db.sql     cria o banco inventario + usuário inv_app
├── scripts/
│   ├── migrate.mjs | seed.mjs | create-user.mjs
│   ├── kali/scan-e-exporta.sh   db_nmap em várias faixas + exporta para o inventário
│   └── coleta/                  coleta-windows.ps1 | coleta-linux.sh (software/hardware → JSON)
├── src/
│   ├── middleware.ts            exige login em tudo (exceto /login)
│   ├── db/                      schema.ts (Drizzle) | inv.ts (pool RW) | msf.ts (pool RO)
│   ├── server/                  regras de negócio (só servidor)
│   │   ├── msf-repo.ts          consultas read-only ao msf
│   │   ├── match.ts             classificação host ↔ inventário (MAC; sem MAC, IP+hostname)
│   │   ├── hosts-service.ts     listagem classificada, painel de sub-redes, IPDiscover
│   │   ├── importacao-msf.ts    importação em massa (patrimônio provisório, inferência de tipo)
│   │   ├── itens-service.ts     CRUD + auditoria + campos customizados
│   │   ├── sync.ts              diff/sincronização com msf e "último visto"
│   │   ├── importacao-arquivo.ts JSON/CSV/XML (OCS/GLPI Agent)
│   │   └── …                    dicionário, grupos/duplicados, dashboard, http (erros), jwt
│   ├── lib/                     schemas Zod e constantes compartilhados cliente/servidor
│   ├── components/              DataTable, ItemForm, FuncionarioSelect, modais…
│   └── app/
│       ├── api/**/route.ts      API REST
│       ├── login/
│       └── (app)/               dashboard, hosts, inventario, funcionarios, grupos, software, duplicados, configuracoes
├── Dockerfile | docker-compose.yml | .env.example
```

## Setup do banco

### 1. Usuário read-only no msf (Kali)

O script cria o role `inv_msf_ro`, que só pode dar SELECT em `hosts`, `host_details`, `workspaces`, `services` e `notes`, e tem `default_transaction_read_only = on`. O app ainda força a sessão como read-only, numa terceira camada de proteção.

```bash
# no Kali (ou de qualquer máquina com psql), como superusuário:
psql -h 192.168.50.217 -U postgres -d msf -v ro_pass="'SENHA_FORTE'" -f sql/01-msf-readonly.sql
```

> ⚠️ **Depois de cada `msfdb reinit`** rode o script de novo. O reinit recria o banco `msf` e com ele somem os GRANTs. O role continua existindo, porque é global ao cluster.

#### Liberar o acesso remoto no Kali (`pg_hba.conf` / `listen_addresses`)

No Kali analisado, o `pg_hba.conf` (`/etc/postgresql/18/main/pg_hba.conf`) só libera o usuário `postgres` para a rede:

```
host  msf  postgres  192.168.50.0/24  scram-sha-256
```

Adicione uma linha para o usuário do inventário. Restrinja ao IP do servidor do inventário quando possível:

```
host  msf  inv_msf_ro  192.168.50.0/24  scram-sha-256
```

Confirme também que o Postgres escuta na rede (`/etc/postgresql/18/main/postgresql.conf`):

```
listen_addresses = '*'          # ou o IP do Kali, ex.: '192.168.50.217,localhost'
```

Depois: `sudo systemctl reload postgresql` (mudança só no `pg_hba`) ou `restart` (mudança em `listen_addresses`).

> Se o app rodar **no próprio Kali** em Docker, libere também a rede do Docker (`172.16.0.0/12`) no `pg_hba` e use `host.docker.internal` no `.env`. Veja [Docker](#rodando-com-docker).

### 2. Banco do inventário

```bash
psql -h 192.168.50.21 -U postgres -d postgres -v app_pass="'SENHA_FORTE'" -f sql/02-inventario-db.sql
```

Isso cria o role `inv_app`, o banco `inventario` (dono `inv_app`) e o schema `inventario`. As tabelas são criadas pelas migrations (`npm run db:migrate`, executado automaticamente pelo container).

> Os dois scripts usam variáveis do `psql` (`-v`, `\gexec`, `\connect`). Rode-os com o `psql`, não com outros clientes SQL.

## Variáveis de ambiente

Copie `.env.example` para `.env`:

| Variável | Descrição |
|---|---|
| `MSF_DATABASE_URL` | `postgres://inv_msf_ro:SENHA@192.168.50.217:5432/msf`: conexão **somente leitura** |
| `INV_DATABASE_URL` | `postgres://inv_app:SENHA@192.168.50.21:5432/inventario`: conexão leitura/escrita |
| `JWT_SECRET` | segredo HS256, ≥ 32 caracteres (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | validade da sessão (padrão `8h`) |
| `COOKIE_SECURE` | `true` quando servido por HTTPS |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | usuário admin criado/atualizado pelo `npm run db:seed` |
| `SUBNET_PREFIX` | prefixo usado para agrupar hosts no painel de sub-redes (padrão `24`) |
| `IMPORT_API_TOKEN` | token (≥ 32 chars, `openssl rand -hex 32`) que o script do Kali usa para chamar a importação. Vazio = desabilitado |

## Rodando em desenvolvimento

Requer Node.js 20+.

```bash
npm install
cp .env.example .env        # preencha
npm run db:migrate          # cria/atualiza as tabelas
npm run db:seed             # admin + 8 funcionários de exemplo + dicionário inicial + campo "Centro de custo"
npm run dev                 # http://localhost:3000
```

Outros comandos:

```bash
npm run typecheck
npm run build && npm start                      # produção sem Docker
npm run user:create -- joao 'SenhaForte123' operador "João Silva"
npm run user:create -- maria 'OutraSenha456' admin
```

Perfis: **admin** gerencia campos customizados; **operador** faz o resto. Os usuários de login são gerenciados pelo script `user:create`.

## Rodando com Docker

Um único container (Next.js) atende UI e API. Os bancos ficam fora do compose.

```bash
cp .env.example .env        # preencha
docker compose up -d --build
docker compose exec inventario node scripts/seed.mjs     # primeira vez
docker compose logs -f
```

O container aplica as migrations pendentes ao subir.

**Conectividade com o Postgres:**

- **Bancos em outras máquinas da LAN** (o caso atual: `.217` e `.21`): use os IPs no `.env`. A rede bridge padrão do Docker alcança a LAN.
- **Postgres na mesma máquina do Docker** (ex.: app rodando no próprio Kali): use `host.docker.internal` no `.env`. O compose já mapeia esse nome com `extra_hosts: host-gateway`, o que também vale no Linux. No Postgres:
  - `listen_addresses` deve incluir a interface `docker0` (ou `'*'`);
  - o `pg_hba.conf` deve liberar a rede do Docker: `host msf inv_msf_ro 172.16.0.0/12 scram-sha-256`.
- **Alternativa (Linux):** `network_mode: host` no compose (remova `ports`). Nesse caso, `localhost` no `.env` é o próprio host.

## Fluxo Kali → inventário

O objetivo é escanear várias faixas de IP no Kali e ir alimentando o inventário. O script `scripts/kali/scan-e-exporta.sh` faz isso numa única sessão do msfconsole:

```bash
# no Kali
export INV_URL=http://<servidor-inventario>:3000
export INV_TOKEN=<IMPORT_API_TOKEN do .env do inventário>

# escaneia as faixas no workspace "filial-sp" e exporta
sudo -E ./scan-e-exporta.sh -w filial-sp 10.10.0.0/24 10.10.1.0/24 172.16.5.0/24

# simulação (dry-run): mostra o que seria criado/atualizado, sem gravar
sudo -E ./scan-e-exporta.sh -n -w filial-sp 10.10.0.0/24

# só exportar o que já está no msf (sem escanear)
./scan-e-exporta.sh -x -w default 192.168.50.0/24

# descoberta rápida (-sn), com TAG e localização nos itens novos
sudo -E ./scan-e-exporta.sh -d -g "Filial SP" -l "Rack 2" -w filial-sp 10.10.0.0/16
```

Rode com `sudo -E`: sem root o nmap não obtém MAC nem detecta o SO. A opção `-h` lista todas as opções.

Na importação em massa:

- **hosts novos** (não identificados) viram itens com **patrimônio provisório** `PROV-000001…` (o prefixo é configurável). Eles aparecem no dashboard em "Sem patrimônio" até alguém editar o item e informar o número real, o que desmarca a flag automaticamente;
- o **tipo é inferido** pelo SO, pelo `purpose` e pelas portas abertas (impressora, switch, servidor, desktop). Caso não dê para inferir, vale o tipo padrão;
- **hosts já inventariados** têm IP/hostname/SO atualizados (`-u` desativa) e o "último visto" renovado;
- hosts marcados como **conhecidos/ignorados** (IPDiscover) nunca são importados;
- **o mesmo MAC em vários IPs** vira um item só, e os IPs extras entram como interfaces adicionais;
- tudo fica registrado no histórico de cada item.

A mesma importação está disponível na tela **Hosts descobertos → Importação em massa** (por workspace/sub-rede, com simulação) e para hosts selecionados.

## Coleta de software/hardware

Como o msf só vê a rede, software e hardware vêm de um arquivo importado por item (**Inventário → item → aba Software → Enviar arquivo**). Formatos aceitos:

| Formato | Origem |
|---|---|
| **JSON** | `scripts/coleta/coleta-windows.ps1` ou `scripts/coleta/coleta-linux.sh` |
| **CSV** | colunas `nome`/`name`/`DisplayName`, `versao`/`version`, `editor`/`publisher` (separador detectado automaticamente) |
| **XML** | agente **OCS Inventory NG** ou **GLPI Agent** em modo local: `glpi-inventory --local=.` / `ocsinventory-agent --local=.` |

```powershell
# Windows (não precisa de admin)
powershell -ExecutionPolicy Bypass -File .\coleta-windows.ps1 -Saida \\servidor\coletas
```

```bash
# Linux (com sudo também coleta nº de série e BIOS)
sudo ./coleta-linux.sh /tmp
```

A importação substitui os softwares, discos e interfaces importados anteriormente. Os itens com origem *manual* são mantidos. Fabricante, modelo, nº de série, hostname e SO só preenchem campos vazios, a menos que a opção "Sobrescrever" seja marcada.

Formato do JSON:

```json
{
  "hostname": "PC-FIN-01", "osName": "Windows 11 Pro",
  "hardware": { "fabricante": "Dell Inc.", "modelo": "OptiPlex 7090", "numeroSerie": "ABC123",
                "cpu": "Intel Core i7", "cpuNucleos": 8, "ramMb": 16384, "placaMae": "...",
                "biosFabricante": "Dell", "biosVersao": "1.2.3", "biosData": "2024-01-02" },
  "discos": [{ "nome": "C:", "tipo": "SSD", "tamanhoGb": 476.9, "modelo": "Samsung 980" }],
  "interfaces": [{ "nome": "Ethernet", "ip": "10.0.0.5", "mascara": "255.255.255.0", "mac": "aa:bb:...", "gateway": "10.0.0.1" }],
  "softwares": [{ "nome": "Google Chrome", "versao": "130.0", "editor": "Google LLC" }]
}
```

## Funcionalidades

- **Hosts descobertos (msf):** filtros por workspace, busca, situação, sub-rede e grupo; paginação e ordenação no servidor. Cada host recebe uma **situação**: *inventariado* (match por MAC; sem MAC, IP+hostname), *provável* (só o IP bate), *dispositivo conhecido*, *ignorado* ou *não identificado*. Ao expandir a linha aparecem serviços/portas, `host_details` e notas. Ações: "Adicionar" (formulário pré-preenchido), em lote (formulário um a um, reaproveitando os campos comuns, ou importação com patrimônio provisório) e classificação IPDiscover.
- **Sub-redes (IPDiscover):** por sub-rede, total de hosts vistos, inventariados, identificados, ignorados e não identificados, com barra de cobertura.
- **Inventário:** CRUD; filtros por responsável, setor, status, tipo, TAG, grupo, "não visto há N dias", sem responsável e patrimônio provisório; **exportação CSV** respeitando os filtros (inclusive grupo) e com os campos customizados (`;` e BOM, abre direto no Excel); seleção para adicionar a grupo estático.
- **Detalhe do item:** abas Geral, Hardware (CPU/RAM/BIOS + discos), Rede (interfaces msf/manual/importação), Software (alerta de proibidos), Serviços (msf, somente leitura) e **Histórico** (linha do tempo).
- **Sincronizar com msf:** mostra o diff (IP, MAC, hostname, SO, arquitetura) e aplica só os campos marcados. Campos manuais nunca são tocados, e valores vazios no msf não apagam dados.
- **Auditoria:** criação, alteração campo a campo, troca de responsável (com nomes), sincronização, importação, mesclagem e exclusão, registrando quem fez e quando.
- **Funcionários:** CRUD e ficha com os itens associados.
- **Grupos:** estáticos e **dinâmicos** (regras como "SO contém Windows 7 E status = em uso", "IP na sub-rede", "software instalado contém X", "dias sem ser visto > 30"), com teste da consulta antes de salvar.
- **Software:** dicionário (nome canônico, categoria, variações com `*`), tela de **não classificados** para agrupar variações, relatório **onde está instalado** e alertas de **proibidos**.
- **Duplicados:** por MAC, nº de série, hostname e/ou IP. A **mesclagem** permite escolher campo a campo e transfere interfaces, discos, softwares, campos customizados, grupos e histórico.
- **Dashboard:** totais por tipo, status, setor, SO e funcionário; sem responsável; sem patrimônio; hosts não identificados; duplicados; não vistos há mais de 30 dias; máquinas com software proibido.

## API REST

Todas as rotas exigem o cookie de sessão. Exceções: `POST /api/auth/login`, e `/api/msf/importar` e `/api/msf/ultimo-visto`, que também aceitam `Authorization: Bearer <IMPORT_API_TOKEN>`. Os erros seguem o formato `{ "erro": string, "detalhes"?: ... }`, com status 400 (validação), 401, 403, 404 e 409 (patrimônio/matrícula duplicados ou host já inventariado). As listagens retornam `{ dados, total, page, pageSize }`.

| Método | Rota | |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` · GET `/api/auth/me` | sessão |
| GET | `/api/msf/workspaces` | workspaces do msf |
| GET | `/api/msf/hosts?workspaceId&q&situacao&subrede&grupoId&page&pageSize&sort&dir` | hosts classificados |
| GET | `/api/msf/hosts/:id` | host + serviços + host_details + notas |
| GET | `/api/msf/subredes` | painel IPDiscover |
| POST | `/api/msf/importar` | importação em massa (`simular: true` = dry-run) |
| POST | `/api/msf/ultimo-visto` | atualiza o "último visto" de todos os itens |
| POST | `/api/msf/classificar` · GET `/api/msf/dispositivos` · DELETE `/api/msf/dispositivos/:id` | IPDiscover |
| GET/POST | `/api/itens` | listar (filtros) / criar (`confirmarDuplicado` para forçar) |
| GET | `/api/itens/verificar?patrimonio&mac&ip&hostname` | checagens do formulário |
| GET | `/api/itens/export?…` | CSV |
| GET/PATCH/DELETE | `/api/itens/:id` | item |
| GET/POST | `/api/itens/:id/sync` | diff / aplicar `{ campos: [...] }` |
| GET | `/api/itens/:id/historico` · `/secoes` · `/softwares` · `/servicos` | detalhe |
| PUT | `/api/itens/:id/hardware` | hardware |
| POST, PUT/DELETE | `/api/itens/:id/linhas/{discos,interfaces}`, `/api/itens/:id/linhas/{discos,interfaces,softwares}/:linhaId` | seções 1:N |
| POST | `/api/itens/:id/importar` | upload multipart (`arquivo`) |
| … | `/api/funcionarios`, `/api/campos` (admin), `/api/dicionario`, `/api/grupos`, `/api/duplicados`, `/api/dashboard` | demais módulos |

## Segurança

O sistema expõe dados de reconhecimento de rede. Por isso:

- **Nada fica aberto:** o middleware redireciona para `/login` e a API responde 401 sem sessão válida. Cada handler valida a sessão de novo (defesa em profundidade).
- **JWT** em cookie `httpOnly` + `SameSite=Lax`. Em produção use HTTPS (proxy reverso) com `COOKIE_SECURE=true`.
- **msf intocado:** usuário só com SELECT, `default_transaction_read_only` no role e na sessão, e consultas parametrizadas, com nomes de coluna para ordenação vindos de whitelist.
- Senhas com **bcrypt** (custo 12). O login devolve a mesma resposta e gasta o mesmo tempo quando o usuário não existe.
- O **token de importação** só vale em duas rotas e é comparado em tempo constante.
- O CSV neutraliza injeção de fórmula (`=`, `+`, `-`, `@`).
- Upload limitado a 10 MB. O XML é interpretado sem resolução de entidades externas.
- O container roda como usuário não-root, com filesystem read-only e `no-new-privileges`.
- **Troque a senha do `postgres` no Kali** (o servidor está acessível pela rede) e, no `pg_hba`, restrinja `inv_msf_ro` ao IP do servidor do inventário.

## Limitações conhecidas

- A situação de cada host (inventariado/desconhecido…) depende de dois bancos diferentes. Por isso a filtragem por situação e a paginação da tela de hosts são feitas na aplicação, sobre a lista leve de hosts do msf. Isso funciona bem até dezenas de milhares de hosts.
- O match sem MAC usa IP + hostname. Como o nmap raramente resolve hostname, na prática vira só IP para hosts de outras sub-redes (que não expõem MAC). Hosts em que só o IP bate aparecem como *provável*.
- `notes.data` do msf geralmente é um blob serializado (base64/Marshal) e é exibido truncado, como texto bruto.
