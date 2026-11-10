$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectRoot ".env.local"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Missing .env.local. Create it from env.example and add your local credentials."
}

$tempRoot = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) "Temp"
$buildContext = Join-Path $tempRoot ("resort-booking-docker-" + [guid]::NewGuid().ToString("N"))
$previousBuildContext = [Environment]::GetEnvironmentVariable("DOCKER_BUILD_CONTEXT")
New-Item -ItemType Directory -Path $buildContext | Out-Null

try {
  $excludeDirectories = @(
    (Join-Path $projectRoot ".git"),
    (Join-Path $projectRoot ".github"),
    (Join-Path $projectRoot ".vscode"),
    (Join-Path $projectRoot ".idea"),
    (Join-Path $projectRoot ".next"),
    (Join-Path $projectRoot ".vercel"),
    (Join-Path $projectRoot "node_modules"),
    (Join-Path $projectRoot "coverage"),
    (Join-Path $projectRoot "resort-booking")
  )
  $excludeFiles = @(".env", ".env.*", "*.md", ".gitignore", "pnpm-lock.yaml", "npm-debug.log*")
  $copyArgs = @(
    $projectRoot,
    $buildContext,
    "/E",
    "/A-:R",
    "/R:2",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/XD"
  ) + $excludeDirectories + @("/XF") + $excludeFiles

  & robocopy @copyArgs
  if ($LASTEXITCODE -ge 8) {
    throw "Failed to prepare Docker build context (robocopy exit code $LASTEXITCODE)."
  }

  $env:DOCKER_BUILD_CONTEXT = $buildContext
  Push-Location $projectRoot
  try {
    & docker compose --env-file $envFile up -d --build
    if ($LASTEXITCODE -ne 0) {
      throw "Docker Compose failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
    if ([System.IO.Directory]::Exists($buildContext)) {
      & attrib -R (Join-Path $buildContext "*") /S /D
      Remove-Item -LiteralPath $buildContext -Recurse -Force
    }
    if ($null -eq $previousBuildContext) {
      Remove-Item Env:\DOCKER_BUILD_CONTEXT -ErrorAction SilentlyContinue
    }
    else {
      $env:DOCKER_BUILD_CONTEXT = $previousBuildContext
    }
  }
}
catch {
  if ([System.IO.Directory]::Exists($buildContext)) {
    & attrib -R (Join-Path $buildContext "*") /S /D
    Remove-Item -LiteralPath $buildContext -Recurse -Force
  }
  if ($null -eq $previousBuildContext) {
    Remove-Item Env:\DOCKER_BUILD_CONTEXT -ErrorAction SilentlyContinue
  }
  else {
    $env:DOCKER_BUILD_CONTEXT = $previousBuildContext
  }
  throw
}
