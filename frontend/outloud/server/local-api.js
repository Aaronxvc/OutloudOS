// local-api.js — Outloud OS API (latest: June 18, 2025)
const express    = require('express');
const cors       = require('cors');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const { jsonrepair } = require('jsonrepair');
const META_FILE_NAME = '.meta.json';

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MEM_FILE = path.join(__dirname, 'quade_memory.json');

app.use(cors());
app.use(express.json());
app.use('/data', express.static(DATA_DIR));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Memory loader for prompt history
function loadMem() {
  if (!fs.existsSync(MEM_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MEM_FILE, 'utf8') || '[]');
  } catch {
    return [];
  }
}
function saveMem(m) {
  fs.writeFileSync(MEM_FILE, JSON.stringify(m.slice(-10), null, 2));
}

// --- Get all projects (folders in /data), with created timestamp
app.get('/api/projects', async (req, res) => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  const ents = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });
  // For each project, load timestamp from .meta.json[''] or fallback to folder stat
  const projs = await Promise.all(ents.filter(e => e.isDirectory()).map(async e => {
    const pid = e.name;
    const projDir = path.join(DATA_DIR, pid);
    const metaPath = path.join(projDir, META_FILE_NAME);
    let created = null;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8') || '{}');
        created = meta['']?.created || null;
      } catch { /* ignore */ }
    }
    if (!created) {
      try {
        const stat = fs.statSync(projDir);
        created = stat.birthtime?.toISOString?.() || stat.ctime?.toISOString?.() || null;
      } catch { /* ignore */ }
    }
    return { id: pid, created };
  }));
  res.json({ projects: projs });
});


