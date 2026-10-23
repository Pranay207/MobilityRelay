param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$story = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'demo-story.json') -Raw | ConvertFrom-Json
$directory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($directory) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice($story.voice)
    $synth.Rate = 0
    $synth.Volume = 100
    foreach ($scene in $story.scenes) {
        $synth.SetOutputToWaveFile((Join-Path $directory ($scene.id + '.wav')))
        $synth.Speak($scene.narration)
        $synth.SetOutputToNull()
        Write-Output ('Narrated ' + $scene.id)
    }
} finally {
    $synth.Dispose()
}
