import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface WinHttpResult {
  status: number;
  body: string;
}

/** Node fetch is blocked by Cloudflare on some Windows networks; .NET IWR works. */
async function winHttpPost(url: string, headers: Record<string, string>, body: string): Promise<WinHttpResult> {
  const bodyPath = join(tmpdir(), `sentinel-llm-req-${randomUUID()}.json`);
  const respPath = join(tmpdir(), `sentinel-llm-resp-${randomUUID()}.json`);
  const statusPath = join(tmpdir(), `sentinel-llm-status-${randomUUID()}.txt`);
  const auth = headers.Authorization ?? headers.authorization ?? "";
  const script = `
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$headers = @{ Authorization = ${JSON.stringify(auth)}; 'Content-Type' = 'application/json' }
try {
  $resp = Invoke-WebRequest -Uri ${JSON.stringify(url)} -Method POST -Headers $headers -InFile ${JSON.stringify(bodyPath)} -UseBasicParsing
  $resp.RawContentStream.Position = 0
  $reader = New-Object System.IO.StreamReader($resp.RawContentStream, $utf8)
  $text = $reader.ReadToEnd()
  [System.IO.File]::WriteAllText(${JSON.stringify(statusPath)}, [string]$resp.StatusCode, $utf8)
  [System.IO.File]::WriteAllText(${JSON.stringify(respPath)}, $text, $utf8)
} catch {
  $r = $_.Exception.Response
  if ($r) {
    $reader = New-Object System.IO.StreamReader($r.GetResponseStream())
    [System.IO.File]::WriteAllText(${JSON.stringify(statusPath)}, [string][int]$r.StatusCode, $utf8)
    [System.IO.File]::WriteAllText(${JSON.stringify(respPath)}, $reader.ReadToEnd(), $utf8)
  } else {
    [System.IO.File]::WriteAllText(${JSON.stringify(statusPath)}, '0', $utf8)
    [System.IO.File]::WriteAllText(${JSON.stringify(respPath)}, $_.Exception.Message, $utf8)
  }
}
`;

  try {
    writeFileSync(bodyPath, body, "utf-8");
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const status = Number.parseInt(readFileSync(statusPath, "utf-8").trim(), 10);
    const respBody = readFileSync(respPath, "utf-8").replace(/^\uFEFF/, "");
    return { status: Number.isFinite(status) ? status : 0, body: respBody };
  } finally {
    for (const p of [bodyPath, respPath, statusPath]) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
}

/**
 * POST helper for OpenAI-compatible LLM APIs.
 * Uses native fetch on Linux/macOS; Windows falls back to .NET Invoke-WebRequest when fetch returns 403.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal
): Promise<{ status: number; text: string }> {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  if (process.platform === "win32") {
    const result = await winHttpPost(url, headers, body);
    if (result.status === 0) {
      throw new Error(result.body || "Windows HTTP request failed");
    }
    return { status: result.status, text: result.body };
  }

  const response = await fetch(url, { method: "POST", headers, body, signal });
  return { status: response.status, text: await response.text() };
}

export { headersToRecord };
