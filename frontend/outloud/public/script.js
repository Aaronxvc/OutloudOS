// ============================= Outloud OS: FULL SCRIPT =============================
// --- Globals & Utilities ---
const prevGeo       = {};
let matrixInterval, matrixCanvas, matrixCtx, matrixDrops;
let booted          = false;
let iconPlane       = null;
const ICONS = [
  { id: "promptAppIcon",      label: "Terminal", emoji: "🧠", tpl: "promptWindow" },
  { id: "fileExplorerAppIcon",label: "Explorer", emoji: "📂", tpl: "fileTreeWindow" },
  { id: "textPadIcon",        label: "TextPad",  emoji: "📄", tpl: "textPadWindow" },
  { id: "settingsAppIcon",    label: "Settings", emoji: "⚙️", tpl: "settingsWindow" }
];

const MIRROR_ID      = "mirrorWindow";
const MIRROR_SIZE    = { w: 400, h: 400, pad: 36 };



// ---- SignalR hookup (dev) ----
// ---- SignalR hookup (robust) ----
const hubUrl = "http://localhost:5064/hubs/stream";   // keep 5064 unless you changed it
const conn = new signalR.HubConnectionBuilder()
  .withUrl(hubUrl)            // credentials allowed by your CORS policy
  .withAutomaticReconnect()
  .build();

// Status widgets (ok if missing)
const rxDot  = document.getElementById('rxDot');
const rxText = document.getElementById('rxText');
function setRx(ok, text) {
  if (rxDot)  rxDot.style.background = ok ? '#2ecc71' : '#c33';
  if (rxText) rxText.textContent = `Receiver: ${text}`;
}

// Print helper (to your chat thread or the dev box)
function appendToConsole(text, role = 'assistant') {
  const thread = document.querySelector('.chat-thread');
  if (thread) {
    const row = document.createElement('div');
    row.className = `chat-message ${role}`;
    row.textContent = text;
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return;
  }
  const log = document.getElementById('rxLog') || document.getElementById('stream-log');
  if (log) {
    const d = document.createElement('div');
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  } else {
    console.log(text);
  }
}

// Stream events
conn.on('tok',     chunk  => appendToConsole(chunk, 'assistant'));
conn.on('tok_end', reason => appendToConsole(`<< ${reason || 'done'} >>`, 'system'));

// Connection lifecycle
conn.onreconnecting(() => { console.warn('SignalR: reconnecting'); setRx(false, 'reconnecting…'); });
conn.onreconnected(()  => { console.info('SignalR: reconnected');  setRx(true,  'online'); });
conn.onclose(()        => { console.warn('SignalR: closed');       setRx(false, 'offline'); });

(async () => {
  try {
    await conn.start();
    console.log('SignalR connected:', hubUrl);
    setRx(true, 'online');                 // <-- this flips your badge green
  } catch (e) {
    console.error('SignalR failed:', e);
    setRx(false, 'failed');
  }
})();

// ─── ICON DOCK & MIRROR SETUP ────────────────────────────────────────────────

// Completely rebuilds the left‐side dock from your ICONS array:
function setupAllAppIconsInPlane() {
  let dock = document.getElementById("iconPlane");
  if (!dock) {
    dock = document.createElement("div");
    dock.id         = "iconPlane";
    dock.className  = "icon-plane vertical";
    document.body.appendChild(dock);
  }
  dock.innerHTML = "";
  ICONS.forEach(info => {
    const btn = document.createElement("div");
    btn.id        = info.id;
    btn.className = "app-icon";
    btn.innerHTML = `<span style="font-size:38px">${info.emoji}</span>`;
    btn.title     = info.label;
    dock.appendChild(btn);
    setupIconBehaviorPlane(btn, info.tpl);
  });
  iconPlane = dock;
  makePlaneDraggable(dock);
}


// Pins your mirror window into the top‐right corner only:
function setupMirrorWindow() {
  const mirror = document.getElementById(MIRROR_ID);
  if (!mirror) return;
  mirror.style.display  = "block";
  mirror.style.position = "fixed";
  mirror.style.top      = `${MIRROR_SIZE.pad}px`;
  mirror.style.right    = `${MIRROR_SIZE.pad}px`;
  mirror.style.left     = "";
  mirror.style.cursor   = "default";

  let dragging = false, offsetY = 0;
  const bar = mirror.querySelector(".title-bar");
  bar.onmousedown = e => {
    dragging = true;
    offsetY  = e.clientY - mirror.getBoundingClientRect().top;
  };
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const bottomPad = 48;  // leave room for your taskbar + minimized bar
    let top = e.clientY - offsetY;
    top = Math.max(MIRROR_SIZE.pad,
          Math.min(window.innerHeight - mirror.offsetHeight - bottomPad, top));
    mirror.style.top = `${top}px`;
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    mirror.style.right = `${MIRROR_SIZE.pad}px`;
    mirror.style.left  = "";
  });
}
// …after you’ve defined setupAllAppIconsInPlane() and setupMirrorWindow()…

function launchDesktop() {
   booted = true;
  // 1) build the dock & wire each icon
  setupAllAppIconsInPlane();

  // 2) pin & show the mirror
  setupMirrorWindow();

  // 3) show your main terminal, *beside* the dock
  const term = document.getElementById("promptWindow");
  term.style.display = "block";
  bringToFront(term);
  // place it automatically just to the right of the dock
  showWindowBelowPlane("promptWindow");

  // 4) re-show the minimized-windows bar
  const mb = document.getElementById("minimizedBar");
  if (mb) mb.style.display = "flex";   // or "block" depending on your CSS
}



// --- Utility: Detect if user prompt is for code generation ---
function shouldGenerateCode(userPrompt) {
  const text = userPrompt.toLowerCase();

  // 1) Common file‐extensions people mention:
  const codeExtensions = [
    '.js', '.ts', '.jsx', '.tsx',
    '.html', '.css', '.py', '.java',
    '.rb', '.go', '.php', '.json',
    '.xml', '.sh', '.md'
  ];

  // 2) Trigger words + file‐type targets (with word boundaries):
  const codeTrigger = /\b(write|generate|build|create|make|show)\b.*\b(code|script|file|website|page|app|component|function)\b/;

  // 3) If they mention an extension explicitly:
  const extTrigger = codeExtensions.some(ext => text.includes(ext));

  return codeTrigger.test(text) || extTrigger;
}



