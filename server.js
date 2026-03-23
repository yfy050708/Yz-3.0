import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = process.cwd();
const uploadDir = path.join(rootDir, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(rootDir));

function ensureApiKey(res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      success: false,
      message: '服务端未配置 OPENAI_API_KEY，请先在 .env 中配置。',
    });
    return false;
  }
  return true;
}

function getBaseUrl() {
  const raw = (process.env.OPENAI_BASE_URL || 'https://sg.uiuiapi.com/v1').trim();
  return raw.replace(/\/$/, '');
}

function toDataUrl(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('删除临时文件失败:', err?.message || err);
  }
}

async function callOpenAICompatible(pathname, payload) {
  const response = await fetch(`${getBaseUrl()}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data = {};
  try {
    data = JSON.parse(rawText);
  } catch {}

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `请求失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function tryParseJsonFromText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('模型没有返回文本内容');
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`返回结果不是有效 JSON：${text.slice(0, 300)}`);
    }
    return JSON.parse(match[0]);
  }
}

function normalizeRecognitionResult(raw) {
  return {
    name: raw?.name || '未知文物',
    era: raw?.era || '未知',
    category: raw?.category || '未知',
    material: raw?.material || '未知',
    features: Array.isArray(raw?.features) ? raw.features.slice(0, 6) : [],
    museum_caption: raw?.museum_caption || '暂无说明',
    confidence:
      typeof raw?.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0.3,
    reason: raw?.reason || '模型未提供明确判断依据。',
    tags: Array.isArray(raw?.tags) ? raw.tags.slice(0, 8) : [],
  };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI 服务运行中',
    baseUrl: getBaseUrl(),
    models: {
      vision: (process.env.VISION_MODEL || '').trim() || 'gpt-4.1-mini',
      text: (process.env.TEXT_MODEL || '').trim() || 'gpt-4.1-mini',
      image: (process.env.IMAGE_MODEL || '').trim() || 'gpt-image-1',
    },
  });
});

app.post('/api/recognize', upload.single('image'), async (req, res) => {
  if (!ensureApiKey(res)) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: '请上传图片文件。',
    });
  }

  try {
    const imageUrl = toDataUrl(file.path, file.mimetype);

    const prompt = `
你是一名严谨的中国文博识别助手。请根据图片内容识别图片中的文物或文博对象。
要求：
1. 只输出 JSON，不要输出任何额外说明。
2. 如果不确定，要明确写“推测”或“可能”。
3. confidence 取值范围 0 到 1。

请严格按下面结构返回：
{
  "name": "文物名称，无法确认则给最可能名称",
  "era": "年代/时期，无法确认写 未知",
  "category": "类别，如青铜器/瓷器/石刻/壁画/玉器",
  "material": "材质，无法确认写 未知",
  "features": ["2-4条核心视觉特征"],
  "museum_caption": "50-120字，适合前端展示的简洁介绍",
  "confidence": 0.0,
  "reason": "说明判断依据；若不确定要明确说可能性判断",
  "tags": ["关键词1", "关键词2", "关键词3"]
}
`.trim();

    const visionModel = (process.env.VISION_MODEL || '').trim() || 'gpt-4.1-mini';

    const response = await callOpenAICompatible('/chat/completions', {
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型没有返回识别内容');
    }

    const parsed = tryParseJsonFromText(content);
    const data = normalizeRecognitionResult(parsed);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('识别失败:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || '识别失败，请稍后重试。',
    });
  } finally {
    safeUnlink(file.path);
  }
});

