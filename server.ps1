$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$UsersFile = Join-Path $Root "users.json"
$Port = if ($env:PORT) { [int]$env:PORT } else { 8000 }

Add-Type -AssemblyName System.Net.Http

function Read-Users {
  if (-not (Test-Path -LiteralPath $UsersFile)) {
    return @()
  }

  $content = Get-Content -LiteralPath $UsersFile -Raw
  if ([string]::IsNullOrWhiteSpace($content)) {
    return @()
  }

  $users = $content | ConvertFrom-Json
  if ($null -eq $users) {
    return @()
  }

  return @($users)
}

function Write-Users($users) {
  $users | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $UsersFile -Encoding UTF8
}

function New-PasswordHash($password, $saltBase64) {
  $salt = if ($saltBase64) {
    [Convert]::FromBase64String($saltBase64)
  } else {
    $bytes = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $bytes
  }

  $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
    [string]$password,
    $salt,
    120000,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )

  return @{
    salt = [Convert]::ToBase64String($salt)
    hash = [Convert]::ToBase64String($derive.GetBytes(32))
  }
}

function Test-Password($password, $salt, $storedHash) {
  $computed = New-PasswordHash $password $salt
  $left = [Convert]::FromBase64String($computed.hash)
  $right = [Convert]::FromBase64String($storedHash)

  if ($left.Length -ne $right.Length) {
    return $false
  }

  $difference = 0
  for ($i = 0; $i -lt $left.Length; $i++) {
    $difference = $difference -bor ($left[$i] -bxor $right[$i])
  }

  return $difference -eq 0
}