// ================= Bootloader =================
window.addEventListener("DOMContentLoaded", () => {
  // hide all windows, mirror, and minimized bar while booting
  document.querySelectorAll(".window").forEach(w => w.style.display = "none");
  document.getElementById(MIRROR_ID).style.display = "none";
  document.getElementById("minimizedBar").style.display = "none";

  // create and style the boot overlay
  const overlay = document.createElement("div");
  overlay.id = "bootOverlay";
  Object.assign(overlay.style, {
    position:      "fixed",
    top:           0,
    left:          0,
    width:         "100vw",
    height:        "100vh",
    background:    "#000",
    color:         "#3db5ff",
    display:       "flex",
    flexWrap:      "wrap",
    alignItems:    "center",
    justifyContent:"center",
    fontFamily:    "monospace",
    fontSize:      "18px",
    padding:       "2em",
    zIndex:        9999
  });
  document.body.appendChild(overlay);

  // turn each boot‐line into individual words
  const lines = [
    "Booting Outloud OS...",
    "Initializing Chat Thread...",
    "Loading CodeCrafter Agent...",
    "Welcome back!"
  ];
  const words = lines.join(" ").split(" ");
  let widx = 0;

  // reveal one word at a time, then fade out and launch desktop
  const wordInterval = setInterval(() => {
    if (widx < words.length) {
      const span = document.createElement("span");
      span.innerText = words[widx++] + " ";
      overlay.appendChild(span);
    } else {
      clearInterval(wordInterval);
      setTimeout(() => {
        overlay.style.transition = "opacity 1s";
        overlay.style.opacity    = "0";
        setTimeout(() => {
          overlay.remove();
          launchDesktop();
        }, 1000);
      }, 800);
    }
  }, 300);
});





function makePlaneDraggable(plane) {
  let dragging = false, startY, origTop;
  plane.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    dragging = true;
    startY = e.clientY;
    origTop = plane.offsetTop;
    plane.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    // only vertical
    let newTop = origTop + (e.clientY - startY);
    const minTop = 36; 
    const maxTop = window.innerHeight - plane.offsetHeight - 36;
    newTop = Math.max(minTop, Math.min(maxTop, newTop));
    plane.style.top = newTop + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    plane.style.cursor = "grab";
    document.body.style.userSelect = "";

    // snap horizontally to left-edge only
    plane.style.left = "0px";
  });
}

// --- Mirror window logic: always at top right, never overlaps plane.
function placeMirrorWindow() {
  const mw = document.getElementById(MIRROR_ID);
  if (!mw) return;
  let px = iconPlane ? iconPlane.offsetLeft : 0;
  let py = iconPlane ? iconPlane.offsetTop : 0;
  let pw = iconPlane ? iconPlane.offsetWidth : 0;
  let ph = iconPlane ? iconPlane.offsetHeight : 0;
  let mLeft = window.innerWidth - MIRROR_SIZE.w - MIRROR_SIZE.pad;
  let mTop = MIRROR_SIZE.pad;
  if (
    px > window.innerWidth - pw - 160 && py < 90
  ) {
    mTop = ph + 44;
  }
  else if (
    px > window.innerWidth - pw - 160 &&
    Math.abs(py - MIRROR_SIZE.pad) < MIRROR_SIZE.h
  ) {
    mLeft = window.innerWidth - MIRROR_SIZE.w - pw - 28;
  }
  mw.style.position = "fixed";
  mw.style.left = mLeft + "px";
  mw.style.top = mTop + "px";
  mw.style.zIndex = "888";
}

// --- Icon click/dblclick (Plane version) ---
function setupIconBehaviorPlane(iconEl, tplId) {
  const tpl = document.getElementById(tplId);
  if (!iconEl || !tpl) return;
  iconEl.onclick = () => { showWindowBelowPlane(tplId); };
  iconEl.ondblclick = () => {
    const w = tpl.cloneNode(true);
    w.removeAttribute("id");
    document.body.appendChild(w);
    w.style.display = "block";
    w.classList.remove("fullscreen");
    bringToFront(w);
    initializeWindow(w, tplId);
    w.style.top = (iconPlane.offsetTop + iconPlane.offsetHeight + 16) + "px";
    w.style.left = "80px";
    w.style.width = "70vw";
    w.style.height = "75vh";
  };
}

// --- Show window below the icon plane, always NOT covering the plane or mirror
function showWindowBelowPlane(tplId) {
  const win = document.getElementById(tplId);
  if (!win) return;
  win.classList.remove("fullscreen");

  const topEdge    = iconPlane.offsetTop + iconPlane.offsetHeight + 16;
  const newTop     = Math.min(topEdge, window.innerHeight - 100);
  const clampedTop = Math.max(36, newTop);
  const newLeft    = iconPlane.offsetLeft + iconPlane.offsetWidth + 16;

  win.style.left   = `${newLeft}px`;
  win.style.top    = `${clampedTop}px`;
  win.style.width  = "min(600px, 70vw)";
  win.style.height = "min(500px, 85vh)";
  win.style.display= "block";
  bringToFront(win);
}


// --- Mirror always-on logic: Only comes forward, never moves
const mwCloseBtn = document.getElementById(MIRROR_ID)?.querySelector(".close-btn");
if (mwCloseBtn) mwCloseBtn.onclick = function () {
  bringToFront(document.getElementById(MIRROR_ID));
};

// --- Bring a window to front ---
function bringToFront(win) {
  document.querySelectorAll(".window").forEach(w => w.style.zIndex = 100);
  win.style.zIndex = 8888;
  if (win.id === MIRROR_ID) win.style.zIndex = 9999;
}

