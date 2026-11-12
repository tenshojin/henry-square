# 观众语音压成 MP3（assets/voices/名字.mp3），打包时优先用它：WAV 打进页面要 2.8 MB，MP3 不到十分之一，手机下载快不少。
# 换了语音后先跑 build.mjs（src/generated/voices.js 里是修剪过头尾静音的 WAV），再跑这个脚本，再打包一次。
# 用法：python tools/compress_voices.py
import base64, json, os, re, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = r'D:\tools\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
src = open(os.path.join(ROOT, 'src', 'generated', 'voices.js'), encoding='utf8').read()
voices = json.loads(re.search(r'export default (\{.*\})', src, re.S).group(1))
out_dir = os.path.join(ROOT, 'assets', 'voices')
total = 0
for name, b64 in voices.items():
    raw = base64.b64decode(b64)
    if raw[:4] != b'RIFF':
        continue  # 已经是 MP3 了
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        f.write(raw)
    out = os.path.join(out_dir, name + '.mp3')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', f.name, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', out], check=True)
    os.remove(f.name)
    total += os.path.getsize(out)
print(len(voices), 'clips', round(total / 1e3), 'KB')