function Send-Json($response, $status, $body) {
  $json = $body | ConvertTo-Json -Depth 5
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $status
  $response.ContentType = "application/json"
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function Read-JsonBody($request) {
  $reader = [System.IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
  $body = $reader.ReadToEnd()
  $reader.Close()

  if ([string]::IsNullOrWhiteSpace($body)) {
    return @{}
  }

  return $body | ConvertFrom-Json
}

function Send-StaticFile($response, $requestPath) {
  if ($requestPath -eq "/") {
    $requestPath = "/index.html"
  }

  $relativePath = [Uri]::UnescapeDataString($requestPath.TrimStart("/")) -replace "/", [System.IO.Path]::DirectorySeparatorChar
  $filePath = Join-Path $Root $relativePath
  $fullPath = [System.IO.Path]::GetFullPath($filePath)
  $rootPath = [System.IO.Path]::GetFullPath($Root)

  if (-not $fullPath.StartsWith($rootPath) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    Send-Json $response 404 @{ message = "File not found." }
    return
  }

  $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
  $contentType = switch ($extension) {
    ".html" { "text/html" }
    ".css" { "text/css" }
    ".js" { "application/javascript" }
    ".json" { "application/json" }
    default { "application/octet-stream" }
  }

  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  $response.StatusCode = 200
  $response.ContentType = $contentType
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function Handle-Signup($response, $request) {
  $data = Read-JsonBody $request
  $name = [string]$data.name
  $email = ([string]$data.email).Trim().ToLowerInvariant()
  $password = [string]$data.password

  if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($email) -or $password.Length -lt 6) {
    Send-Json $response 400 @{ message = "Name, email, and a 6 character password are required." }
    return
  }

  $users = @(Read-Users)
  if ($users | Where-Object { $_.email -eq $email }) {
    Send-Json $response 409 @{ message = "That email is already signed up. Try logging in." }
    return
  }

  $passwordData = New-PasswordHash $password $null
  $users += [pscustomobject]@{
    name = $name.Trim()
    email = $email
    salt = $passwordData.salt
    passwordHash = $passwordData.hash
  }

  Write-Users $users
  Send-Json $response 201 @{ name = $name.Trim(); email = $email }
}

function Handle-Login($response, $request) {
  $data = Read-JsonBody $request
  $email = ([string]$data.email).Trim().ToLowerInvariant()
  $password = [string]$data.password

  foreach ($user in Read-Users) {
    if ($user.email -eq $email -and (Test-Password $password $user.salt $user.passwordHash)) {
      Send-Json $response 200 @{ name = $user.name; email = $user.email }
      return
    }
  }

  Send-Json $response 401 @{ message = "Email or password does not match a saved account." }
}

function Read-HeaderPairs($headers) {
  $pairs = @{}
  if ($null -eq $headers) {
    return $pairs
  }

  foreach ($header in @($headers)) {
    $name = ([string]$header.name).Trim()
    $value = [string]$header.value
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $pairs[$name] = $value
    }
  }

  return $pairs
}

function New-ApiTesterResult($status, $statusText, $timeMs, $headers, $body, $contentType) {
  return @{
    status = $status
    statusText = $statusText
    timeMs = $timeMs
    headers = $headers
    body = $body
    contentType = $contentType
  }
}

function Test-LocalTarget($targetUri) {
  $targetPort = if ($targetUri.Port -eq -1) { 80 } else { $targetUri.Port }
  return $targetUri.IsLoopback -and $targetPort -eq $Port
}

function Invoke-LocalApiTarget($method, $targetUri, $body, $elapsedMs) {
  $path = $targetUri.AbsolutePath
  $headers = @{ "X-Handled-By" = "Local API tester bridge" }

  if ($method -eq "GET") {
    $requestPath = if ($path -eq "/") { "/index.html" } else { $path }
    $relativePath = [Uri]::UnescapeDataString($requestPath.TrimStart("/")) -replace "/", [System.IO.Path]::DirectorySeparatorChar
    $filePath = Join-Path $Root $relativePath
    $fullPath = [System.IO.Path]::GetFullPath($filePath)
    $rootPath = [System.IO.Path]::GetFullPath($Root)

    if (-not $fullPath.StartsWith($rootPath) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      return New-ApiTesterResult 404 "Not Found" $elapsedMs $headers '{"message":"File not found."}' "application/json"
    }

    $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    $contentType = switch ($extension) {
      ".html" { "text/html" }
      ".css" { "text/css" }
      ".js" { "application/javascript" }
      ".json" { "application/json" }
      default { "text/plain" }
    }

    return New-ApiTesterResult 200 "OK" $elapsedMs $headers ([System.IO.File]::ReadAllText($fullPath)) $contentType
  }

  if ($method -eq "POST" -and $path -eq "/api/login") {
    try {
      $data = $body | ConvertFrom-Json
      $email = ([string]$data.email).Trim().ToLowerInvariant()
      $password = [string]$data.password

      foreach ($user in Read-Users) {
        if ($user.email -eq $email -and (Test-Password $password $user.salt $user.passwordHash)) {
          return New-ApiTesterResult 200 "OK" $elapsedMs $headers (@{ name = $user.name; email = $user.email } | ConvertTo-Json) "application/json"
        }
      }

      return New-ApiTesterResult 401 "Unauthorized" $elapsedMs $headers '{"message":"Email or password does not match a saved account."}' "application/json"
    } catch {
      return New-ApiTesterResult 400 "Bad Request" $elapsedMs $headers '{"message":"Invalid JSON body."}' "application/json"
    }
  }

  return New-ApiTesterResult 404 "Not Found" $elapsedMs $headers '{"message":"Local route not found by API tester bridge."}' "application/json"
}

function Invoke-SingleLoadRequest($client, $method, $targetUri, $body, $isLocalTarget) {
  $timer = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    if ($isLocalTarget) {
      $localResult = Invoke-LocalApiTarget $method $targetUri $body 0
      $timer.Stop()
      return [pscustomobject]@{
        ok = ($localResult.status -ge 200 -and $localResult.status -lt 400)
        status = $localResult.status
        timeMs = [int]$timer.ElapsedMilliseconds
        error = $null
      }
    }

    $message = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($method), $targetUri)
    if ($method -notin @("GET", "HEAD") -and -not [string]::IsNullOrWhiteSpace($body)) {
      $message.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
    }

    $apiResponse = $client.SendAsync($message).GetAwaiter().GetResult()
    $timer.Stop()
    $status = [int]$apiResponse.StatusCode
    $message.Dispose()

    return [pscustomobject]@{
      ok = ($status -ge 200 -and $status -lt 400)
      status = $status
      timeMs = [int]$timer.ElapsedMilliseconds
      error = $null
    }
  } catch {
    $timer.Stop()
    return [pscustomobject]@{
      ok = $false
      status = 0
      timeMs = [int]$timer.ElapsedMilliseconds
      error = $_.Exception.Message
    }
  }
}