// ================== Virtual File System (localStorage wrapper) =================
class VirtualFS {
  constructor() {
    const stored = localStorage.getItem("virtual_fs");
    this._data = stored ? JSON.parse(stored) : { files: {} };
  }
  _save() { localStorage.setItem("virtual_fs", JSON.stringify(this._data)); }
  listFiles(proj) {
    const prefix = `${proj}/`;
    return Object.keys(this._data.files)
      .filter(p => p.startsWith(prefix))
      .map(p => p.slice(prefix.length));
  }
  readFile(proj, path) { return this._data.files[`${proj}/${path}`] || ""; }
  writeFile(proj, path, content) {
    this._data.files[`${proj}/${path}`] = content;
    this._save();
  }
  deleteFile(proj, path) {
    delete this._data.files[`${proj}/${path}`];
    this._save();
  }
  renameFile(proj, oldPath, newPath) {
    const oldKey = `${proj}/${oldPath}`;
    const newKey = `${proj}/${newPath}`;
    if (this._data.files[oldKey] != null) {
      this._data.files[newKey] = this._data.files[oldKey];
      delete this._data.files[oldKey];
      this._save();
    }
  }
  renameFolder(proj, oldFolder, newFolder) {
    const oldPrefix = `${proj}/${oldFolder}`;
    const newPrefix = `${proj}/${newFolder}`;
    for (const key of Object.keys(this._data.files)) {
      if (key.startsWith(oldPrefix + "/")) {
        const rel = key.slice(oldPrefix.length);
        this._data.files[newPrefix + rel] = this._data.files[key];
        delete this._data.files[key];
      }
    }
    this._save();
  }
}
const vfs = new VirtualFS();

