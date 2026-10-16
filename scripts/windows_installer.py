"""Generate self-contained Windows installers and verify every delta against 0.1."""
from pathlib import Path
import base64
import difflib
import gzip
import hashlib
import json
import textwrap

ROOT = Path(__file__).resolve().parents[1]
BASELINE = json.loads(gzip.decompress((ROOT / "scripts/baseline-0.1.json.gz").read_bytes()))
PATHS = ["manifest.json", *[str(path.relative_to(ROOT)) for path in sorted((ROOT / "src").glob("*")) if path.is_file()]]
CURRENT = {path: (ROOT / path).read_text(encoding="utf-8") for path in PATHS}


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def records(update):
    result = []
    for path, text in CURRENT.items():
        record = {"path": path, "after": digest(text)}
        if update and path in BASELINE:
            old = BASELINE[path]
            # .NET string offsets and Python offsets coincide for this source (BMP).
            assert all(ord(char) <= 0xFFFF for char in old + text)
            changes = [
                {"start": start, "count": end - start, "text": text[new_start:new_end]}
                for tag, start, end, new_start, new_end in difflib.SequenceMatcher(None, old, text, autojunk=False).get_opcodes()
                if tag != "equal"
            ][::-1]
            rebuilt = old
            for edit in changes:
                rebuilt = rebuilt[:edit["start"]] + edit["text"] + rebuilt[edit["start"] + edit["count"]:]
            assert rebuilt == text
            assert digest(rebuilt) == record["after"]
            record.update(before=digest(old), edits=changes)
        else:
            record.update(before=None, text=text)
        result.append(record)
    # Simulate first application, re-application and protection of modified source.
    files = dict(BASELINE) if update else {}
    for _ in range(2):
        for item in result:
            content = files.get(item["path"])
            if content is not None and digest(content) == item["after"]:
                continue
            if item["before"]:
                assert content is not None and digest(content) == item["before"]
                for edit in item["edits"]:
                    content = content[:edit["start"]] + edit["text"] + content[edit["start"] + edit["count"]:]
            else:
                assert content is None
                content = item["text"]
            assert digest(content) == item["after"]
            files[item["path"]] = content
        assert files == CURRENT
    return result


COMMON = r"""& {
$ErrorActionPreference = 'Stop'
$pacote = @'
@PAYLOAD@
'@
$bytes = [Convert]::FromBase64String($pacote)
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
if ($hash -ne '@HASH@') { throw 'O bloco recebido esta diferente do original. Nenhum arquivo foi atualizado.' }
$memoria = [IO.MemoryStream]::new($bytes, $false)
$gzip = [IO.Compression.GZipStream]::new($memoria, [IO.Compression.CompressionMode]::Decompress)
$leitor = [IO.StreamReader]::new($gzip, [Text.Encoding]::UTF8)
try { $dados = $leitor.ReadToEnd() | ConvertFrom-Json } finally { $leitor.Dispose() }
$utf8 = [Text.UTF8Encoding]::new($false)
function Get-TextHash([string]$texto) {
  $alg = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($alg.ComputeHash($utf8.GetBytes($texto)))).Replace('-', '').ToLowerInvariant() } finally { $alg.Dispose() }
}
$desktop = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($desktop)) { throw 'Area de Trabalho nao encontrada.' }
@DESTINATION@
$preparados = @()
foreach ($arquivo in $dados.files) {
  if ($arquivo.path -notmatch '^(manifest\.json|src/(popup\.(html|css|js)|fill\.js|import\.js|dates\.js|vault\.js|profiles\.js))$') { throw 'Caminho invalido no pacote.' }
  $caminho = Join-Path $destino $arquivo.path
  $existe = Test-Path -LiteralPath $caminho -PathType Leaf
  if ($existe) {
    $texto = [IO.File]::ReadAllText($caminho, $utf8)
    $atual = Get-TextHash $texto
    if ($atual -ne $arquivo.after) {
      if (!$arquivo.before -or $atual -ne $arquivo.before) { throw ('Arquivo alterado ou de outra versao: ' + $arquivo.path + '. Nenhum arquivo foi atualizado.') }
      foreach ($edicao in $arquivo.edits) { $texto = $texto.Remove([int]$edicao.start, [int]$edicao.count).Insert([int]$edicao.start, [string]$edicao.text) }
    }
  } else {
    if ($arquivo.before) { throw ('Arquivo da instalacao anterior nao encontrado: ' + $arquivo.path) }
    $texto = [string]$arquivo.text
  }
  if ((Get-TextHash $texto) -ne $arquivo.after) { throw ('Falha ao verificar ' + $arquivo.path + '. Nenhum arquivo foi atualizado.') }
  $preparados += [pscustomobject]@{ path = $arquivo.path; text = $texto; existed = $existe }
}
@BACKUP@
foreach ($arquivo in $preparados) {
  $caminho = Join-Path $destino $arquivo.path
  New-Item -ItemType Directory -Path (Split-Path $caminho -Parent) -Force | Out-Null
  [IO.File]::WriteAllText($caminho, $arquivo.text, $utf8)
}
Write-Host 'Extensao 0.2 pronta. Abra chrome://extensions ou edge://extensions e clique em Recarregar.' -ForegroundColor Green
Write-Host $destino
Start-Process explorer.exe -ArgumentList ('"{0}"' -f $destino)
}
"""

