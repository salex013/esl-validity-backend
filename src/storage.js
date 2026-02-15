const fs = require("fs");
const path = require("path");

function makeId() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function safeDir() {
  const dir = process.env.DATA_DIR;
  if (!dir) return null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

const dir = safeDir();
const filePath = dir ? path.join(dir, "history.json") : null;

let memory = [];

function loadFromDisk() {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) memory = parsed;
  } catch {
    // ignore
  }
}

function saveToDisk() {
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf8");
  } catch {
    // ignore
  }
}

loadFromDisk();

const storage = {
  mode() {
    return filePath ? `disk:${filePath}` : "memory";
  },

  async save({ input, output, mode }) {
    const item = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      mode,
      input,
      output
    };
    memory.unshift(item);
    // cap size (avoid infinite growth)
    memory = memory.slice(0, 500);
    saveToDisk();
    return item;
  },

  async list(limit = 50) {
    return memory.slice(0, limit).map((x) => ({
      id: x.id,
      createdAt: x.createdAt,
      mode: x.mode,
      // small preview only (dashboard-friendly)
      preview: {
        skill: x.input?.skill,
        levelFramework: x.input?.levelFramework,
        level: x.input?.level,
        purpose: x.input?.purpose,
        summary: x.output?.summary
      }
    }));
  },

  async get(id) {
    return memory.find((x) => x.id === id) || null;
  }
};

module.exports = { storage };
