import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeRoot = path.join(uiRoot, 'app/locales');
async function readCatalog(file) {
  const source = fs.readFileSync(file, 'utf8');
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return module.default;
}

function writeCatalog(file, catalog) {
  fs.writeFileSync(file, `export default ${JSON.stringify(catalog, null, 2)};\n`);
}

const sourceCatalog = await readCatalog(path.join(localeRoot, 'en-US.js'));
const translationPath = path.join(localeRoot, 'zh-CN.js');
const translations = await readCatalog(translationPath);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function messageUsage() {
  const usage = new Map();
  const templateFiles = [path.join(uiRoot, 'app'), path.join(uiRoot, 'lib')].flatMap((directory) =>
    walk(directory).filter((target) => target.endsWith('.hbs'))
  );
  for (const file of templateFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\{\{\s*t\s+("(?:\\.|[^"\\])*")/g)) {
      const message = JSON.parse(match[1]);
      usage.set(message, (usage.get(message) || 0) + 1);
    }
  }
  return usage;
}

const usage = messageUsage();
const pending = Object.keys(sourceCatalog)
  .filter((message) => translations[message] === undefined)
  .sort(
    (first, second) => (usage.get(second) || 0) - (usage.get(first) || 0) || first.length - second.length
  );
const endpoint = 'https://api.mymemory.translated.net/get';
const batches = [];
const marker = (index) => String(96387000 + index);
const endMarker = (index) => String(96388000 + index);
if (Object.keys(sourceCatalog).some((message) => message.includes('96387') || message.includes('96388'))) {
  throw new Error('翻译标记与源文案冲突');
}

function batchText(batch) {
  return batch.map((message, line) => `${marker(line)} ${message} ${endMarker(line)} `).join('');
}

for (const message of pending) {
  if (new TextEncoder().encode(message).length > 420) continue;
  const batch = batches.at(-1);
  if (!batch || new TextEncoder().encode(batchText([...batch, message])).length > 450)
    batches.push([message]);
  else batch.push(message);
}

for (let index = 0; index < batches.length; index++) {
  const batch = batches[index];
  const text = batchText(batch);
  const query = new URLSearchParams({ q: text, langpair: 'en|zh-CN' });
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(`${endpoint}?${query}`);
    if (response.status !== 429) break;
    if (attempt === 3) throw new Error('翻译服务持续限流，已保存此前完成的批次。');
    const retryAfter = Number(response.headers.get('retry-after')) || 5;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }
  if (!response.ok) throw new Error(`翻译服务返回 HTTP ${response.status}`);
  const result = await response.json();
  const translatedText = result.responseData.translatedText;
  const translatedLines = batch.map((_, line) => {
    const start = translatedText.indexOf(marker(line));
    const end = translatedText.indexOf(endMarker(line), start + marker(line).length);
    if (start < 0 || end < 0) throw new Error(`第 ${index + 1} 批翻译标记数量不匹配`);
    return translatedText.slice(start + marker(line).length, end).trim();
  });
  batch.forEach((message, line) => {
    translations[message] = translatedLines[line] || message;
  });
  writeCatalog(translationPath, translations);
  process.stdout.write(
    `已翻译 ${Object.keys(translations).length}/${Object.keys(sourceCatalog).length} 条文案\n`
  );
  if (result.quotaFinished) throw new Error('翻译服务今日免费额度已用完，已保存当前批次。');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const skipped = pending.filter((message) => new TextEncoder().encode(message).length > 420);
if (skipped.length) process.stdout.write(`超长文案保留英文：${skipped.length} 条\n`);
