# Generate English crowd lines offline with built-in Windows voices -> assets/voices
param([string]$OutDir = "$PSScriptRoot\..\assets\voices")

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
function Await($op, [Type]$type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$voices = @{}
foreach ($v in $all) {
    if ($v.Language -like 'en-*') { $voices[$v.DisplayName] = $v }
}
"English voices: " + ($voices.Keys -join ', ')

function Say([string]$file, [string]$voiceLike, [string]$text, [string]$pitch = '+0%', [string]$rate = '+0%', [string]$volume = 'loud') {
    $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $v = $voices.Values | Where-Object { $_.DisplayName -like "*$voiceLike*" } | Select-Object -First 1
    if (-not $v) { $v = $voices.Values | Select-Object -First 1 }
    $synth.Voice = $v
    $lang = $v.Language
    $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$lang'><prosody pitch='$pitch' rate='$rate' volume='$volume'>$text</prosody></speak>"
    $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [System.IO.File]::WriteAllBytes((Join-Path $OutDir "$file.wav"), $bytes)
    $synth.Dispose()
}

# cheers (single roll >= 1000)
$cheer = @(
    @('cheer_01', 'James', 'Whoa!', '+10%', '+10%'),
    @('cheer_02', 'Zira', 'Yeah!', '+20%', '+0%'),
    @('cheer_03', 'Catherine', 'Bravo!', '+15%', '+0%'),
    @('cheer_04', 'James', 'What a throw!', '+5%', '+15%'),
    @('cheer_05', 'Zira', 'Incredible!', '+10%', '+10%'),
    @('cheer_06', 'James', 'Huzzah!', '-5%', '+0%'),
    @('cheer_07', 'Catherine', 'Look at that!', '+20%', '+15%'),
    @('cheer_08', 'James', 'By God, what luck!', '-10%', '+10%'),
    @('cheer_09', 'Zira', 'Magnificent!', '+5%', '+5%'),
    @('cheer_10', 'James', 'Drinks are on you, friend!', '+0%', '+15%'),
    @('cheer_11', 'Catherine', 'Lucky devil!', '+10%', '+10%'),
    @('cheer_12', 'James', 'Again! Again!', '+15%', '+20%'),
    @('cheer_13', 'Zira', 'Woo hoo!', '+25%', '+10%'),
    @('cheer_14', 'James', 'Ha ha! Unbelievable!', '-5%', '+15%')
)
# groans (bust)
$groan = @(
    @('groan_01', 'James', 'Ohhh...', '-10%', '-20%'),
    @('groan_02', 'Zira', 'Bad luck!', '+0%', '+0%'),
    @('groan_03', 'James', 'Ha! Nothing!', '+0%', '+10%'),
    @('groan_04', 'Catherine', 'Unlucky, friend.', '-5%', '+0%'),
    @('groan_05', 'James', 'The dice hate you!', '-5%', '+10%'),
    @('groan_06', 'Zira', 'Ouch!', '+10%', '+0%'),
    @('groan_07', 'James', 'Not a single point!', '-10%', '+5%'),
    @('groan_08', 'Catherine', 'What a waste.', '-5%', '-5%'),
    @('groan_09', 'James', 'Boo!', '-15%', '+0%'),
    @('groan_10', 'Zira', 'Ah, what a shame!', '+0%', '+0%'),
    @('groan_11', 'James', 'Go home, you are cursed!', '-10%', '+10%'),
    @('groan_12', 'Catherine', 'Oh no...', '+0%', '-15%')
)
# game end
$end = @(
    @('win_01', 'James', 'Well played!', '+0%', '+5%'),
    @('win_02', 'Catherine', 'A true champion!', '+10%', '+5%'),
    @('win_03', 'Zira', 'Hail the winner!', '+5%', '+5%'),
    @('lose_01', 'James', 'Better luck next time, friend.', '-5%', '+0%'),
    @('lose_02', 'Catherine', 'The house always wins!', '+5%', '+5%')
)
# background chatter
$chat = @(
    @('chat_01', 'James', 'Another round of ale over here!', '-10%', '+5%', 'medium'),
    @('chat_02', 'Catherine', 'Did you hear about the miller and his goat?', '+0%', '+5%', 'medium'),
    @('chat_03', 'James', 'The harvest was poor this year, I tell you.', '-15%', '+0%', 'medium'),
    @('chat_04', 'Zira', 'This mead tastes like horse water.', '+0%', '+5%', 'medium'),
    @('chat_05', 'James', 'I swear the innkeeper waters down the beer.', '-5%', '+5%', 'medium'),
    @('chat_06', 'Catherine', 'My husband will kill me if I lose again.', '+5%', '+10%', 'medium'),
    @('chat_07', 'James', 'Who is next at the dice table?', '-20%', '+0%', 'medium'),
    @('chat_08', 'Zira', 'The roads are full of bandits these days.', '-5%', '+0%', 'medium'),
    @('chat_09', 'James', 'Pass me the bread, will you?', '-10%', '+5%', 'medium'),
    @('chat_10', 'James', 'Ha ha ha ha!', '-15%', '+0%', 'medium'),
    @('chat_11', 'Catherine', 'Tell us another story, old man.', '+0%', '+5%', 'medium'),
    @('chat_12', 'James', 'I bet ten coins on the stranger.', '-5%', '+5%', 'medium'),
    @('chat_13', 'Zira', 'Keep your hands where I can see them.', '-5%', '+0%', 'medium'),
    @('chat_14', 'James', 'That one cheats, mark my words.', '-25%', '+0%', 'medium'),
    @('chat_15', 'Catherine', 'More wine! The night is young!', '+10%', '+10%', 'medium'),
    @('chat_16', 'James', 'Cheers, my friends!', '+0%', '+5%', 'medium')
)

foreach ($e in ($cheer + $groan + $end)) { Say $e[0] $e[1] $e[2] $e[3] $e[4] }
foreach ($e in $chat) { Say $e[0] $e[1] $e[2] $e[3] $e[4] $e[5] }
"done: " + (Get-ChildItem $OutDir -Filter *.wav).Count + " files"
