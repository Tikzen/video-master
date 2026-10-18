param(
  [string]$InputJson,
  [string]$OutputDirectory,
  [switch]$ListVoices
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($ListVoices) {
    $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
      @{ id = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name }
    })
    ConvertTo-Json -InputObject $voices -Compress
    return
  }
  if (-not $InputJson -or -not $OutputDirectory) { throw 'InputJson and OutputDirectory are required for synthesis' }
  $script = Get-Content -LiteralPath $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
  [System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
  $available = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
  $index = 0
  foreach ($line in $script.lines) {
    $voice = if ($line.voice) { $line.voice } elseif ($line.speaker -eq 'host-b') { 'Microsoft Yaoyao' } else { 'Microsoft Kangkang' }
    if ($available -notcontains $voice) {
      throw "Requested local TTS voice unavailable: $voice. Provide audio or choose an installed voice."
    }
    $synth.SelectVoice($voice)
    $synth.Rate = if ($null -ne $line.rate) { [int]$line.rate } else { 0 }
    $synth.SetOutputToWaveFile((Join-Path $OutputDirectory ("line-{0:d3}.wav" -f $index)))
    $synth.Speak([string]$line.text)
    $synth.SetOutputToNull()
    $index++
  }
} finally {
  $synth.Dispose()
}