UPDATE_DESTINATION = r"""$pastas = @(Get-ChildItem -LiteralPath $desktop -Directory -Filter 'Meaple-Preenchimento-*' | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'manifest.json') })
if ($pastas.Count -eq 1) { $destino = $pastas[0].FullName } else {
  Add-Type -AssemblyName System.Windows.Forms
  $seletor = New-Object System.Windows.Forms.FolderBrowserDialog
  $seletor.Description = 'Selecione a pasta da extensao Meaple que voce ja instalou'
  $seletor.SelectedPath = $desktop
  try {
    if ($seletor.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Atualizacao cancelada.' }
    $destino = $seletor.SelectedPath
  } finally { $seletor.Dispose() }
}"""
INSTALL_DESTINATION = r"""$destino = Join-Path $desktop ('Meaple-Preenchimento-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destino -ErrorAction Stop | Out-Null"""
BACKUP = r"""$backup = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('Meaple-Backups\' + [Guid]::NewGuid().ToString('N'))
foreach ($arquivo in $preparados) {
  if (!$arquivo.existed) { continue }
  $copia = Join-Path $backup $arquivo.path
  New-Item -ItemType Directory -Path (Split-Path $copia -Parent) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $destino $arquivo.path) -Destination $copia -ErrorAction Stop
}
Write-Host ('Backup dos arquivos anteriores: ' + $backup)"""


for update, filename in [(False, "install-windows.ps1"), (True, "update-windows.ps1")]:
    payload = gzip.compress(json.dumps({"files": records(update)}, ensure_ascii=False, separators=(",", ":")).encode(), compresslevel=9, mtime=0)
    encoded = base64.b64encode(payload).decode()
    script = COMMON.replace("@PAYLOAD@", "\n".join(textwrap.wrap(encoded, 100))).replace("@HASH@", hashlib.sha256(payload).hexdigest()).replace("@DESTINATION@", UPDATE_DESTINATION if update else INSTALL_DESTINATION).replace("@BACKUP@", BACKUP if update else "")
    embedded = script.split("$pacote = @'\n", 1)[1].split("\n'@", 1)[0]
    assert base64.b64decode(embedded) == payload
    (ROOT / "scripts" / filename).write_text(script, encoding="utf-8")
    print(f"{filename}: {len(encoded)} caracteres de payload; SHA256 {hashlib.sha256(payload).hexdigest()}")
print("Verificado: instalacao, atualizacao e repeticao reconstroem exatamente todos os arquivos atuais.")
