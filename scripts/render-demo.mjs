import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const directory = resolve(process.argv[2] || '.data/demo-video-2026-10-23');
const ffmpeg = resolve(process.env.FFMPEG_PATH || '.data/demo-tools/node_modules/ffmpeg-static/ffmpeg.exe');
const story = JSON.parse(await readFile('scripts/demo-story.json', 'utf8'));
const capture = JSON.parse(await readFile(join(directory, 'capture.json'), 'utf8'));
assert.equal(capture.completed, true, 'Capture must finish its real-workflow assertions before editing');
const encoded = join(directory, 'encoded'); await mkdir(encoded, { recursive: true });
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${binary}: ${result.error?.message || result.stderr?.slice(-5000) || result.stdout}`);
  return result;
};
run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/narrate-demo.ps1'), '-OutputDirectory', directory]);
const waveSeconds = bytes => {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  let rate; let length;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4); const size = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ') rate = bytes.readUInt32LE(at + 16);
    if (id === 'data') length = size;
    at += 8 + size + (size % 2);
  }
  assert.ok(rate && length); return length / rate;
};
const logo = `data:image/svg+xml;base64,${(await readFile('assets/logo.svg')).toString('base64')}`;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const base = '<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#0e1915;color:#fff;letter-spacing:0}img{display:block}h1,p{margin:0}</style>';
  await page.setContent(`${base}<main style="padding:100px 120px"><div style="display:flex;gap:28px;align-items:center"><img src="${logo}" width="88" height="88" alt="MobilityRelay"><strong style="font-size:46px">MobilityRelay</strong></div><p style="margin-top:112px;color:#a9dfcb;font-size:26px">WHEELCHAIR REPAIR COORDINATION</p><h1 style="margin-top:26px;font-size:82px;line-height:1.16">When repair updates conflict,<br>know what to ask next.</h1><p style="margin-top:48px;font-size:32px;color:#d6e4dd">Alexa+ experience simulator. Real MCP. User-reviewed actions.</p><p style="margin-top:140px;font-size:22px;color:#b4c9be">FICTIONAL WALKTHROUGH / TYPED CONVERSATION / COMPUTER-GENERATED NARRATION</p></main>`);
  await page.screenshot({ path: join(directory, 'intro.png') });
  await page.setContent(`${base}<main style="padding:86px 120px"><div style="display:flex;gap:24px;align-items:center"><img src="${logo}" width="72" height="72" alt="MobilityRelay"><strong style="font-size:40px">MobilityRelay</strong></div><p style="margin-top:86px;font-size:26px;color:#a9dfcb">THE DISTINCTION THAT MATTERS</p><h1 style="margin-top:28px;font-size:86px">Received is not approved.</h1><p style="margin-top:38px;font-size:36px;line-height:1.5">Six real MCP tools.<br>Source-backed records. Exact-message approval.<br>A history the user can review and hand over.</p><p style="margin-top:62px;font-size:25px;color:#c4d9cd">React / Express / MCP 2025-11-25 / Streamable HTTP / SQLite / Ollama</p><p style="margin-top:58px;font-size:21px;line-height:1.6;color:#b4c9be">Real application footage with edited pauses. Computer-generated English narration.<br>Fictional records; local capture, not email delivery. No physical microphone test.<br>No claim of guaranteed approval, faster repairs or independent user-benefit validation.</p></main>`);
  await page.screenshot({ path: join(directory, 'close.png') });
  await page.setViewportSize({ width: 1920, height: 60 });
  for (const scene of story.scenes.filter(s => !['intro', 'close'].includes(s.id))) {
    await page.setContent(`${base}<header style="height:60px;padding:0 28px;display:flex;align-items:center;gap:30px"><strong style="font-size:25px;color:#a9dfcb;white-space:nowrap">MobilityRelay</strong><span style="font-size:26px;flex:1">${escape(scene.chapter)}</span><span style="font-size:17px;color:#c4d9cd;white-space:nowrap">FICTIONAL CASE / REAL MCP</span></header>`);
    await page.screenshot({ path: join(directory, `${scene.id}-header.png`) });
  }
} finally { await browser.close(); }

let offset = 0; const timeline = []; const cues = [];
const assTime = seconds => {
  const cs = Math.round(seconds * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const srtTime = seconds => {
  const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
for (const scene of story.scenes) {
  const audio = join(directory, `${scene.id}.wav`);
  const audioSeconds = waveSeconds(await readFile(audio));
  const source = capture.scenes.find(s => s.id === scene.id);
  const duration = Math.max(scene.seconds, audioSeconds + 0.9, source ? source.duration : 0);
  const target = join(encoded, `${scene.id}.mp4`);
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (source) args.push('-ss', String(Math.max(0, source.start)), '-i', source.path);
  else args.push('-loop', '1', '-i', join(directory, `${scene.id}.png`));
  args.push('-i', audio);
  if (source) args.push('-i', join(directory, `${scene.id}-header.png`));
  const video = source
    ? '[0:v]fps=30,scale=1920:960:flags=lanczos,pad=1920:1080:0:60:color=0x0e1915,tpad=stop_mode=clone:stop_duration=180[footage];[footage][2:v]overlay=0:0,format=yuv420p[v]'
    : '[0:v]fps=30,format=yuv420p[v]';
  args.push('-filter_complex', `${video};[1:a]adelay=400:all=1,apad,loudnorm=I=-16:TP=-1.5:LRA=11[a]`, '-map', '[v]', '-map', '[a]', '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', target);
  console.log(`Encoding ${scene.id}: ${duration.toFixed(2)} seconds (${audioSeconds.toFixed(2)} narrated)`);
  run(ffmpeg, args);
  const words = scene.narration.split(/\s+/); let count = 0;
  while (count < words.length) {
    const chunk = words.slice(count, count + 11);
    const start = offset + 0.4 + audioSeconds * count / words.length;
    count += chunk.length;
    const end = offset + 0.4 + audioSeconds * count / words.length;
    cues.push({ start, end, text: chunk.join(' ') });
  }
  timeline.push({ id: scene.id, chapter: scene.chapter, start: offset, duration, narratedSeconds: audioSeconds, source: source?.path || 'Original title graphic', footageStart: source?.start || 0 });
  offset += duration;
}
assert.ok(offset < 179, `Demo is ${offset.toFixed(2)} seconds; shorten narration before submission`);
const assHeader = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,25,&H00FFFFFF,&H00FFFFFF,&H000E1915,&H000E1915,0,0,0,0,100,100,0,0,1,2,0,2,30,30,16,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
await writeFile(join(directory, 'captions.ass'), assHeader + cues.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text.replace(/[{}]/g, '')}`).join('\n') + '\n');
await writeFile(join(directory, 'captions.srt'), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
await writeFile(join(directory, 'narration.txt'), story.scenes.map(s => `${s.chapter}\n${s.narration}\n`).join('\n'));
await writeFile(join(directory, 'concat.txt'), timeline.map(s => `file '${join(encoded, `${s.id}.mp4`).replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n'));
const master = join(directory, 'MobilityRelay-demo-narrated.mp4');
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(directory, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', master]);
const final = join(directory, 'MobilityRelay-demo-1080p.mp4');
const filterPath = relative(process.cwd(), join(directory, 'captions.ass')).replaceAll('\\', '/');
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-vf', `ass=${filterPath}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-c:a', 'copy', '-movflags', '+faststart', final]);
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', final, '-f', 'null', '-']);
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', final, '-vf', 'fps=1/20,scale=640:360,tile=3x3', '-frames:v', '1', join(directory, 'contact-sheet.png')]);
const inspector = await chromium.launch({ channel: 'msedge' });
let media;
try {
  const page = await inspector.newPage(); await page.goto(pathToFileURL(final).href);
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && Number.isFinite(video.duration) && video.videoWidth > 0; });
  media = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
  assert.equal(media.width, 1920); assert.equal(media.height, 1080); assert.ok(media.duration < 180);
} finally { await inspector.close(); }
const output = { file: final, bytes: (await stat(final)).size, ...media, voice: story.voice, narration: 'Computer-generated English narration', captionTiming: 'Narration-derived phrase timings; human review recommended', timeline, fictional: true, actualMcpTools: [...new Set(capture.traces.filter(t => t.ok).map(t => t.tool))], modelCalls: capture.inferenceCalls, input: capture.evidence.input, email: capture.evidence.email, editing: 'Real browser footage; startup pauses trimmed; final frames held when needed; no action footage sped up', decodeCheck: 'Passed complete FFmpeg decode', uploaded: false };
await writeFile(join(directory, 'video-report.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
