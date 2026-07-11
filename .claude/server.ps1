param([int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8080 }))

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving RANKD on http://localhost:$Port/"

$root = Split-Path -Parent $PSScriptRoot

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $path = $request.Url.LocalPath
    if ($path -eq "/") { $path = "/rankd.html" }
    $filePath = Join-Path $root ($path.TrimStart("/"))

    if (Test-Path $filePath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = switch ($ext) {
            ".html" { "text/html" }
            ".js"   { "application/javascript" }
            ".css"  { "text/css" }
            ".json" { "application/json" }
            default { "application/octet-stream" }
        }
        $response.ContentType = $contentType
        $response.KeepAlive = $false
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
    }
    $response.OutputStream.Close()
}