// ================== Settings & Matrix Rain ===================
function startMatrix() {
  matrixCanvas = document.getElementById("matrixCanvas") || document.createElement("canvas");
  matrixCanvas.id = "matrixCanvas";
  matrixCtx = matrixCanvas.getContext("2d");
  matrixCanvas.style.pointerEvents = "none";
  matrixCanvas.style.zIndex = "0";
  if (!document.body.contains(matrixCanvas)) {
    document.body.appendChild(matrixCanvas);
    window.addEventListener("resize", resizeMatrix);
  }
  function resizeMatrix() {
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
  }
  resizeMatrix();
  const cols = Math.floor(matrixCanvas.width / 20);
  matrixDrops = Array(cols).fill(1);
  if (matrixInterval) clearInterval(matrixInterval);
  matrixInterval = setInterval(() => {
    matrixCtx.fillStyle = "rgba(0,0,0,0.05)";
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    matrixCtx.fillStyle = "#0ff";
    matrixCtx.font = "14px monospace";
    matrixDrops.forEach((y, x) => {
      const ch = String.fromCharCode(0x30A0 + Math.random() * 96);
      matrixCtx.fillText(ch, x * 20, y * 20);
      matrixDrops[x] = (y * 20 > matrixCanvas.height && Math.random() > 0.975) ? 0 : y + 1;
    });
  }, 33);
}
function stopMatrix() {
  clearInterval(matrixInterval);
  matrixInterval = null;
  const c = document.getElementById("matrixCanvas");
  if (c) c.remove();
}
function applyBackground() {
  const type = localStorage.getItem("bgType") || "matrix";
  const color = localStorage.getItem("bgColor") || "#0a0a0a";
  const dataUrl = localStorage.getItem("customWallpaper") || "";
  stopMatrix();
  document.body.style.background = "";
  if (type === "matrix") startMatrix();
  else if (type === "color") document.body.style.background = color;
  else if (type === "image" && dataUrl) {
    document.body.style.backgroundImage = `url(${dataUrl})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
  }
}

// ================== Window System + Initialization ================
function enableDrag(el, handle) {
  handle.addEventListener("mousedown", e => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = el.offsetLeft, oy = el.offsetTop;
    function mm(ev) {
      el.style.left = ox + (ev.clientX - sx) + "px";
      el.style.top = oy + (ev.clientY - sy) + "px";
    }
    function mu() {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  });
}
function makeResizable(win) {
  const h = win.querySelector(".resize-handle");
  if (!h) return;
  h.addEventListener("mousedown", e => {
    e.preventDefault();
    const rx = e.clientX, ry = e.clientY;
    const rw = parseFloat(getComputedStyle(win).width);
    const rh = parseFloat(getComputedStyle(win).height);
    function mv(ev) {
      win.style.width = rw + (ev.clientX - rx) + "px";
      win.style.height = rh + (ev.clientY - ry) + "px";
    }
    function mu() {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", mu);
    }
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", mu);
  });
}

function initializeWindow(winEl, tplId) {
  // Only add controls if NOT the Mirror
  const isMirror = tplId === "mirrorWindow";
  if (!isMirror) {
    // Add draggable
    enableDrag(winEl, winEl.querySelector(".title-bar"));
    makeResizable(winEl);
    winEl.addEventListener("mousedown", () => bringToFront(winEl), { capture: true });

    // Find or create button row in title-bar
    let ctrlRow = winEl.querySelector('.window-controls');
    if (!ctrlRow) {
      ctrlRow = document.createElement('div');
      ctrlRow.className = "window-controls";
      ctrlRow.innerHTML = `
        <button class="min-btn"   title="Minimize">–</button>
        <button class="max-btn"   title="Maximize">❐</button>
        <button class="close-btn" title="Close">×</button>
      `;
      winEl.querySelector('.title-bar').appendChild(ctrlRow);
    }

    // --- MINIMIZE ---
    ctrlRow.querySelector('.min-btn').onclick = (e) => {
      e.stopPropagation();
      winEl.style.display = "none";
      addMinimizedEntry(winEl);
    };

    // --- FULLSCREEN ---
    ctrlRow.querySelector('.max-btn').onclick = (e) => {
      e.stopPropagation();
      const full = winEl.classList.toggle("fullscreen");
      ctrlRow.querySelector('.max-btn').textContent = full ? "❐" : "❏";
      if (!winEl._origGeo) {
        winEl._origGeo = {
          left: winEl.style.left, top: winEl.style.top,
          width: winEl.style.width, height: winEl.style.height
        };
      }
      if (full) {
        winEl.style.left = "0px";
        winEl.style.top = "0px";
        winEl.style.width = "100vw";
        winEl.style.height = "100vh";
      } else if (winEl._origGeo) {
        winEl.style.left = winEl._origGeo.left;
        winEl.style.top = winEl._origGeo.top;
        winEl.style.width = winEl._origGeo.width;
        winEl.style.height = winEl._origGeo.height;
      }
    };

    // --- CLOSE ---
    ctrlRow.querySelector('.close-btn').onclick = (e) => {
      e.stopPropagation();
      winEl.style.display = "none";
    };
  }

  // App logic
  if (tplId === "promptWindow") wireTerminal(winEl);
  else if (tplId === "fileTreeWindow") {
    wireFileExplorerHub(winEl);
    populateHubFileExplorer(winEl);
    attachExplorerContextMenu(winEl);
  }
  else if (tplId === "fileViewerWindow") wireFileViewer(winEl);
  else if (tplId === "textPadWindow") wireTextPad(winEl);
  else if (tplId === "settingsWindow") wireSettings(winEl);
}

// --- Helper for minimized bar
function addMinimizedEntry(winEl) {
  const mc = document.getElementById("minimizedContainer");
  mc.style.display = "flex";
  if (mc.textContent.includes("No minimized windows")) mc.textContent = "";
  // Prevent duplicates
  for (const child of mc.children) {
    if (child.winEl === winEl) return;
  }
  const title = winEl.querySelector(".title-bar span")?.innerText || winEl.id;
  const entry = document.createElement("div");
  entry.className = "minimized-entry";
  entry.textContent = title;
  entry.winEl = winEl;
  entry.onclick = () => {
    entry.winEl.style.display = "block";
    bringToFront(entry.winEl);
    entry.remove();
    if (!mc.children.length) mc.textContent = "No minimized windows 😁";
  };
  mc.appendChild(entry);
}



// ================== Terminal Logic =======================
function wireTerminal(win) {


  // keep history
  win.chatHistory = win.chatHistory || [];

  // ——————————————————————————
  // 1) Chat‐thread flex + scroll
  const chat = win.querySelector(".chat-thread");
  Object.assign(chat.style, {
    display:        "flex",
    flexDirection:  "column",
    flex:           "1 1 auto",
    minHeight:      "250px",
    overflowY:      "auto",
    padding:        "12px"
  });

  // ——————————————————————————
  // 2) Prompt textarea
  let input = win.querySelector(".terminal-input");
  if (input.tagName !== "TEXTAREA") {
    const ta = document.createElement("textarea");
    ta.className    = input.className;
    ta.placeholder  = "Ask what’s on your mind";
    ta.rows         = 2;
    ta.style.resize = "vertical";
    input.replaceWith(ta);
    input = ta;
  } else {
    input.placeholder  = "Ask what’s on your mind";
    input.style.resize = "vertical";
    input.rows         = 2;
  }

  const runBtn = win.querySelector(".run-btn"),
        saveTh = win.querySelector(".save-thread-btn");

  // ——————————————————————————
  // 3) Append bubbles
  function appendUser(txt) {
    const d = document.createElement("div");
    d.className = "chat-message user";
    d.innerHTML = txt.replace(/\n/g, "<br>");
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  async function appendAssistant(txt) {
    // remove thinking‐loader immediately
    const loader = chat.querySelector(".thinking-loader");
    if (loader) loader.remove();

    const d = document.createElement("div");
    d.className = "chat-message assistant";
    chat.appendChild(d);
    await typeWriterHTML(txt, d);
    chat.scrollTop = chat.scrollHeight;
  }

  // ——————————————————————————
  // 4) API call + code blocks
  async function handlePrompt(txt, regenFile = null) {
    if (regenFile) {
      win.chatHistory.push({ role: "system", content: `Modify file ${regenFile}:` });
    }
    win.chatHistory.push({ role: "user", content: txt });

    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation: win.chatHistory })
      });
      const { response } = await res.json();
      win.chatHistory.push({ role: "assistant", content: response });

      // strip out code blocks
      const codeMatch = response.match(/```(\w+)?\n([\s\S]*?)```/i)
                     || response.match(/<html[\s\S]*<\/html>/i);
      const replyText = codeMatch
        ? response.replace(codeMatch[0], "").trim()
        : response;

      if (replyText) await appendAssistant(replyText);

      if (codeMatch) {
        const ext  = codeMatch[1] || (codeMatch[0].startsWith("<html") ? "html" : "txt");
        const code = codeMatch[2] || codeMatch[0];
        const fileCard = document.createElement("div");
        fileCard.className = "file-card";
        fileCard.innerHTML = `
          <div class="file-card-title"><b>generated.${ext}</b></div>
          <pre class="file-preview">${code}</pre>
          <div class="file-card-actions">
            <button class="save-btn">💾 Save</button>
            <button class="rename-btn">✏️ Rename</button>
            <button class="regen-btn">🔄 Regenerate</button>
          </div>
        `;
        // wire buttons…
        fileCard.querySelector(".save-btn").onclick = async () => {
          await saveFileToBackend("virtual", `generated.${ext}`, code);
          renderFileTree("virtual", "fs-file-tree");
          await appendAssistant(`✅ saved as generated.${ext}`);
        };
        fileCard.querySelector(".rename-btn").onclick = () => {
          const nm = prompt("Rename file to:", `generated.${ext}`);
          if (!nm) return;
          saveFileToBackend("virtual", nm, code)
            .then(() => renderFileTree("virtual", "fs-file-tree"))
            .then(() => appendAssistant(`✅ renamed to ${nm}`));
        };
        fileCard.querySelector(".regen-btn").onclick = () => {
          const p = prompt("New changes for generated." + ext);
          if (!p) return;
          handlePrompt(p, `generated.${ext}`);
        };

        chat.appendChild(fileCard);
        chat.scrollTop = chat.scrollHeight;
      }
    } catch (err) {
      console.error(err);
      await appendAssistant("⚠️ Error processing prompt.");
    }
  }

  // ——————————————————————————
  // 5) Run button: thinking animation + prompt
  runBtn.onclick = async () => {
    const txt = input.value.trim();
    if (!txt) return;
    input.value = "";

    appendUser(txt);

    // thinking‐loader
    const loader = document.createElement("div");
    loader.className = "thinking-loader";
    loader.innerHTML = `
      <div class="spinner"></div>
      <span class="thinking-text">Thinking</span><span class="ellipsis"></span>
    `;
    chat.appendChild(loader);
    chat.scrollTop = chat.scrollHeight;

    // animate dots
    let dots = 0;
    const ell = loader.querySelector(".ellipsis");
    const iv = setInterval(() => {
      dots = (dots + 1) % 4;
      ell.textContent = ".".repeat(dots);
    }, 500);

    // actually fetch
    await handlePrompt(txt);

    // cleanup (in case appendAssistant didn’t remove it)
    clearInterval(iv);
    loader.remove();
  };

  // allow Enter to send
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runBtn.click();
    }
  });

  // save‐thread
  saveTh.onclick = async () => {
    const data = JSON.stringify(win.chatHistory, null, 2);
    const proj = prompt("Save thread to project?", "virtual");
    const name = prompt("Filename (e.g. thread.json)?", "thread.json");
    if (!proj || !name) return;
    await saveFileToBackend(proj, name, data);
    alert(`✅ Thread saved as ${proj}/${name}`);
    renderFileTree(proj, "fs-file-tree");
  };
}


// =============== FILE EXPLORER HUB AND TREE ===============
function wireFileExplorerHub(winEl) {
  const backBtn = winEl.querySelector('.back-btn');
  backBtn.onclick = () => {
    backBtn.style.display = 'none';
    populateHubFileExplorer(winEl);
  };
}

function attachExplorerContextMenu(winEl) {
  const ctr = winEl.querySelector('.fs-file-tree');
  ctr.oncontextmenu = null;
  ctr.addEventListener('contextmenu', async e => {
    e.preventDefault();
    if (e.target.closest('li')) return;
    const name = prompt('New file name at root:');
    if (!name) return;
    await saveFileToBackend(winEl.currentProjectId, name, '');
    renderFileTree(winEl.currentProjectId, 'fs-file-tree');
  });
}

function addFileExplorerToolbar(winEl, projectId) {
  if (winEl.querySelector('.fs-toolbar')) return;
  const t = document.createElement('div');
  t.className = 'fs-toolbar';
  const makeBtn = (text, title, fn) => {
    const b = document.createElement('button');
    b.innerText = text;
    b.title     = title;
    b.onclick   = fn;
    return b;
  };
  t.append(
    makeBtn('New File',   'Create file',   async () => {
      const p = prompt('New file path:', 'newfile.txt');
      if (!p) return;
      await saveFileToBackend(projectId,p,'');
      renderFileTree(projectId,'fs-file-tree');
    }),
    makeBtn('New Folder', 'Create folder', async () => {
      const p = prompt('New folder path:', 'newfolder');
      if (!p) return;
      await fetch('/api/file/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({projectId,path:p+'/',isFolder:true})
      });
      renderFileTree(projectId,'fs-file-tree');
    })
  );
  winEl.querySelector('.fs-file-tree').before(t);
}

async function renderFileTree(projectId, containerSelector) {
  const containers = typeof containerSelector === 'string'
    ? Array.from(document.querySelectorAll('.' + containerSelector))
    : [containerSelector];
  let files = [];
  try {
    const res = await fetch(`/api/files?projectId=${encodeURIComponent(projectId)}`);if (res.status >= 400) throw new Error('Load error');
    files = (await res.json()).files || [];
  } catch {
    containers.forEach(c => c.innerHTML = '<p style="color:#f55">Load error</p>');
    return;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const fmt  = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  function makeTree(files) {
    const tree = {};
    for (const f of files) {
      if (f.path === '') continue;
      if (f.name === '.keep' || f.path === '.keep') continue;
      const parts = f.path ? f.path.split('/') : [];
      let node = tree;
      for (let i = 0; i < parts.length; ++i) {
        node.children = node.children || {};
        node.children[parts[i]] = node.children[parts[i]] || {};
        node = node.children[parts[i]];
      }
      node.data = f;
    }
    return tree;
  }

  function buildFolder(node, parentUl, relPath) {
    if (!node) return;
    const d = node.data || { path: relPath, isFolder: true, created: null };
    if (!d.isFolder) return;
    const li = document.createElement('li');
    li.className = 'folder-li';
    const isRoot = !relPath || relPath === '';
    const lbl = document.createElement('span');
    lbl.className = 'folder';
    lbl.innerText = isRoot ? '[project root]' : relPath.split('/').pop();
    lbl.title = relPath || '[project root]';
    lbl.onclick = e => {
      e.stopPropagation();
      const sub = li.querySelector('ul');
      if (sub) sub.style.display = sub.style.display === 'none' ? 'block' : 'none';
    };
    const meta = document.createElement('span');
    meta.className = 'file-meta';
    meta.textContent = d.created ? `📅 ${fmt(d.created)}` : '';
    const mkBtn = (icon, title, fn) => {
      const b = document.createElement('button');
      b.className = 'action-btn ' +
        (title.includes('Rename') ? 'edit-btn' : title.includes('Delete') ? 'delete-btn' : 'open-btn');
      b.innerHTML = icon === 'open' ? '📂' : icon === 'edit' ? '✏️' : '🗑️';
      b.title = title;
      b.onclick = fn;
      return b;
    };
    li.append(lbl);
    if (!isRoot) {
      li.append(
        mkBtn('edit', 'Rename folder', async e => {
          e.stopPropagation();
          const nn = prompt('Rename folder to:', relPath.split('/').pop());
          if (!nn || nn === relPath.split('/').pop()) return;
          const newRel = relPath.split('/').slice(0, -1).concat(nn).filter(Boolean).join('/');
          await fetch('/api/file/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, oldPath: relPath, newPath: newRel })
          });
          renderFileTree(projectId, containerSelector);
        }),
        mkBtn('delete', 'Delete folder', async e => {
          e.stopPropagation();
          if (!confirm(`Delete "${relPath}"?`)) return;
          await fetch('/api/file/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, path: relPath })
          });
          renderFileTree(projectId, containerSelector);
        }),
      );
    }
    li.append(
      mkBtn('open', 'New file in folder', async e => {
        e.stopPropagation();
        const nm = prompt(`New file name in "${relPath || '[project root]'}":`);
        if (!nm) return;
        const p = relPath ? `${relPath}/${nm}` : nm;
        await saveFileToBackend(projectId, p, '');
        renderFileTree(projectId, containerSelector);
      }),
      meta
    );
    const ul = document.createElement('ul');
    Object.entries(node.children || {}).forEach(([k, child]) => {
      if (child.data?.isFolder) return;
      const file = child.data;
      if (!file) return;
      if (file.name === '.keep') return;
      const fli = document.createElement('li');
      fli.className = 'file-li';
      const flbl = document.createElement('span');
      flbl.className = 'file';
      flbl.innerText = k;
      flbl.title = k;
      const openInTextPad = async () => {
        const tpw = document.getElementById('textPadWindow');
        tpw.style.display = 'block';
        bringToFront(tpw);
        tpw.currentProject = projectId;
        tpw.currentPath = file.path;
        const editor = tpw.querySelector('.textpad-editor');
        const resp = await fetch(`/data/${projectId}/${encodeURIComponent(file.path)}`);
        editor.value = resp.ok ? await resp.text() : '';
      };
      flbl.onclick = openInTextPad;
      const mkBtn = (icon, title, fn) => {
        const b = document.createElement('button');
        const cls = title.includes('Rename') ? 'edit-btn' : title.includes('Delete') ? 'delete-btn' : 'open-btn';
        b.className = 'action-btn ' + cls;
        b.innerHTML = SVG_ICONS[icon];
        b.title = title;
        b.onclick = fn;
        return b;
      };
      const op = mkBtn('open', 'Open in TextPad', openInTextPad);
      const ts = document.createElement('span');
      ts.className = 'file-meta';
      ts.textContent = file.created ? `📅 ${fmt(file.created)}` : '';
      fli.append(
        flbl,
        op,
        mkBtn('edit', 'Rename file', async e => {
          e.stopPropagation();
          const nn = prompt('Rename file to:', k);
          if (!nn || nn === k) return;
          const np = file.path.replace(/[^/]+$/, nn);
          await fetch('/api/file/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, oldPath: file.path, newPath: np })
          });
          renderFileTree(projectId, containerSelector);
        }),
        mkBtn('delete', 'Delete file', async e => {
          e.stopPropagation();
          if (!confirm(`Delete "${k}"?`)) return;
          await fetch('/api/file/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, path: file.path })
          });
          renderFileTree(projectId, containerSelector);
        }),
        ts
      );
      ul.appendChild(fli);
      ul.appendChild(Object.assign(document.createElement('div'), { className: 'explorer-divider' }));
    });
    Object.entries(node.children || {}).forEach(([k, child]) => {
      if (!child.data?.isFolder) return;
      buildFolder(child, ul, relPath ? `${relPath}/${k}` : k);
    });
    li.appendChild(ul);
    parentUl.appendChild(li);
    parentUl.appendChild(Object.assign(document.createElement('div'), { className: 'explorer-divider' }));
  }

  containers.forEach(c => {
    c.innerHTML = '';
    const tree = makeTree(files);
    const rootUl = document.createElement('ul');
    buildFolder(tree, rootUl, '');
    c.appendChild(rootUl);
  });
}

async function populateHubFileExplorer(winEl) {
  const ctr  = winEl.querySelector('.fs-file-tree');
  const back = winEl.querySelector('.back-btn');
  back.style.display = 'none';
  ctr.innerHTML = '<p>Loading…</p>';

  try {
    // fetch projects (allow 304, fail on 400+)
    const res = await fetch('/api/projects');
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    const { projects } = await res.json();
    ctr.innerHTML = '';

    // helper: zero-pad and format ISO dates
    const pad2 = n => String(n).padStart(2, '0');
    const fmt  = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
           + ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };

    // “New Project” button
    const newProj = document.createElement('button');
    newProj.className = 'new-project-btn';
    newProj.title     = 'Create a new project';
    newProj.innerText = 'New Project';
    newProj.onclick   = async () => {
      const name = prompt('New project name:');
      if (!name) return;
      await fetch('/api/file/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: name, path: '.keep', content: '' })
      });
      populateHubFileExplorer(winEl);
    };
    ctr.appendChild(newProj);
    ctr.appendChild(Object.assign(document.createElement('div'), { className: 'explorer-divider' }));

    // simple emoji icons instead of missing SVG
    const ICON_MAP = { open: '📂', edit: '✏️', delete: '🗑️' };
    const makeBtn = (icon, title, fn) => {
      const b = document.createElement('button');
      b.className = 'action-btn '
                   + (title === 'Open'   ? 'open-btn'
                    : title === 'Rename' ? 'edit-btn'
                                         : 'delete-btn');
      b.innerText = ICON_MAP[icon] || title;
      b.title     = `${title} project`;
      b.onclick   = fn;
      return b;
    };

    // render each project line
    projects.forEach((proj, i) => {
      const { id: pid, created } = proj;
      const line = document.createElement('div');
      line.className = 'explorer-line';

      const openTree = () => {
        winEl.currentProjectId = pid;
        back.style.display     = 'block';
        renderFileTree(pid, 'fs-file-tree');
        addFileExplorerToolbar(winEl, pid);
        attachExplorerContextMenu(winEl);
      };

      const chip = document.createElement('span');
      chip.className = 'folder project-chip';
      chip.title     = `Open "${pid}"`;
      chip.innerText = pid;
      chip.onclick   = openTree;

      const ts = document.createElement('span');
      ts.className = 'file-meta';
      ts.style.marginLeft = '10px';
      ts.textContent = created ? `📅 ${fmt(created)}` : '';

      line.append(
        chip,
        makeBtn('open',   'Open',   openTree),
        makeBtn('edit',   'Rename', async () => {
          const nn = prompt('Rename to:', pid);
          if (!nn || nn === pid) return;
          await fetch('/api/project/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldId: pid, newId: nn })
          });
          populateHubFileExplorer(winEl);
        }),
        makeBtn('delete', 'Delete', async () => {
          if (!confirm(`Delete "${pid}"?`)) return;
          await fetch('/api/file/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: pid, path: '' })
          });
          populateHubFileExplorer(winEl);
        }),
        ts
      );

      ctr.appendChild(line);

      // divider after first project
      if (i === 0) {
        const hr = Object.assign(document.createElement('div'), { className: 'explorer-divider' });
        hr.style.margin = '18px 0 12px';
        ctr.appendChild(hr);
      }
    });

  } catch (err) {
    console.error('populateHubFileExplorer error:', err);
    ctr.innerHTML = '<p style="color:#f55">Failed to load projects</p>';
  }
}



// ================== Mirror Logic ===================
function wireMirror(winEl) {
  const ta = winEl.querySelector('#mirrorTextarea');
  const saveBtn = winEl.querySelector('#mirrorSaveBtn');
  const sendBtn = winEl.querySelector('#mirrorSendBtn');
  const stat = winEl.querySelector('#mirrorStatus');
  ta.value = localStorage.getItem('mirror_journal') || '';
  saveBtn.onclick = async () => {
    localStorage.setItem('mirror_journal', ta.value);
    try {
      const projects = (await fetch('/api/projects').then(r=>r.json())).projects || [];
      let pid = projects[0]?.id || '';
      pid = prompt('Save journal in which project?', pid);
      if (!pid) return;
      const fname = prompt('Save as (e.g. notes/journal.txt):', 'journal.txt');
      if (!fname) return;
      await saveFileToBackend(pid, fname, ta.value);
      vfs.writeFile(pid, fname, ta.value);
      stat.innerHTML = `Saved as <b>${pid}/${fname}</b> 📁`;
      setTimeout(() => stat.innerHTML = '&nbsp;', 2200);
      renderFileTree(pid, 'fs-file-tree');
    } catch (err) {
      stat.innerHTML = 'Save failed 😞';
      setTimeout(() => stat.innerHTML = '&nbsp;', 2000);
    }
  };
  sendBtn.onclick = () => {
    const terminal = document.getElementById('promptWindow');
    terminal.style.display = 'block';
    bringToFront(terminal);
    const input = terminal.querySelector('.terminal-input');
    input.value = ta.value;
    stat.innerHTML = "Sent to terminal! 🧠";
    setTimeout(() => stat.innerHTML = '&nbsp;', 1500);
  };
}

// ================== File Viewer Logic ===================
function wireFileViewer(winEl) {
  const backBtn = winEl.querySelector('.viewer-back-btn');
  const runBtn  = winEl.querySelector('.run-file-btn');
  const saveBtn = winEl.querySelector('.save-viewer-file-btn');
  const delBtn  = winEl.querySelector('.delete-viewer-file-btn');
  const ta      = winEl.querySelector('.viewer-content');
  backBtn.onclick = () => {
    winEl.style.display = 'none';
    const ex = document.getElementById('fileTreeWindow');
    ex.style.display = 'block';
    bringToFront(ex);
    if (winEl.currentProjectId) renderFileTree(winEl.currentProjectId,'fs-file-tree');
  };
  runBtn.onclick = () => {
    if (/\.html?$/i.test(winEl.currentPath)) {
      const w = window.open();
      w.document.write(ta.value);
    } else alert('Not an HTML file');
  };
  saveBtn.onclick = async () => {
    if (!winEl.currentProjectId||!winEl.currentPath) return;
    const res = await fetch('/api/file/save',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        projectId: winEl.currentProjectId,
        path: winEl.currentPath,
        content: ta.value
      })
    });
    const { success } = await res.json();
    alert(success?'File saved':'Save failed');
  };
  delBtn.onclick = async () => {
    if (!winEl.currentProjectId||!winEl.currentPath) return;
    if (!confirm(`Delete ${winEl.currentPath}?`)) return;
    await fetch('/api/file/delete',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        projectId: winEl.currentProjectId,
        path: winEl.currentPath
      })
    });
    winEl.style.display = 'none';
  };
}

async function saveFileToBackend(projectId, path, content) {
  await fetch('/api/file/save',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ projectId, path, content })
  });
}

// ================ TextPad wiring & code preview ================
function wireTextPad(winEl) {
  const editor = winEl.querySelector('.textpad-editor');
  const saveBtn = winEl.querySelector('.save-textpad-btn');
  const runBtn = winEl.querySelector('.run-textpad-btn');
  saveBtn.onclick = async () => {
    const pid = winEl.currentProject, path = winEl.currentPath;
    await saveFileToBackend(pid, path, editor.value);
    vfs.writeFile(pid, path, editor.value);
    alert('File saved!');
    renderFileTree(pid, 'fs-file-tree');
  };
  runBtn.onclick = () => {
    if (winEl.currentPath && /\.html?$/i.test(winEl.currentPath)) {
      const w = window.open();
      w.document.write(editor.value);
    } else alert('Only HTML can be previewed!');
  };
}

// ========== Generated File Card (Terminal Output) ==========
function addGeneratedFileCard(container, filename, content, onSave, onRename, onRun, onEdit) {
  const card = document.createElement('div');
  card.className = 'file-card';
  card.innerHTML = `
    <div class="file-card-title"><b>${filename}</b></div>
    <pre class="file-preview">${content.slice(0, 400)}${content.length>400?'…':''}</pre>
    <div class="file-card-actions">
      <button class="save-btn">💾 Save</button>
      <button class="rename-btn">✏️ Rename</button>
      <button class="run-btn">▶️ Run</button>
      <button class="edit-btn">📝 Edit</button>
    </div>
  `;
  card.querySelector('.save-btn').onclick   = () => onSave && onSave();
  card.querySelector('.rename-btn').onclick = () => onRename && onRename();
  card.querySelector('.run-btn').onclick    = () => onRun && onRun();
  card.querySelector('.edit-btn').onclick   = () => onEdit && onEdit(card);
  container.appendChild(card);
}


// ========== Typewriter for Assistant Replies ==========
function typeWriterHTML(txt, el, speed = 20) {
  return new Promise(res => {
    let i = 0, html = '';
    (function step() {
      if (i < txt.length) {
        const c = txt.charAt(i++);
        html += c === '&'  ? '&amp;'
              : c === '<'  ? '&lt;'
              : c === '>'  ? '&gt;'
              : c === '\n' ? '<br>'
              : c;
        el.innerHTML = html;
        setTimeout(step, speed);
      } else res();
    })();
  });
}

// ====== ICON PLANE ("app shelf" for all icons) ======
function createIconPlane() {
  let iconPlane = document.getElementById('iconPlane');
  if (!iconPlane) {
    iconPlane = document.createElement('div');
    iconPlane.id = 'iconPlane';
    iconPlane.style.position = 'fixed';
    iconPlane.style.top = '36px';
    iconPlane.style.left = '50px';
    iconPlane.style.width = '70px';
    iconPlane.style.height = '420px';
    iconPlane.style.background = 'rgba(24,32,46,0.92)';
    iconPlane.style.borderRadius = '18px';
    iconPlane.style.boxShadow = '0 4px 32px #00edff44, 0 1px 7px #0af8a066';
    iconPlane.style.display = 'flex';
    iconPlane.style.flexDirection = 'column';
    iconPlane.style.alignItems = 'center';
    iconPlane.style.gap = '22px';
    iconPlane.style.zIndex = 502;
    iconPlane.style.cursor = 'grab';
    document.body.appendChild(iconPlane);

    // Draggable logic for the icon plane
    iconPlane.addEventListener('mousedown', function(e) {
      if (e.target !== iconPlane) return;
      iconPlane.style.cursor = 'grabbing';
      const startX = e.clientX, startY = e.clientY;
      const origLeft = parseInt(iconPlane.style.left), origTop = parseInt(iconPlane.style.top);
      function mm(ev) {
        let newLeft = origLeft + (ev.clientX - startX);
        let newTop  = origTop  + (ev.clientY - startY);
        // Keep inside window
        newLeft = Math.max(8, Math.min(newLeft, window.innerWidth - iconPlane.offsetWidth - 8));
        newTop  = Math.max(8, Math.min(newTop, window.innerHeight - iconPlane.offsetHeight - 60));
        iconPlane.style.left = `${newLeft}px`;
        iconPlane.style.top  = `${newTop}px`;

        // If colliding with mirror window, nudge mirror right
        const mirror = document.getElementById('mirrorWindow');
        if (mirror) {
          const iconRect = iconPlane.getBoundingClientRect();
          const mirrorRect = mirror.getBoundingClientRect();
          // If icon plane is overlapping the default mirror area (top right)
          if (iconRect.right > window.innerWidth - 440 && iconRect.top < 480) {
            mirror.style.right = (window.innerWidth - iconRect.right + 22) + 'px';
          } else {
            mirror.style.right = '36px';
          }
        }
      }
      function mu() {
        iconPlane.style.cursor = 'grab';
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  }
  return iconPlane;
}





function wireSettings(winEl) {
  // -- Get elements
  const bgRadios    = Array.from(winEl.querySelectorAll('input[name="bgType"]'));
  const bgColorInp  = winEl.querySelector('input[name="bgColor"]');
  const imgInput    = winEl.querySelector('#wallpaperUpload');
  const fontSelect  = winEl.querySelector('#fontSelect');
  const terminalCol = winEl.querySelector('#terminalColorPicker');
  const explorerCol = winEl.querySelector('#explorerColorPicker');
  const textpadCol  = winEl.querySelector('#textpadColorPicker');
  const assistantCol= winEl.querySelector('#assistantColorPicker');
  const applyBtn    = winEl.querySelector('#applySettingsBtn');

  // -- Restore settings from localStorage
  const storedType = localStorage.getItem('bgType') || 'matrix';
  bgRadios.forEach(r => { r.checked = (r.value === storedType); });
  bgColorInp.value = localStorage.getItem('bgColor') || '#0a0a0a';
  fontSelect.value = localStorage.getItem('fontFamily') || 'Segoe UI, sans-serif';
  terminalCol.value   = localStorage.getItem('terminalColor')   || '#e0e0e0';
  explorerCol.value   = localStorage.getItem('explorerColor')   || '#e0e0e0';
  textpadCol.value    = localStorage.getItem('textpadColor')    || '#e0e0e0';
  assistantCol.value  = localStorage.getItem('assistantColor')  || '#3db5ff';

  // Show/hide color and file input based on bgType
  function updateBgUI() {
    const type = bgRadios.find(r => r.checked)?.value || 'matrix';
    if (type === 'color') {
      bgColorInp.style.display = '';
      imgInput.style.display = 'none';
    } else if (type === 'image') {
      bgColorInp.style.display = 'none';
      imgInput.style.display = '';
    } else {
      bgColorInp.style.display = 'none';
      imgInput.style.display = 'none';
    }
  }
  bgRadios.forEach(r => r.onchange = updateBgUI);
  updateBgUI();

  // -- Apply button logic
  applyBtn.onclick = function () {
    // BG type
    const type = bgRadios.find(r => r.checked)?.value || 'matrix';
    localStorage.setItem('bgType', type);
    // BG color
    if (type === 'color') {
      localStorage.setItem('bgColor', bgColorInp.value);
    }
    // BG image
    if (type === 'image' && imgInput.files[0]) {
      const reader = new FileReader();
      reader.onload = e => {
        localStorage.setItem('customWallpaper', e.target.result);
        applyBackground();
      };
      reader.readAsDataURL(imgInput.files[0]);
    }
    // Font and colors
    localStorage.setItem('fontFamily', fontSelect.value);
    localStorage.setItem('terminalColor',   terminalCol.value);
    localStorage.setItem('explorerColor',   explorerCol.value);
    localStorage.setItem('textpadColor',    textpadCol.value);
    localStorage.setItem('assistantColor',  assistantCol.value);

    // Apply background (your applyBackground() function handles logic)
    applyBackground();

    // Apply font and color changes to UI
    document.body.style.fontFamily = fontSelect.value;
    // These selectors are just examples; update them to match your UI!
    document.querySelectorAll('.terminal-input,.chat-thread').forEach(el =>
      el.style.color = terminalCol.value);
    document.querySelectorAll('.fs-file-tree,.explorer-line').forEach(el =>
      el.style.color = explorerCol.value);
    document.querySelectorAll('.textpad-editor').forEach(el =>
      el.style.color = textpadCol.value);
    document.querySelectorAll('.assistant,.chat-message.assistant').forEach(el =>
      el.style.color = assistantCol.value);
  };

  // Re-apply UI if reopened
  winEl.addEventListener('show', updateBgUI);
}


// ============= ONLOAD: Setup everything ============

// ============= ONLOAD: Setup everything ============
window.onload = () => {
  // ensure your dock & icons show immediately if DOMContentLoaded already fired
  launchDesktop();

  // pin the mirror (it'll stay top-right)
  placeMirrorWindow();

  // toggle minimized bar
  const minBarHeader = document.getElementById('minBarHeader');
  if (minBarHeader) {
    minBarHeader.onclick = () => {
      const mc = document.getElementById('minimizedContainer');
      mc.style.display = (mc.style.display === "none" ? "flex" : "none");
    };
  }

  // initialize **all** your windows (draggable, resizable, wiring)
  [
    'promptWindow', 'fileTreeWindow', 'fileViewerWindow',
    'settingsWindow', 'textPadWindow', 'mirrorWindow'
  ].forEach(id => {
    const w = document.getElementById(id);
    if (w) initializeWindow(w, id);
  });

  // settings-icon shortcut
  const settingsIcon = document.getElementById('settingsAppIcon');
  if (settingsIcon) {
    settingsIcon.onclick = () => {
      const w = document.getElementById('settingsWindow');
      wireSettings(w);
      w.style.display = 'block';
      bringToFront(w);
    };
  }

  // mirror always visible
  document.getElementById('mirrorWindow').style.display = 'block';

  // live clock
  setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) {
      clock.innerText = new Date().toLocaleTimeString([], {
        hour:   '2-digit',
        minute: '2-digit'
      });
    }
  }, 1000);

  // default minimized-bar state
  const mc = document.getElementById('minimizedContainer');
  if (mc) {
    mc.style.display = 'none';
    mc.textContent   = 'No minimized windows 😁';
  }
};