// --- LLM prompt API (unchanged)
app.post('/api/prompt', async (req, res) => {
  const { conversation } = req.body;
  if (!Array.isArray(conversation) || !conversation.length) {
    return res.status(400).json({ error: 'conversation required' });
  }
  const system = `You are a versatile AI assistant that can answer general questions and generate high-quality, runnable code in response to any prompt. You format code in markdown and explain when asked.`;
  const lines = conversation.map(m =>
    m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`
  );
  const full = [system, '', ...lines, 'Assistant:'].join('\n');
  try {
    const { data } = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3:latest',
      prompt: full,
      stream: false,
      parameters: { temperature: 0.1, top_p: 0.9, top_k: 40 }
    });
    let rsp = data.response.trim().replace(/([.,!?;:])(?=\S)/g, '$1 ');
    const mem = loadMem();
    const lastU = [...conversation].reverse().find(m => m.role === 'user');
    if (lastU) {
      mem.push({ prompt: lastU.content, response: rsp, timestamp: new Date().toISOString() });
      saveMem(mem);
    }
    res.json({ response: rsp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- List all files and folders in a project, ensure all have created meta
app.get('/api/files', async (req, res) => {
  const pid = req.query.projectId;
  const base = path.join(DATA_DIR, String(pid));
  const metaPath = path.join(base, META_FILE_NAME);
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8') || '{}'); }
    catch { meta = {}; }
  }
  const files = [];

  // Always include the project root as a folder (with timestamp)
  let rootTs = null;
  if (meta['']) rootTs = meta[''].created;
  else if (fs.existsSync(base)) {
    rootTs = fs.statSync(base).birthtime?.toISOString?.() || null;
  }
  files.push({ path: '', isFolder: true, created: rootTs });

  async function walk(dir) {
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      if (e.name === META_FILE_NAME) continue;
      const full = path.join(dir, e.name);
      const rel  = path.relative(base, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (!meta[rel]) {
          meta[rel] = { created: new Date().toISOString() };
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        }
        files.push({ path: rel, isFolder: true, created: (meta[rel]?.created || null) });
        await walk(full);
      } else {
        files.push({ path: rel, isFolder: false, created: (meta[rel]?.created || null) });
      }
    }
  }
  if (fs.existsSync(base)) await walk(base);
  res.json({ files });
});

// --- Create or save file/folder, always tracks created meta
app.post('/api/file/save', async (req, res) => {
  const { projectId, path: filePath, content, isFolder } = req.body;
  try {
    const fullDir = path.join(DATA_DIR, String(projectId));
    const full    = path.join(fullDir, filePath);

    // FOLDER creation (explicit or ends with "/")
    if (isFolder || /\/$/.test(filePath)) {
      await fs.promises.mkdir(full, { recursive: true });
      // Always add meta for folder
      const metaPath = path.join(fullDir, META_FILE_NAME);
      let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
      if (!meta[filePath.replace(/\/+$/, '')]) {
        meta[filePath.replace(/\/+$/, '')] = { created: new Date().toISOString() };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      }
      return res.json({ success: true, folder: true });
    }

    // Write file content
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, content, 'utf8');

    // Always add meta for file
    const metaPath = path.join(fullDir, META_FILE_NAME);
    let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    if (!meta[filePath]) {
      meta[filePath] = { created: new Date().toISOString() };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Create folder (alternate endpoint: optional)
app.post('/api/folder/create', async (req, res) => {
  const { projectId, path: folderPath } = req.body;
  const fullDir = path.join(DATA_DIR, String(projectId));
  const full = path.join(fullDir, folderPath);
  try {
    await fs.promises.mkdir(full, { recursive: true });
    const metaPath = path.join(fullDir, META_FILE_NAME);
    let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    if (!meta[folderPath]) {
      meta[folderPath] = { created: new Date().toISOString() };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Delete file or folder
app.post('/api/file/delete', async (req, res) => {
  const { projectId, path: filePath } = req.body;
  const base = path.join(DATA_DIR, String(projectId));
  const target = path.join(base, filePath);

  try {
    if (fs.existsSync(target)) {
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) {
        await fs.promises.rm(target, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(target);
      }
    }

    // Remove from meta
    const metaPath = path.join(base, META_FILE_NAME);
    if (fs.existsSync(metaPath)) {
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8') || '{}');
      } catch {
        meta = {};
      }
      if (meta[filePath] !== undefined) {
        delete meta[filePath];
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE ERROR]', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// --- Rename file or folder, handles meta (robust)
app.post('/api/file/rename', async (req, res) => {
  const { projectId, oldPath, newPath } = req.body;
  if (!projectId || !oldPath || !newPath) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }
  const base = path.join(DATA_DIR, String(projectId));
  const from = path.join(base, oldPath);
  const to   = path.join(base, newPath);

  try {
    await fs.promises.rename(from, to);

    // Update .meta.json for folder/file
    const metaPath = path.join(base, META_FILE_NAME);
    let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

    if (fs.existsSync(to) && fs.lstatSync(to).isDirectory()) {
      const oldPrefix = oldPath.replace(/\/+$/, '') + '/';
      const newPrefix = newPath.replace(/\/+$/, '') + '/';
      Object.keys(meta).forEach(key => {
        if (key === oldPath) {
          meta[newPath] = meta[oldPath];
          delete meta[oldPath];
        } else if (key.startsWith(oldPrefix)) {
          const rel = key.slice(oldPrefix.length);
          meta[newPrefix + rel] = meta[key];
          delete meta[key];
        }
      });
      if (!meta[newPath]) {
        meta[newPath] = { created: new Date().toISOString() };
      }
    } else {
      if (meta[oldPath]) {
        meta[newPath] = meta[oldPath];
        delete meta[oldPath];
      }
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Project (root) rename
app.post('/api/project/rename', async (req, res) => {
  const { oldId, newId } = req.body;
  const from = path.join(DATA_DIR, String(oldId));
  const to   = path.join(DATA_DIR, String(newId));
  try {
    await fs.promises.rename(from, to);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- IDE endpoint (unchanged)
app.post('/api/ide', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const system = `You are a code generation assistant. Output ONLY valid JSON in this shape:
{"files":[{"path":"index.html","content":"<!DOCTYPE html>…</html>"}]}`;
  const full = [system, '', `User: ${prompt}`, 'Assistant:'].join('\n');
  try {
    const { data } = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3:latest',
      prompt: full,
      stream: false,
      parameters: { temperature: 0.2, top_p: 0.9, top_k: 40 }
    });
    let raw = data.response.trim().replace(/```json/i, '').replace(/```/g, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = JSON.parse(jsonrepair(raw)); }
    const files = parsed.files || [];
    const pid   = 'proj_' + Date.now();
    const dir   = path.join(DATA_DIR, pid);
    await fs.promises.mkdir(dir, { recursive: true });
    for (const f of files) {
      const p = path.join(dir, f.path);
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, f.content, 'utf8');
    }
    res.json({ projectId: pid, files: files.map(f => ({ path: f.path, content: f.content })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🟢 Outloud API on http://localhost:${PORT}`));

