// ------------------- 页面跳转带水波效果 -------------------
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

// ------------------- AI 文物识别 -------------------
async function recognize() {
    const fileInput = document.getElementById("artifactFile") || document.querySelector('input[type="file"]');
    const resultBox = document.getElementById("result");
    const artifactPreview = document.getElementById("artifactPreview");
    const file = fileInput?.files?.[0];

    if (!file) {
        alert("请先上传图片");
        return;
    }

    // 显示上传的图片
    if (artifactPreview) {
        artifactPreview.src = URL.createObjectURL(file);
    }

    if (resultBox) {
        resultBox.innerHTML = "识别中，请稍候...";
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
        const res = await fetch("/api/recognize", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || "识别失败");
        }

        const item = data.data;

        if (resultBox) {
            resultBox.innerHTML = `
                <div class="result-box">
                    <h3>${item.name || "未知文物"}</h3>
                    <p><strong>年代：</strong>${item.era || "未知"}</p>
                    <p><strong>类别：</strong>${item.category || "未知"}</p>
                    <p><strong>材质：</strong>${item.material || "未知"}</p>
                    <p><strong>特征：</strong>${Array.isArray(item.features) ? item.features.join("、") : "暂无"}</p>
                    <p><strong>简介：</strong>${item.museum_caption || "暂无"}</p>
                    <p><strong>判断依据：</strong>${item.reason || "暂无"}</p>
                </div>
            `;

            // 调用智能讲解（AI接口生成50-100字简介）
            playExplanation(item.name || "未知文物");
        }
    } catch (err) {
        if (resultBox) {
            resultBox.innerHTML = `<span style="color:#ff8080;">识别失败：${err.message}</span>`;
        }
    }
}

// ------------------- AI 文物讲解生成 -------------------
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

// ------------------- AI 语音播放 -------------------
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

// ------------------- AI 文创生成 -------------------
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

// ------------------- AI 修复图片 -------------------
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

// ------------------- 地图初始化 -------------------
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

// ------------------- 智能讲解函数（调用AI接口生成50-100字简介） -------------------
async function playExplanation(resultText) {
    const explainDiv = document.getElementById("explain-output");

    if (!resultText) return;

    // 显示加载提示
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