app.post('/api/explain', async (req, res) => {
  if (!ensureApiKey(res)) return;

  const text = (req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({
      success: false,
      message: '请输入文物名称或说明文本。',
    });
  }

  try {
    const textModel = (process.env.TEXT_MODEL || '').trim() || 'gpt-4.1-mini';

    const response = await callOpenAICompatible('/chat/completions', {
      model: textModel,
      messages: [
        {
          role: 'system',
          content: '你是一名博物馆讲解助手，擅长用自然、易懂、可信的中文生成讲解词。',
        },
        {
          role: 'user',
          content: `请为“${text}”生成一段适合游客阅读的文物讲解。要求：1. 150到250字；2. 语言自然；3. 包含历史背景、工艺特点、文化价值；4. 不要使用小标题；5. 不要写成列表。`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const result = response?.choices?.[0]?.message?.content?.trim();
    if (!result) {
      throw new Error('模型没有返回讲解内容');
    }

    return res.json({
      success: true,
      text: result,
    });
  } catch (error) {
    console.error('讲解生成失败:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || '讲解生成失败。',
    });
  }
});

app.post('/api/generate-image', async (req, res) => {
  if (!ensureApiKey(res)) return;

  const prompt = (req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({
      success: false,
      message: '请输入生成提示词。',
    });
  }

  try {
    const imageModel = (process.env.IMAGE_MODEL || '').trim() || 'gpt-image-1';

    const response = await callOpenAICompatible('/images/generations', {
      model: imageModel,
      prompt: `请生成一张文创设计图片。主题：${prompt}。要求：保留中国传统文物美学元素，画面完整，适合做文创海报、纪念品图案或展示图，风格精致，细节清晰。`,
      size: '1024x1024',
    });

    const item = response?.data?.[0];
    const base64 = item?.b64_json;
    const directUrl = item?.url;

    if (base64) {
      return res.json({
        success: true,
        imageUrl: `data:image/png;base64,${base64}`,
      });
    }

    if (directUrl) {
      return res.json({
        success: true,
        imageUrl: directUrl,
      });
    }

    throw new Error('图片生成成功，但未返回可用图片数据');
  } catch (error) {
    console.error('文创生成失败:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || '图片生成失败。',
    });
  }
});

// 真正的原图编辑修复：只走 /images/edits，不降级重绘
app.post('/api/repair', upload.single('image'), async (req, res) => {
  if (!ensureApiKey(res)) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: '请上传待修复图片。',
    });
  }

  try {
    const prompt = `
请对这张文物图片做数字修复，要求：
1. 只能修复破损、裂纹、缺角、污渍、褪色和模糊；
2. 不要改变文物的种类、器形、纹饰布局、材质质感和年代风格；
3. 不要把旧文物修成崭新的现代工艺品；
4. 保留合理的历史痕迹，只做博物馆式数字修复；
5. 背景尽量保持简洁，不新增无关元素；
6. 输出应尽量接近原图，只在受损区域做自然补全。
`.trim();

    const repairModel = (process.env.IMAGE_MODEL || '').trim() || 'gpt-image-1';
    console.log('repair model =', repairModel);

    const fileBuffer = await fs.promises.readFile(file.path);
    const imageBlob = new Blob([fileBuffer], {
      type: file.mimetype || 'image/png',
    });

    const form = new FormData();
    form.append('model', repairModel);
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('image', imageBlob, file.originalname || 'artifact.png');

    const response = await fetch(`${getBaseUrl()}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    const rawText = await response.text();
    console.log('repair raw response =', rawText);

    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch {}

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        data?.message ||
        rawText ||
        `编辑接口失败：HTTP ${response.status}`
      );
    }

    const item = data?.data?.[0];
    const base64 = item?.b64_json;
    const directUrl = item?.url;

    if (base64) {
      return res.json({
        success: true,
        imageUrl: `data:image/png;base64,${base64}`,
        note: '已通过原图编辑接口完成修复。',
      });
    }

    if (directUrl) {
      return res.json({
        success: true,
        imageUrl: directUrl,
        note: '已通过原图编辑接口完成修复。',
      });
    }

    throw new Error('编辑接口成功，但未返回可用图片数据');
  } catch (error) {
    console.error('修复失败:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || '修复失败，请稍后重试。',
    });
  } finally {
    safeUnlink(file.path);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
  });
});

app.listen(port, () => {
  console.log(`Server running: http://localhost:${port}`);
});