function Handle-LoadTest($response, $request) {
  $data = Read-JsonBody $request
  $users = [int]$data.users
  $method = ([string]$data.method).Trim().ToUpperInvariant()
  $urlText = ([string]$data.url).Trim()
  $body = [string]$data.body
  $concurrency = [int]$data.concurrency

  if ($users -lt 1) {
    Send-Json $response 400 @{ message = "Select at least one user or machine." }
    return
  }

  if ([string]::IsNullOrWhiteSpace($method)) {
    $method = "GET"
  }

  if ($concurrency -lt 1) {
    $concurrency = 10
  }

  $allowedMethods = @("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD")
  if (-not ($allowedMethods -contains $method)) {
    Send-Json $response 400 @{ message = "Unsupported HTTP method for load testing." }
    return
  }

  try {
    $targetUri = [Uri]$urlText
  } catch {
    Send-Json $response 400 @{ message = "Enter a valid absolute URL." }
    return
  }

  if ($targetUri.Scheme -ne "http" -and $targetUri.Scheme -ne "https") {
    Send-Json $response 400 @{ message = "Only http and https URLs are supported." }
    return
  }

  $actualRequests = [Math]::Min($users, 1000)
  $concurrency = [Math]::Min($concurrency, 100000)
  $isLocalTarget = Test-LocalTarget $targetUri
  $results = New-Object System.Collections.ArrayList
  $errorSamples = New-Object System.Collections.ArrayList
  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $totalTimer = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $i = 0
    while ($i -lt $actualRequests) {
      if ($isLocalTarget) {
        # Sequential for local targets — the server is single-threaded and cannot
        # concurrently handle requests to itself while processing this load test
        $result = Invoke-SingleLoadRequest $client $method $targetUri $body $true
        [void]$results.Add($result)
        $i++
      } else {
        # Fire up to $concurrency requests simultaneously as async tasks
        $batchSize = [Math]::Min($concurrency, $actualRequests - $i)
        $batch = New-Object System.Collections.ArrayList

        for ($j = 0; $j -lt $batchSize; $j++) {
          $msg = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($method), $targetUri)
          if ($method -notin @("GET", "HEAD") -and -not [string]::IsNullOrWhiteSpace($body)) {
            $msg.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
          }
          [void]$batch.Add([pscustomobject]@{
            Message = $msg
            Task    = $client.SendAsync($msg)
            Timer   = [System.Diagnostics.Stopwatch]::StartNew()
          })
        }

        foreach ($entry in $batch) {
          try {
            $apiResp = $entry.Task.GetAwaiter().GetResult()
            $entry.Timer.Stop()
            $status = [int]$apiResp.StatusCode
            [void]$results.Add([pscustomobject]@{
              ok     = ($status -ge 200 -and $status -lt 400)
              status = $status
              timeMs = [int]$entry.Timer.ElapsedMilliseconds
              error  = $null
            })
          } catch {
            $entry.Timer.Stop()
            [void]$results.Add([pscustomobject]@{
              ok     = $false
              status = 0
              timeMs = [int]$entry.Timer.ElapsedMilliseconds
              error  = $_.Exception.Message
            })
          }
          try { $entry.Message.Dispose() } catch {}
        }

        $i += $batchSize
      }
    }
  } finally {
    $totalTimer.Stop()
    $client.Dispose()
  }

  $successCount = 0
  $errorCount = 0
  $sumMs = 0
  $fastestMs = [int]::MaxValue
  $slowestMs = 0

  foreach ($item in $results) {
    $sumMs += $item.timeMs
    if ($item.timeMs -lt $fastestMs) { $fastestMs = $item.timeMs }
    if ($item.timeMs -gt $slowestMs) { $slowestMs = $item.timeMs }

    if ($item.ok) {
      $successCount++
    } else {
      $errorCount++
      if ($errorSamples.Count -lt 8) {
        [void]$errorSamples.Add(@{
          status  = $item.status
          message = if ($item.error) { $item.error } else { "HTTP status $($item.status)" }
          timeMs  = $item.timeMs
        })
      }
    }
  }

  if ($fastestMs -eq [int]::MaxValue) { $fastestMs = 0 }
  $averageMs = if ($results.Count -gt 0) { [Math]::Round($sumMs / $results.Count, 2) } else { 0 }
  $requestsPerSecond = if ($totalTimer.Elapsed.TotalSeconds -gt 0) { [Math]::Round($results.Count / $totalTimer.Elapsed.TotalSeconds, 2) } else { 0 }

  Send-Json $response 200 @{
    virtualUsers      = $users
    actualRequests    = $actualRequests
    concurrency       = $concurrency
    isLocalTarget     = $isLocalTarget
    successCount      = $successCount
    errorCount        = $errorCount
    averageMs         = $averageMs
    fastestMs         = $fastestMs
    slowestMs         = $slowestMs
    totalTimeMs       = $totalTimer.ElapsedMilliseconds
    requestsPerSecond = $requestsPerSecond
    errors            = @($errorSamples)
  }
}

