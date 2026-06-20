// ============================================================
//  goPage - 页面切换（带水波纹效果）
// ============================================================
function goPage(event, page) {
    const container = document.querySelector(".container");

    if (event?.currentTarget) {
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        event.currentTarget.appendChild(ripple);
    }

    if (container) {
        container.classList.add("fade-out");
        setTimeout(() => {
            window.location.href = page;
        }, 400);
    } else {
        window.location.href = page;
    }
}

// ============================================================
//  识别函数 - 直接调用豆包视觉模型（不经过后端）
//  界面显示仍为“AI 识别”，无“豆包”字样
// ============================================================
async function recognize() {
    const fileInput = document.getElementById("artifactFile") || document.querySelector('input[type="file"]');
    const resultBox = document.getElementById("result");
    const artifactPreview = document.getElementById("artifactPreview");
    const file = fileInput?.files?.[0];

    if (!file) {
        alert("请先上传图片");
        return;
    }

    if (artifactPreview) {
        artifactPreview.src = URL.createObjectURL(file);
    }

    if (resultBox) {
        resultBox.innerHTML = "识别中，请稍候...";
    }

    // ---------- 读取图片为 base64 ----------
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function() {
        const imageDataUrl = reader.result; // 例如 "data:image/jpeg;base64,..."

        // ---------- 豆包 API 配置 ----------
        const API_KEY = 'ark-2406d9b0-f5e8-45ee-94ac-fba08a375ec7-93ae1';
        const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';

        // 提示词要求返回的 JSON 字段与原来后端 /api/recognize 返回的格式完全一致
        const payload = {
            model: "doubao-seed-1-6-vision-250815",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: imageDataUrl
                        },
                        {
                            type: "text",
                            text: `请仔细分析这张图片，如果图片包含文化遗产、文物、古建筑、非遗作品等，请按以下JSON格式返回（不要添加额外文字）：
{
    "name": "名称",
    "era": "年代（如：唐代、明代等）",
    "category": "类别（如：古建筑、雕塑、书画、非遗等）",
    "material": "材质（如：木、石、铜、纸等）",
    "features": ["特征1", "特征2", ...],
    "museum_caption": "一段简短的介绍（50字以内）",
    "reason": "判断依据（为什么这么识别）"
}
如果图片不包含以上内容，请返回：
{
    "name": "非文化遗产",
    "era": "",
    "category": "",
    "material": "",
    "features": [],
    "museum_caption": "这张图片似乎与文化遗产无关，请上传相关图片。",
    "reason": ""
}`
                        }
                    ]
                }
            ],
            max_tokens: 500,
            temperature: 0.3
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `请求失败（状态码 ${response.status}）`);
            }

            // 提取豆包返回的文本内容
            const content = data?.choices?.[0]?.message?.content || '';
            // 从文本中提取 JSON 对象（可能包含 markdown 代码块）
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            let item;
            if (jsonMatch) {
                try {
                    item = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    item = { name: '解析错误', museum_caption: '识别结果解析失败，请重试。' };
                }
            } else {
                item = { name: '未知', museum_caption: content || '未能识别出有效信息。' };
            }

            // 补充默认字段，确保与原有后端返回格式完全一致
            const finalItem = {
                name: item.name || '未知文物',
                era: item.era || '未知',
                category: item.category || '未知',
                material: item.material || '未知',
                features: Array.isArray(item.features) ? item.features : [],
                museum_caption: item.museum_caption || '暂无简介',
                reason: item.reason || '暂无'
            };

            // ---------- 显示结果（与原来完全一致） ----------
            if (resultBox) {
                resultBox.innerHTML = `
                    <div class="result-box">
                        <h3>${finalItem.name}</h3>
                        <p><strong>年代：</strong>${finalItem.era}</p>
                        <p><strong>类别：</strong>${finalItem.category}</p>
                        <p><strong>材质：</strong>${finalItem.material}</p>
                        <p><strong>特征：</strong>${finalItem.features.length ? finalItem.features.join("、") : "暂无"}</p>
                        <p><strong>简介：</strong>${finalItem.museum_caption}</p>
                        <p><strong>判断依据：</strong>${finalItem.reason}</p>
                    </div>
                `;
            }

            // 调用原有的 playExplanation 函数（如果有）
            if (typeof playExplanation === 'function') {
                playExplanation(finalItem.name);
            }

        } catch (err) {
            if (resultBox) {
                resultBox.innerHTML = `<span style="color:#ff8080;">识别失败：${err.message}</span>`;
            }
            console.error('豆包识别错误:', err);
        }
    };

    reader.onerror = function() {
        alert("读取图片失败，请重新选择");
    };
}

