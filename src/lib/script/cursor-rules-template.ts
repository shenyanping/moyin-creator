/**
 * Cursor Rules 模板：写入用户项目目录的 .cursor/rules/moyin-project.mdc
 * 让 Cursor 理解魔音项目的数据格式和工作流
 */
export const CURSOR_RULES_CONTENT = `---
description: 魔音漫创项目数据规则 - 定义角色、场景、剧集、分镜的 JSON 格式
globs: ["**/*.json"]
---

# 魔音漫创项目规则

本目录是一个「魔音漫创」剧本项目。你需要按照下面的规则生成和编辑 JSON 数据文件。

## 目录结构

\`\`\`
项目根目录/
├── project.json           # 项目元数据（必须）
├── characters/            # 角色文件（每个角色一个 JSON）
│   ├── char_001.json
│   └── char_002.json
├── scenes/                # 场景文件（每个场景一个 JSON）
│   ├── scene_001.json
│   └── scene_002.json
├── episodes/              # 剧集文件（每集一个 JSON）
│   └── ep_001.json
├── shots/                 # 分镜文件（每个分镜一个 JSON）
│   ├── shot_001.json
│   └── shot_002.json
├── media/                 # 生成的媒体文件（由魔音自动管理）
│   ├── images/
│   └── videos/
├── script.md              # 各集剧本文本（由魔音导出，只读参考）
├── raw-input.md           # 用户最初输入的完整剧本原文（只读参考）
└── metadata.md            # AI 生成的项目元数据摘要（只读参考）
\`\`\`

**重要提示：**
- \`script.md\`、\`raw-input.md\`、\`metadata.md\` 是参考文件，包含完整的故事背景、人物小传、世界观等信息。
  在编辑角色、场景、分镜时，**务必先阅读这些文件**来理解项目的整体设定和风格。
- 只有 \`project.json\`、\`characters/\`、\`scenes/\`、\`episodes/\`、\`shots/\` 中的 JSON 文件会被魔音同步。
  修改 .md 文件不会影响魔音中的数据。

## ID 命名规则

- 角色 ID: \`char_001\`, \`char_002\`, ...（三位数字，递增）
- 场景 ID: \`scene_001\`, \`scene_002\`, ...
- 剧集 ID: \`ep_001\`, \`ep_002\`, ...
- 分镜 ID: \`shot_001\`, \`shot_002\`, ...（全局递增，不按集重置）

## project.json 格式

\`\`\`json
{
  "name": "剧名",
  "title": "剧名（可与 name 相同）",
  "genre": "类型（如：玄幻、都市、古装）",
  "era": "时代背景（如：现代、唐朝、末日）",
  "language": "中文",
  "outline": "故事大纲（200-500字）",
  "characterBios": "主要人物简介",
  "worldSetting": "世界观设定",
  "themes": ["主题1", "主题2"],
  "promptLanguage": "zh+en",
  "totalEpisodes": 1,
  "styleId": "cinematic",
  "targetDuration": "5min"
}
\`\`\`

## characters/char_XXX.json 格式

\`\`\`json
{
  "id": "char_001",
  "name": "角色名",
  "gender": "男/女",
  "age": "年龄描述（如：25岁 / 少年）",
  "personality": "性格特点",
  "role": "身份/背景",
  "traits": "核心特质",
  "skills": "技能/能力",
  "keyActions": "关键行为/事迹",
  "appearance": "外貌描述（文字）",
  "relationships": "人物关系",
  "tags": ["protagonist"],
  "notes": "角色备注",
  "visualPromptEn": "English visual prompt for AI image generation",
  "visualPromptZh": "中文视觉提示词（用于AI图像生成）"
}
\`\`\`

tags 必须从以下值中选择：
- \`"protagonist"\` — 主角
- \`"supporting"\` — 重要配角
- \`"minor"\` — 次要配角
- \`"extra"\` — 群演

## scenes/scene_XXX.json 格式

\`\`\`json
{
  "id": "scene_001",
  "name": "场景名称",
  "location": "地点描述",
  "time": "day",
  "atmosphere": "氛围描述",
  "visualPrompt": "视觉提示词",
  "tags": ["环境标签"],
  "notes": "场景备注",
  "architectureStyle": "建筑风格",
  "lightingDesign": "光影设计",
  "colorPalette": "色彩基调"
}
\`\`\`

time 可选值：\`day\`, \`night\`, \`dawn\`, \`dusk\`, \`noon\`, \`midnight\`

## episodes/ep_XXX.json 格式

\`\`\`json
{
  "id": "ep_001",
  "index": 1,
  "title": "第1集：集标题",
  "description": "本集描述",
  "sceneIds": ["scene_001", "scene_002"],
  "rawScript": {
    "synopsis": "本集大纲",
    "keyEvents": ["事件1", "事件2"],
    "rawContent": "完整的本集剧本文本"
  }
}
\`\`\`

sceneIds 列出本集包含的所有场景 ID。rawScript 是可选的，包含原始剧本内容。

## shots/shot_XXX.json 格式

\`\`\`json
{
  "id": "shot_001",
  "index": 1,
  "episodeId": "ep_001",
  "sceneRefId": "scene_001",
  "actionSummary": "动作描述（一句话概括画面内容）",
  "dialogue": "对白内容（无对白填空字符串）",
  "characterIds": ["char_001", "char_002"],
  "characterNames": ["角色名1", "角色名2"],
  "characterVariations": {},
  "shotSize": "MS",
  "duration": 5,
  "cameraMovement": "static"
}
\`\`\`

### 关键约束

- \`characterIds\` 中的每个 ID **必须**在 characters/ 目录中存在对应文件
- \`characterNames\` 与 \`characterIds\` **必须一一对应**
- \`sceneRefId\` **必须**在 scenes/ 目录中存在对应文件
- \`episodeId\` **必须**在 episodes/ 目录中存在对应文件

### shotSize 可选值

\`WS\`(远景), \`FS\`(全景), \`MLS\`(中远景), \`MS\`(中景), \`MCU\`(中近景), \`CU\`(近景), \`ECU\`(特写), \`OTS\`(过肩)

### cameraMovement 可选值

\`static\`, \`pan_left\`, \`pan_right\`, \`tilt_up\`, \`tilt_down\`, \`dolly_in\`, \`dolly_out\`, \`tracking\`, \`crane\`, \`handheld\`, \`zoom_in\`, \`zoom_out\`, \`orbit\`, \`drone_aerial\`

## 工作流

### 从剧本文本生成完整项目数据

当用户提供一段剧本文本时，按以下步骤生成：

1. **创建 project.json**：从剧本中提取标题、类型、时代、大纲
2. **提取角色**：识别所有出场角色，在 characters/ 下为每个角色创建文件，按重要程度设置 tags
3. **提取场景**：识别所有场景/地点，在 scenes/ 下为每个场景创建文件
4. **创建剧集**：在 episodes/ 下创建集文件，包含原始剧本和场景关联
5. **生成分镜**：将剧本拆分为分镜，在 shots/ 下为每个分镜创建文件，关联角色和场景

### 修改数据

- 修改角色：直接编辑 characters/ 下对应的 JSON 文件
- 修改场景：直接编辑 scenes/ 下对应的 JSON 文件
- 修改分镜：直接编辑 shots/ 下对应的 JSON 文件
- 新增角色：创建新的 char_XXX.json（注意 ID 不要与已有的重复）
- 删除角色：删除对应文件，并清理所有分镜中对该角色的引用

### 数据校验

**强烈建议：每次批量修改数据后，都运行一次校验脚本。**

\`\`\`bash
# 检查数据一致性（只报告，不修改）
node validate.js

# 自动修复可修复的问题（修正角色名/ID映射、移除无效引用）
node validate.js --fix
\`\`\`

校验脚本会检查以下内容：
1. 所有分镜的 characterIds 是否都指向存在的角色文件
2. 所有分镜的 sceneRefId 是否都指向存在的场景文件
3. 所有分镜的 episodeId 是否都指向存在的剧集文件
4. 所有剧集的 sceneIds 是否都指向存在的场景文件
5. characterNames 和 characterIds 长度是否一致且名字匹配
6. shotSize 是否为合法值
7. ID 是否符合命名规范
8. 未被引用的孤立角色和场景

### 注意事项

- **每次新增或删除角色后**，务必检查所有分镜的 characterIds 是否需要更新
- **每次修改角色名字后**，运行 \`node validate.js --fix\` 自动同步 characterNames
- **批量操作完成后**，运行 \`node validate.js\` 确认无错误，再让魔音同步
`;