function Handle-ApiRequest($response, $request) {
  $data = Read-JsonBody $request
  $method = ([string]$data.method).Trim().ToUpperInvariant()
  $urlText = ([string]$data.url).Trim()
  $body = [string]$data.body

  if ([string]::IsNullOrWhiteSpace($method)) {
    $method = "GET"
  }

  $allowedMethods = @("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
  if (-not ($allowedMethods -contains $method)) {
    Send-Json $response 400 @{ message = "Unsupported HTTP method." }
    return
  }

  if ([string]::IsNullOrWhiteSpace($urlText)) {
    Send-Json $response 400 @{ message = "Request URL is required." }
    return
  }

  try {
    $targetUri = [Uri]$urlText
  } catch {
    Send-Json $response 400 @{ message = "Enter a valid absolute URL." }
    return
  }

  if ($targetUri.Scheme -ne "http" -and $targetUri.Scheme -ne "https") {
    Send-Json $response 400 @{ message = "Only http and https URLs are supported." }
    return
  }

  $headers = Read-HeaderPairs $data.headers
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  if (Test-LocalTarget $targetUri) {
    $stopwatch.Stop()
    Send-Json $response 200 (Invoke-LocalApiTarget $method $targetUri $body $stopwatch.ElapsedMilliseconds)
    return
  }

  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(30)
  $requestMessage = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($method), $targetUri)

  foreach ($key in $headers.Keys) {
    if ($key -ieq "Content-Type") {
      continue
    }

    [void]$requestMessage.Headers.TryAddWithoutValidation($key, [string]$headers[$key])
  }

  if ($method -notin @("GET", "HEAD") -and -not [string]::IsNullOrEmpty($body)) {
    $contentType = if ($headers.ContainsKey("Content-Type")) { [string]$headers["Content-Type"] } else { "application/json" }
    $requestMessage.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, $contentType)
  }

  try {
    $apiResponse = $client.SendAsync($requestMessage).GetAwaiter().GetResult()
    $responseBody = $apiResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $stopwatch.Stop()

    $responseHeaders = @{}
    foreach ($header in $apiResponse.Headers.GetEnumerator()) {
      $responseHeaders[$header.Key] = ($header.Value -join ", ")
    }
    foreach ($header in $apiResponse.Content.Headers.GetEnumerator()) {
      $responseHeaders[$header.Key] = ($header.Value -join ", ")
    }

    Send-Json $response 200 @{
      status = [int]$apiResponse.StatusCode
      statusText = $apiResponse.ReasonPhrase
      timeMs = $stopwatch.ElapsedMilliseconds
      headers = $responseHeaders
      body = $responseBody
      contentType = [string]$apiResponse.Content.Headers.ContentType
    }
  } catch {
    $stopwatch.Stop()
    Send-Json $response 502 @{
      message = "Request failed: $($_.Exception.Message)"
      timeMs = $stopwatch.ElapsedMilliseconds
    }
  } finally {
    $requestMessage.Dispose()
    $client.Dispose()
  }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "Server running at http://127.0.0.1:$Port"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = $context.Request.Url.AbsolutePath

    try {
      if ($context.Request.HttpMethod -eq "POST" -and $requestPath -eq "/api/signup") {
        Handle-Signup $context.Response $context.Request
      } elseif ($context.Request.HttpMethod -eq "POST" -and $requestPath -eq "/api/login") {
        Handle-Login $context.Response $context.Request
      } elseif ($context.Request.HttpMethod -eq "POST" -and $requestPath -eq "/api/request") {
        Handle-ApiRequest $context.Response $context.Request
      } elseif ($context.Request.HttpMethod -eq "POST" -and $requestPath -eq "/api/load-test") {
        Handle-LoadTest $context.Response $context.Request
      } elseif ($context.Request.HttpMethod -eq "GET") {
        Send-StaticFile $context.Response $requestPath
      } else {
        Send-Json $context.Response 404 @{ message = "Endpoint not found." }
      }
    } catch {
      Send-Json $context.Response 500 @{ message = "Server error: $($_.Exception.Message)" }
    }
  }
} finally {
  $listener.Stop()
}
