<#
.SYNOPSIS
  Coleta software e hardware de uma máquina Windows e gera um JSON para importar no inventário
  (Inventário > item > aba Software > "Enviar arquivo").

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\coleta-windows.ps1
  powershell -ExecutionPolicy Bypass -File .\coleta-windows.ps1 -Saida \\servidor\coletas

  Gera <HOSTNAME>.json no diretório indicado (padrão: diretório atual). Não precisa de privilégio de administrador.
#>
param([string]$Saida = ".")

$ErrorActionPreference = 'SilentlyContinue'

# --- softwares instalados (32 e 64 bits, máquina e usuário atual)
$chaves = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$softwares = Get-ItemProperty $chaves |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
  Sort-Object DisplayName, DisplayVersion -Unique |
  ForEach-Object {
    [ordered]@{
      nome           = $_.DisplayName.Trim()
      versao         = $_.DisplayVersion
      editor         = $_.Publisher
      dataInstalacao = $_.InstallDate
    }
  }

# --- hardware
$cs   = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu  = Get-CimInstance Win32_Processor | Select-Object -First 1
$mb   = Get-CimInstance Win32_BaseBoard
$os   = Get-CimInstance Win32_OperatingSystem

$discos = Get-CimInstance Win32_DiskDrive | ForEach-Object {
  [ordered]@{
    nome        = $_.DeviceID
    tipo        = $_.MediaType
    tamanhoGb   = [math]::Round($_.Size / 1GB, 2)
    fabricante  = $_.Manufacturer
    modelo      = $_.Model
    numeroSerie = ("$($_.SerialNumber)").Trim()
  }
}

$interfaces = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = True' | ForEach-Object {
  [ordered]@{
    nome    = $_.Description
    ip      = ($_.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
    mascara = ($_.IPSubnet | Select-Object -First 1)
    mac     = $_.MACAddress
    gateway = ($_.DefaultIPGateway | Select-Object -First 1)
  }
}

$coleta = [ordered]@{
  hostname   = $env:COMPUTERNAME
  osName     = "$($os.Caption) $($os.Version)"
  hardware   = [ordered]@{
    fabricante     = $cs.Manufacturer
    modelo         = $cs.Model
    numeroSerie    = $bios.SerialNumber
    cpu            = $cpu.Name.Trim()
    cpuNucleos     = $cpu.NumberOfCores
    ramMb          = [math]::Round($cs.TotalPhysicalMemory / 1MB)
    placaMae       = "$($mb.Manufacturer) $($mb.Product)".Trim()
    biosFabricante = $bios.Manufacturer
    biosVersao     = $bios.SMBIOSBIOSVersion
    biosData       = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { $null }
  }
  discos     = @($discos)
  interfaces = @($interfaces)
  softwares  = @($softwares)
}

$arquivo = Join-Path $Saida "$($env:COMPUTERNAME).json"
$coleta | ConvertTo-Json -Depth 5 | Out-File -FilePath $arquivo -Encoding utf8
Write-Host "Coleta gravada em $arquivo ($($softwares.Count) softwares)"