// ============================================================
//  以下函数均保持原样，未做任何修改
// ============================================================

async function generateExplain() {
    const text = document.getElementById("text")?.value?.trim();
    const output = document.getElementById("output");

    if (!text) {
        alert("请输入文物名称或描述");
        return;
    }

    if (output) {
        output.innerText = "讲解生成中，请稍候...";
    }

    try {
        const res = await fetch("/api/explain", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || "讲解生成失败");
        }

        if (output) {
            output.innerText = data.text || "";
        }
    } catch (err) {
        if (output) {
            output.innerText = `讲解失败：${err.message}`;
        }
    }
}

function speak() {
    const output = document.getElementById("output");
    if (!output || !output.innerText.trim()) {
        alert("请先生成讲解内容");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(output.innerText);
    utterance.lang = "zh-CN";
    speechSynthesis.speak(utterance);
}

async function generateImg() {
    const input = document.querySelector('input[type="text"]');
    const img = document.getElementById("img");
    const prompt = input?.value?.trim();

    if (!prompt) {
        alert("请输入生成提示词");
        return;
    }

    if (img) {
        img.alt = "生成中...";
    }

    try {
        const res = await fetch("/api/generate-image", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || "图片生成失败");
        }

        if (img) {
            img.src = data.imageUrl;
        }
    } catch (err) {
        alert(`生成失败：${err.message}`);
    }
}

async function repairImage() {
    const fileInput = document.getElementById("repairFile");
    const preview = document.getElementById("repairPreview");
    const output = document.getElementById("repairOutput");
    const status = document.getElementById("repairStatus");
    const note = document.getElementById("repairNote");
    const file = fileInput?.files?.[0];

    if (!file) {
        alert("请先上传图片");
        return;
    }

    preview.src = URL.createObjectURL(file);
    output.src = "";
    note.innerText = "";
    status.innerText = "正在进行原图编辑修复，请稍候...";

    const formData = new FormData();
    formData.append("image", file);

    try {
        const res = await fetch("/api/repair", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || "修复失败");
        }

        output.src = data.imageUrl;
        note.innerText = data.note || "修复完成";
        status.innerText = "修复完成";
    } catch (err) {
        status.innerText = "";
        note.innerText = `修复失败：${err.message}`;
    }
}

function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl || typeof AMap === "undefined") return;

    var map = new AMap.Map('map', {
        zoom: 7,
        center: [114.5, 38.0]
    });

    const spots = [
        {name:"承德避暑山庄", pos:[117.93,40.97]},
        {name:"金山岭长城", pos:[117.24,40.68]},
        {name:"娲皇宫", pos:[113.68,36.57]}
    ];

    spots.forEach(s => {
        new AMap.Marker({
            position: s.pos,
            map: map,
            title: s.name
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initMap();
});

function goHome() {
    window.location.href = "/";
}

async function playExplanation(resultText) {
    const explainDiv = document.getElementById("explain-output");

    if (!resultText) return;

    if (explainDiv) explainDiv.innerText = "正在生成文物简介，请稍候...";

    try {
        const res = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: resultText,
                maxLength: 100,
                minLength: 50
            })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || "生成简介失败");
        }

        const explanation = data.text || `这是识别出的文物：${resultText}，但暂未生成详细简介。`;

        if (explainDiv) explainDiv.innerText = explanation;

        const utterance = new SpeechSynthesisUtterance(explanation);
        utterance.lang = "zh-CN";
        speechSynthesis.speak(utterance);

    } catch (err) {
        if (explainDiv) explainDiv.innerText = `生成简介失败：${err.message}`;
        console.error("生成简介失败", err);
    }
}