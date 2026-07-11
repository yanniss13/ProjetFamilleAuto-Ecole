# Capture des 30 wireframes v2 en PNG (1440 px, pleine page).
# Point d'entrée PowerShell : délègue au script CDP (Edge headless), qui
# vérifie ensuite le compte, la taille (> 15 Ko) et la largeur exacte.
# Si node n'est pas dans le PATH (sandbox), utiliser le chemin nvm-windows.
$node = 'node'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $node = 'C:\nvm4w\nodejs\node.exe' }
& $node (Join-Path $PSScriptRoot 'capture-wireframes.cjs')
exit $LASTEXITCODE
