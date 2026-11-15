# One local instance, overwritten by each build. Run from anywhere.
#
#   ./deploy/local/refresh.ps1            # rebuild the image as shippintech-mail:local, replace the container
#   ./deploy/local/refresh.ps1 -NoBuild   # only bring the stack up (after a Docker Desktop restart)
#
# There is one compose project (shippintech-local) and one image tag (:local). Volumes are never
# touched. Rebuilding under the same tag untags the previous build; nothing is pruned globally,
# so other projects' images are left alone. To reclaim the old layers: docker image prune.
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = Join-Path $PSScriptRoot 'compose.yaml'
if (-not $NoBuild) {
    docker build -f (Join-Path $root 'Dockerfile.fdb') -t shippintech-mail:local $root
    if ($LASTEXITCODE -ne 0) { throw 'Image build failed; the running instance was left as it was.' }
}
docker compose -f $compose up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'The stack did not become healthy; inspect it with docker compose ps.' }
Write-Output 'Local instance is up: http://127.0.0.1:28080/mail'
