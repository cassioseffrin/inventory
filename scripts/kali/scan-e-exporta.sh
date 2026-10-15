#!/usr/bin/env bash
# =====================================================================================
# Escaneia várias faixas de IP com o Metasploit (db_nmap) e exporta os hosts para o
# inventário (importação em massa via API, autenticada por token).
#
# Uso (no Kali, como root/sudo para o nmap conseguir MAC e detecção de SO):
#   export INV_URL=http://192.168.50.10:3000
#   export INV_TOKEN=<IMPORT_API_TOKEN do .env do inventário>
#   sudo -E ./scan-e-exporta.sh -w filial-sp 10.10.0.0/24 10.10.1.0/24
#
# Opções:
#   -w <workspace>   workspace do msf (criado se não existir).            padrão: default
#   -a "<args>"      argumentos do nmap.                                   padrão: -sS -sV -O --osscan-guess -T4
#   -d               só descoberta rápida (-sn), sem portas/serviços
#   -n               simular (dry-run): mostra o que seria importado, sem gravar
#   -x               não escanear; só exportar o que já está no msf
#   -t <tipo>        tipo padrão dos itens novos (desktop|notebook|servidor|impressora|switch|smart_pos|outro)
#   -s <status>      status dos itens novos (em_uso|estoque|manutencao|baixado). padrão: em_uso
#   -g <tag>         TAG aplicada aos itens novos (ex.: filial, cliente, centro de custo)
#   -l <local>       localização aplicada aos itens novos
#   -p <prefixo>     prefixo do patrimônio provisório.                     padrão: PROV
#   -u               NÃO atualizar itens já inventariados (por padrão IP/hostname/SO são atualizados)
#
# Requisitos: msfconsole com banco conectado (msfdb init / msfdb start), curl e python3.
# =====================================================================================
set -euo pipefail

WS="default"
NMAP_ARGS="-sS -sV -O --osscan-guess -T4"
SIMULAR=false
SEM_SCAN=false
TIPO="outro"
STATUS="em_uso"
TAG=""
LOCAL=""
PREFIXO="PROV"
ATUALIZAR=true

while getopts "w:a:dnxt:s:g:l:p:uh" opt; do
  case "$opt" in
    w) WS="$OPTARG" ;;
    a) NMAP_ARGS="$OPTARG" ;;
    d) NMAP_ARGS="-sn -T4" ;;
    n) SIMULAR=true ;;
    x) SEM_SCAN=true ;;
    t) TIPO="$OPTARG" ;;
    s) STATUS="$OPTARG" ;;
    g) TAG="$OPTARG" ;;
    l) LOCAL="$OPTARG" ;;
    p) PREFIXO="$OPTARG" ;;
    u) ATUALIZAR=false ;;
    h | *) sed -n '2,30p' "$0"; exit 1 ;;
  esac
done
shift $((OPTIND - 1))
FAIXAS=("$@")

: "${INV_URL:?defina INV_URL (ex.: http://servidor:3000)}"
: "${INV_TOKEN:?defina INV_TOKEN (IMPORT_API_TOKEN do inventário)}"
if [[ ${#FAIXAS[@]} -eq 0 && "$SEM_SCAN" == false ]]; then
  echo "informe ao menos uma faixa (CIDR), ex.: 192.168.50.0/24" >&2
  exit 1
fi
for f in "${FAIXAS[@]}"; do
  [[ "$f" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ ]] || { echo "faixa inválida: $f" >&2; exit 1; }
done
[[ "$WS" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "nome de workspace inválido: $WS" >&2; exit 1; }

if [[ "$SEM_SCAN" == false ]]; then
  [[ $EUID -ne 0 ]] && echo "aviso: sem root o nmap não obtém MAC nem detecta SO (-O). Use sudo -E." >&2
  RC=$(mktemp --suffix=.rc)
  trap 'rm -f "$RC"' EXIT
  {
    echo "db_status"
    echo "workspace -a $WS"
    echo "workspace $WS"
    for f in "${FAIXAS[@]}"; do
      echo "echo '>>> escaneando $f'"
      echo "db_nmap $NMAP_ARGS $f"
    done
    echo "hosts -c address,mac,name,os_name"
    echo "exit"
  } >"$RC"
  echo "==> msfconsole: ${#FAIXAS[@]} faixa(s) no workspace '$WS' com: nmap $NMAP_ARGS"
  msfconsole -q -r "$RC"
fi

SUBREDES_JSON=$(printf '%s\n' "${FAIXAS[@]:-}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
CORPO=$(WS="$WS" SUB="$SUBREDES_JSON" SIM="$SIMULAR" TIPO="$TIPO" STATUS="$STATUS" TAG="$TAG" LOCAL="$LOCAL" PREF="$PREFIXO" ATU="$ATUALIZAR" python3 - <<'PY'
import json, os
d = {
  "workspaceNome": os.environ["WS"],
  "subredes": json.loads(os.environ["SUB"]) or None,
  "simular": os.environ["SIM"] == "true",
  "tipoPadrao": os.environ["TIPO"],
  "statusPadrao": os.environ["STATUS"],
  "prefixoPatrimonio": os.environ["PREF"],
  "atualizarExistentes": os.environ["ATU"] == "true",
  "tag": os.environ["TAG"] or None,
  "localizacao": os.environ["LOCAL"] or None,
}
print(json.dumps({k: v for k, v in d.items() if v is not None}))
PY
)

echo "==> exportando para $INV_URL $( [[ "$SIMULAR" == true ]] && echo '(SIMULAÇÃO)')"
RESP=$(curl -sS --fail-with-body -X POST "$INV_URL/api/msf/importar" \
  -H "Authorization: Bearer $INV_TOKEN" -H 'content-type: application/json' -d "$CORPO") || {
  echo "falha na exportação: $RESP" >&2
  exit 1
}

RESP="$RESP" python3 - <<'PY'
import json, os
r = json.loads(os.environ["RESP"])
sim = r.get("simulado")
print("analisados: %d | %s: %d | %s: %d | ignorados: %d" % (
    r["analisados"], "seriam criados" if sim else "criados", len(r["criados"]),
    "seriam atualizados" if sim else "atualizados", len(r["atualizados"]), len(r["ignorados"])))
for c in r["criados"]:
    print("  + %-16s %-18s %-10s %s" % (c["ip"], c.get("mac") or "-", c["tipo"], c.get("patrimonio") or ""))
for a in r["atualizados"]:
    if a["campos"]:
        print("  ~ %-16s %s" % (a["ip"], ", ".join(a["campos"])))
motivos = {}
for i in r["ignorados"]:
    m = i["motivo"].split(" (")[0].split(":")[0]
    motivos[m] = motivos.get(m, 0) + 1
for m, n in motivos.items():
    print("  - %d ignorado(s): %s" % (n, m))
PY
