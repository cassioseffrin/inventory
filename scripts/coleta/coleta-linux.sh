#!/usr/bin/env bash
# =====================================================================================
# Coleta software e hardware de uma máquina Linux e gera <hostname>.json para importar no
# inventário (Inventário > item > aba Software > "Enviar arquivo").
#
#   ./coleta-linux.sh [diretório-de-saída]
#
# Com sudo também coleta número de série/BIOS (dmidecode). Requer python3 (para gerar o JSON).
# =====================================================================================
set -uo pipefail
SAIDA="${1:-.}"
HOST="$(hostname -s 2>/dev/null || hostname)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# softwares: dpkg (Debian/Ubuntu/Kali), rpm (RHEL/Fedora/SUSE) ou apk (Alpine)
if command -v dpkg-query >/dev/null; then
  dpkg-query -W -f='${Package}\t${Version}\t${Maintainer}\n' >"$TMP/sw.tsv" 2>/dev/null
elif command -v rpm >/dev/null; then
  rpm -qa --qf '%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n' >"$TMP/sw.tsv" 2>/dev/null
elif command -v apk >/dev/null; then
  apk info -v 2>/dev/null | sed -E 's/^(.*)-([0-9][^-]*-r[0-9]+)$/\1\t\2\t/' >"$TMP/sw.tsv"
else
  : >"$TMP/sw.tsv"
fi

dmi() { [[ -r /sys/class/dmi/id/$1 ]] && cat "/sys/class/dmi/id/$1" 2>/dev/null; }
command -v lsblk >/dev/null && lsblk -J -d -b -o NAME,TYPE,SIZE,VENDOR,MODEL,SERIAL,ROTA >"$TMP/discos.json" 2>/dev/null
command -v ip >/dev/null && ip -j addr >"$TMP/ip.json" 2>/dev/null
command -v ip >/dev/null && ip -j route show default >"$TMP/rota.json" 2>/dev/null

export HOST TMP
export FAB="$(dmi sys_vendor)" MOD="$(dmi product_name)" SERIE="$(dmi product_serial)"
export BIOS_FAB="$(dmi bios_vendor)" BIOS_VER="$(dmi bios_version)" BIOS_DATA="$(dmi bios_date)"
export PLACA="$(dmi board_vendor) $(dmi board_name)"
export CPU="$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//')"
export NUCLEOS="$(nproc 2>/dev/null)"
export RAM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
export OS="$( . /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}")"

python3 - "$SAIDA/$HOST.json" <<'PY'
import json, os, sys
e, tmp = os.environ, os.environ["TMP"]
def ler(n, padrao):
    try:
        with open(os.path.join(tmp, n)) as f: return json.load(f)
    except Exception: return padrao

softwares = []
with open(os.path.join(tmp, "sw.tsv"), errors="replace") as f:
    for linha in f:
        p = linha.rstrip("\n").split("\t")
        if p and p[0]:
            softwares.append({"nome": p[0], "versao": p[1] if len(p) > 1 else None, "editor": (p[2] if len(p) > 2 else None) or None})

discos = [{"nome": d.get("name"), "tipo": "HDD" if d.get("rota") in (True, "1") else "SSD",
           "tamanhoGb": round(int(d.get("size") or 0) / 1024**3, 2), "fabricante": (d.get("vendor") or "").strip() or None,
           "modelo": d.get("model"), "numeroSerie": d.get("serial")}
          for d in ler("discos.json", {}).get("blockdevices", []) if d.get("type") == "disk"]

gw = next((r.get("gateway") for r in ler("rota.json", [])), None)
interfaces = []
for i in ler("ip.json", []):
    if i.get("ifname") == "lo": continue
    v4 = [a for a in i.get("addr_info", []) if a.get("family") == "inet"]
    for a in v4 or [{}]:
        interfaces.append({"nome": i.get("ifname"), "ip": a.get("local"), "mascara": str(a["prefixlen"]) if "prefixlen" in a else None,
                           "mac": i.get("address"), "gateway": gw})

ram = int(e.get("RAM_KB") or 0) // 1024
coleta = {
    "hostname": e["HOST"], "osName": e.get("OS"),
    "hardware": {"fabricante": e.get("FAB") or None, "modelo": e.get("MOD") or None, "numeroSerie": e.get("SERIE") or None,
                 "cpu": e.get("CPU") or None, "cpuNucleos": int(e["NUCLEOS"]) if e.get("NUCLEOS") else None, "ramMb": ram or None,
                 "placaMae": e.get("PLACA", "").strip() or None, "biosFabricante": e.get("BIOS_FAB") or None,
                 "biosVersao": e.get("BIOS_VER") or None, "biosData": e.get("BIOS_DATA") or None},
    "discos": discos, "interfaces": interfaces, "softwares": softwares,
}
with open(sys.argv[1], "w") as f: json.dump(coleta, f, ensure_ascii=False, indent=1)
print(f"Coleta gravada em {sys.argv[1]} ({len(softwares)} softwares)")
PY
