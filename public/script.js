const API_BASE = '';

function goPage(event, page) {
  const container = document.querySelector('.container');
  if (!container) {
    window.location.href = page;
    return;
  }

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  event.currentTarget.appendChild(ripple);
  container.classList.add('fade-out');

  setTimeout(() => {
    window.location.href = page;
  }, 500);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function toggleHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', hidden);
}

function previewFile(inputId, imgId) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);
  const file = input?.files?.[0];

  if (!file || !img) return null;

  img.src = URL.createObjectURL(file);
  toggleHidden(imgId, false);
  return file;
}

async function recognize() {
  const file = previewFile('artifactFile', 'artifactPreview');
  if (!file) {
    alert('请先上传图片');
    return;
  }

  setText('recognitionStatus', '正在识别，请稍候...');
  setHtml('result', '');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`${API_BASE}/api/recognize`, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || '识别失败');
    }

    const d = json.data;
    setHtml(
      'result',
      `
      <h3>${d.name}</h3>
      <p><strong>年代：</strong>${d.era}</p>
      <p><strong>类别：</strong>${d.category}</p>
      <p><strong>材质：</strong>${d.material}</p>
      <p><strong>识别置信度：</strong>${Number(d.confidence * 100).toFixed(1)}%</p>
      <p><strong>核心特征：</strong>${(d.features || []).join('、')}</p>
      <p><strong>讲解摘要：</strong>${d.museum_caption}</p>
      <p><strong>判断依据：</strong>${d.reason}</p>
      <p><strong>标签：</strong>${(d.tags || []).join(' / ')}</p>
      `
    );
    setText('recognitionStatus', '识别完成');
  } catch (error) {
    setText('recognitionStatus', `识别失败：${error.message}`);
  }
}

async function repair() {
  const file = previewFile('file', 'output');
  if (!file) {
    alert('请先上传图片');
    return;
  }

  setText('repairStatus', '正在处理图片...');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`${API_BASE}/api/repair`, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || '处理失败');
    }

    const output = document.getElementById('output');
    output.src = json.imageUrl;
    toggleHidden('output', false);
    setText('repairStatus', json.note || '处理完成');
  } catch (error) {
    setText('repairStatus', `处理失败：${error.message}`);
  }
}

async function generateExplain() {
  const text = document.getElementById('text')?.value?.trim();
  if (!text) {
    alert('请输入文物名称或描述');
    return;
  }

  setText('explainStatus', '正在生成讲解...');
  setText('output', '');

  try {
    const res = await fetch(`${API_BASE}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || '生成失败');
    }

    setText('output', json.text);
    setText('explainStatus', '生成完成');
  } catch (error) {
    setText('explainStatus', `生成失败：${error.message}`);
  }
}

function speak() {
  const text = document.getElementById('output')?.textContent?.trim();
  if (!text) {
    alert('请先生成讲解内容');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  window.speechSynthesis.speak(utterance);
}

async function generateImg() {
  const prompt = document.getElementById('prompt')?.value?.trim();
  if (!prompt) {
    alert('请输入提示词');
    return;
  }

  setText('generateStatus', '正在生成图片...');

  try {
    const res = await fetch(`${API_BASE}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || '生成失败');
    }

    const img = document.getElementById('img');
    img.src = json.imageUrl;
    toggleHidden('img', false);
    setText('generateStatus', '生成完成');
  } catch (error) {
    setText('generateStatus', `生成失败：${error.message}`);
  }
}
