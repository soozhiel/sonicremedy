// Shared loader for the Node test scripts: builds the engine exactly as the site does
// (songs + TAB 05 expressions + TAB 06 affinities / pairs + meaning layer).
const fs = require('fs');
const path = require('path');
module.exports = function load(dir) {
  dir = dir || path.join(__dirname, '..');
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'data', f), 'utf8')); } catch (e) { return null; } };
  const api = require(path.join(dir, 'discovery.js'));
  const data = read('songs.json');
  const meaning = read('meaning.json');
  let M = null; try { M = require(path.join(dir, 'meaning.js')); } catch (e) { /* older engine */ }
  const eng = api.createEngine(data, read('expressions.json'), { affinities: read('affinities.json'), pairs: meaning && meaning.pairs, meaning: M });
  return { api, data, eng, expr: read('expressions.json') };
};
