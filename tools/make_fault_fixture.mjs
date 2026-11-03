// Run after build, serve locally, then open /.qa/decoder-failure.html.
// The invalid opening clip must fall back to the live table, leaving the game usable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, '亨利酒馆.html'), 'utf8');
const pattern = /(<script type="text\/plain" id="asset-cs-intro_a">)[^<]*(<\/script>)/;
if (!pattern.test(html)) throw new Error('Opening clip not found');
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
fs.writeFileSync(path.join(root, '.qa', 'decoder-failure.html'), html.replace(pattern, '$1bm90LWEtdmlkZW8=$2'));
console.log('Created .qa/decoder-failure.html');
