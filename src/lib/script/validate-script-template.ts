/**
 * 验证脚本模板：写入项目目录的 validate.js
 * Cursor 可直接执行 `node validate.js` 进行数据一致性校验
 */
export const VALIDATE_SCRIPT_CONTENT = `#!/usr/bin/env node
/**
 * 魔音漫创项目数据校验脚本
 * 用法: node validate.js [--fix]
 * 
 * --fix  自动修复可修复的问题（补全缺失字段、同步 characterNames、移除无效引用）
 */
const fs = require('fs');
const path = require('path');

const FIX_MODE = process.argv.includes('--fix');
const ROOT = __dirname;

let errors = 0;
let warnings = 0;
let fixed = 0;

function error(msg) { errors++; console.log('\\x1b[31m  ERROR\\x1b[0m', msg); }
function warn(msg) { warnings++; console.log('\\x1b[33m  WARN \\x1b[0m', msg); }
function info(msg) { console.log('\\x1b[36m  INFO \\x1b[0m', msg); }
function ok(msg) { console.log('\\x1b[32m  OK   \\x1b[0m', msg); }
function fixLog(msg) { fixed++; console.log('\\x1b[35m  FIX  \\x1b[0m', msg); }

// ============== 字段 Schema 定义 ==============

const CHARACTER_SCHEMA = {
  id: '',
  name: '',
  gender: '',
  age: '',
  personality: '',
  role: '',
  traits: '',
  skills: '',
  keyActions: '',
  appearance: '',
  relationships: '',
  tags: [],
  notes: '',
  visualPromptEn: '',
  visualPromptZh: '',
};

const SCENE_SCHEMA = {
  id: '',
  name: '',
  location: '',
  time: 'day',
  atmosphere: '',
  visualPrompt: '',
  tags: [],
  notes: '',
  architectureStyle: '',
  lightingDesign: '',
  colorPalette: '',
};

const EPISODE_SCHEMA = {
  id: '',
  index: 0,
  title: '',
  description: '',
  sceneIds: [],
};

const SHOT_SCHEMA = {
  id: '',
  index: 0,
  episodeId: '',
  sceneRefId: '',
  actionSummary: '',
  dialogue: '',
  characterIds: [],
  characterNames: [],
  characterVariations: {},
  shotSize: '',
  duration: 5,
  cameraMovement: 'static',
};

const PROJECT_SCHEMA = {
  name: '',
  title: '',
  genre: '',
  era: '',
  language: '中文',
  outline: '',
  characterBios: '',
  worldSetting: '',
  themes: [],
  promptLanguage: 'zh+en',
  totalEpisodes: 1,
  styleId: '',
  targetDuration: '',
};

// ============== 工具函数 ==============

function readJsonDir(dir) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return {};
  const result = {};
  for (const file of fs.readdirSync(fullDir).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(fullDir, file), 'utf-8'));
      const id = data.id || path.basename(file, '.json');
      result[id] = { ...data, _file: path.join(dir, file) };
    } catch (e) {
      error(dir + '/' + file + ' JSON 解析失败: ' + e.message);
    }
  }
  return result;
}

function stripInternal(obj) {
  const { _file, ...rest } = obj;
  return rest;
}

/**
 * 检查对象是否包含 schema 中定义的所有字段，缺失则报错，--fix 时补全默认值
 */
function checkFields(obj, schema, label) {
  const missing = [];
  let patched = false;
  for (const [key, defaultVal] of Object.entries(schema)) {
    if (!(key in obj)) {
      missing.push(key);
      if (FIX_MODE) {
        obj[key] = defaultVal;
        patched = true;
      }
    }
  }
  if (missing.length > 0) {
    error(label + ': 缺少字段 [' + missing.join(', ') + ']');
    if (patched) {
      fixLog(label + ': 已补全缺失字段 [' + missing.join(', ') + ']');
    }
  }
  return patched;
}

// ============== 开始校验 ==============

console.log('\\n\\x1b[1m魔音漫创项目数据校验\\x1b[0m');
console.log('目录:', ROOT);
if (FIX_MODE) console.log('\\x1b[35m自动修复模式已开启\\x1b[0m');
console.log('');

// 读取所有数据
const characters = readJsonDir('characters');
const scenes = readJsonDir('scenes');
const episodes = readJsonDir('episodes');
const shots = readJsonDir('shots');

const charIds = new Set(Object.keys(characters));
const sceneIds = new Set(Object.keys(scenes));
const epIds = new Set(Object.keys(episodes));
const shotIds = new Set(Object.keys(shots));

info('角色: ' + charIds.size + ' 个, 场景: ' + sceneIds.size + ' 个, 剧集: ' + epIds.size + ' 个, 分镜: ' + shotIds.size + ' 个');
console.log('');

// ============== 0. 检查 project.json ==============

console.log('\\x1b[1m[项目配置检查]\\x1b[0m');
const projectFile = path.join(ROOT, 'project.json');
if (fs.existsSync(projectFile)) {
  try {
    const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
    const patched = checkFields(project, PROJECT_SCHEMA, 'project.json');
    if (patched) {
      fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
    }
    ok('project.json 检查完成');
  } catch (e) {
    error('project.json 解析失败: ' + e.message);
  }
} else {
  error('缺少 project.json');
}
console.log('');

// ============== 1. 检查角色 ==============

console.log('\\x1b[1m[角色字段检查]\\x1b[0m');
for (const [id, char] of Object.entries(characters)) {
  const label = char._file;
  const patched = checkFields(char, CHARACTER_SCHEMA, label);
  if (char.id && char.id !== id) warn(label + ': id "' + char.id + '" 与文件名 "' + id + '" 不匹配');
  if (patched) {
    fs.writeFileSync(path.join(ROOT, char._file), JSON.stringify(stripInternal(char), null, 2));
  }
}
if (charIds.size > 0 && errors === 0) ok('角色字段完整');
console.log('');

// ============== 2. 检查场景 ==============

console.log('\\x1b[1m[场景字段检查]\\x1b[0m');
for (const [id, scene] of Object.entries(scenes)) {
  const label = scene._file;
  const patched = checkFields(scene, SCENE_SCHEMA, label);
  if (patched) {
    fs.writeFileSync(path.join(ROOT, scene._file), JSON.stringify(stripInternal(scene), null, 2));
  }
}
if (sceneIds.size > 0 && errors === 0) ok('场景字段完整');
console.log('');

// ============== 3. 检查剧集 ==============

console.log('\\x1b[1m[剧集字段检查]\\x1b[0m');
for (const [id, ep] of Object.entries(episodes)) {
  const label = ep._file;
  const patched = checkFields(ep, EPISODE_SCHEMA, label);
  // 检查 sceneIds 引用
  if (Array.isArray(ep.sceneIds)) {
    const invalidScenes = ep.sceneIds.filter(sid => !sceneIds.has(sid));
    for (const sid of invalidScenes) {
      error(label + ': sceneIds 引用了不存在的场景 "' + sid + '"');
    }
    if (FIX_MODE && invalidScenes.length > 0) {
      ep.sceneIds = ep.sceneIds.filter(s => sceneIds.has(s));
      fixLog(label + ': 已移除无效的场景引用');
      fs.writeFileSync(path.join(ROOT, ep._file), JSON.stringify(stripInternal(ep), null, 2));
    } else if (patched) {
      fs.writeFileSync(path.join(ROOT, ep._file), JSON.stringify(stripInternal(ep), null, 2));
    }
  }
}
if (epIds.size > 0 && errors === 0) ok('剧集字段完整');
console.log('');

// ============== 4. 检查分镜 ==============

console.log('\\x1b[1m[分镜字段检查]\\x1b[0m');
const charNameMap = {};
for (const [id, char] of Object.entries(characters)) {
  if (char.name) charNameMap[char.name] = id;
}

for (const [id, shot] of Object.entries(shots)) {
  const file = shot._file;
  let needWrite = false;

  // 字段完整性检查
  const patched = checkFields(shot, SHOT_SCHEMA, file);
  if (patched) needWrite = true;

  // 引用检查
  if (shot.episodeId && !epIds.has(shot.episodeId)) {
    error(file + ': episodeId "' + shot.episodeId + '" 不存在');
  }
  if (shot.sceneRefId && !sceneIds.has(shot.sceneRefId)) {
    error(file + ': sceneRefId "' + shot.sceneRefId + '" 不存在');
  }

  // 角色引用检查
  const cIds = Array.isArray(shot.characterIds) ? shot.characterIds : [];
  const cNames = Array.isArray(shot.characterNames) ? shot.characterNames : [];

  for (let i = 0; i < cIds.length; i++) {
    const cid = cIds[i];
    if (!charIds.has(cid)) {
      error(file + ': characterIds[' + i + '] 引用了不存在的角色 "' + cid + '"');
      if (FIX_MODE) {
        const name = cNames[i];
        if (name && charNameMap[name]) {
          shot.characterIds[i] = charNameMap[name];
          fixLog(file + ': 角色 "' + name + '" 的 ID 已修正为 "' + charNameMap[name] + '"');
          needWrite = true;
        } else {
          shot.characterIds.splice(i, 1);
          if (shot.characterNames) shot.characterNames.splice(i, 1);
          fixLog(file + ': 已移除无效角色引用 "' + cid + '"');
          needWrite = true;
          i--;
        }
      }
    }
  }

  // characterNames 同步检查
  if (cIds.length !== cNames.length) {
    warn(file + ': characterIds(' + cIds.length + '个) 与 characterNames(' + cNames.length + '个) 长度不一致');
    if (FIX_MODE) {
      shot.characterNames = (shot.characterIds || [])
        .filter(cid => charIds.has(cid))
        .map(cid => characters[cid]?.name || '未知');
      fixLog(file + ': 已同步 characterNames');
      needWrite = true;
    }
  } else {
    for (let i = 0; i < cIds.length; i++) {
      if (charIds.has(cIds[i]) && characters[cIds[i]]?.name !== cNames[i]) {
        warn(file + ': characterNames[' + i + '] "' + cNames[i] + '" 应为 "' + characters[cIds[i]]?.name + '"');
        if (FIX_MODE) {
          shot.characterNames[i] = characters[cIds[i]].name;
          fixLog(file + ': 已修正 characterNames[' + i + ']');
          needWrite = true;
        }
      }
    }
  }

  // shotSize 合法性
  const validSizes = ['WS','FS','MLS','MS','MCU','CU','ECU','OTS'];
  if (shot.shotSize && !validSizes.includes(shot.shotSize)) {
    warn(file + ': shotSize "' + shot.shotSize + '" 不在有效值列表中 [' + validSizes.join(', ') + ']');
  }

  if (needWrite) {
    fs.writeFileSync(path.join(ROOT, file), JSON.stringify(stripInternal(shot), null, 2));
  }
}
if (shotIds.size > 0 && errors === 0) ok('分镜字段完整');
console.log('');

// ============== 5. 交叉引用检查 ==============

console.log('\\x1b[1m[交叉引用]\\x1b[0m');

const referencedChars = new Set();
for (const shot of Object.values(shots)) {
  (shot.characterIds || []).forEach(id => referencedChars.add(id));
}
for (const [id, char] of Object.entries(characters)) {
  if (!referencedChars.has(id)) {
    warn('角色 "' + char.name + '" (' + id + ') 未被任何分镜引用');
  }
}

const referencedScenes = new Set();
for (const shot of Object.values(shots)) {
  if (shot.sceneRefId) referencedScenes.add(shot.sceneRefId);
}
for (const [id, scene] of Object.entries(scenes)) {
  if (!referencedScenes.has(id)) {
    warn('场景 "' + (scene.name || scene.location) + '" (' + id + ') 未被任何分镜引用');
  }
}

ok('交叉引用检查完成');
console.log('');

// ============== 6. ID 格式检查 ==============

console.log('\\x1b[1m[ID 格式]\\x1b[0m');
for (const id of charIds) {
  if (!/^char_\\d{3}/.test(id)) warn('角色 ID "' + id + '" 不符合 char_XXX 命名规范');
}
for (const id of sceneIds) {
  if (!/^scene_\\d{3}/.test(id)) warn('场景 ID "' + id + '" 不符合 scene_XXX 命名规范');
}
for (const id of epIds) {
  if (!/^ep_\\d{3}/.test(id)) warn('剧集 ID "' + id + '" 不符合 ep_XXX 命名规范');
}
for (const id of shotIds) {
  if (!/^shot_\\d{3}/.test(id)) warn('分镜 ID "' + id + '" 不符合 shot_XXX 命名规范');
}
ok('ID 格式检查完成');
console.log('');

// ============== 汇总 ==============

console.log('\\x1b[1m========== 校验结果 ==========\\x1b[0m');
if (errors > 0) console.log('\\x1b[31m  错误: ' + errors + ' 个\\x1b[0m');
if (warnings > 0) console.log('\\x1b[33m  警告: ' + warnings + ' 个\\x1b[0m');
if (fixed > 0) console.log('\\x1b[35m  已修复: ' + fixed + ' 处\\x1b[0m');
if (errors === 0 && warnings === 0) console.log('\\x1b[32m  全部通过！数据一致性完好。\\x1b[0m');
console.log('');

process.exit(errors > 0 ? 1 : 0);
`;
