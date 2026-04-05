// ================================================================
//  ZvenDenLabs Verification Suite — Frontend Logic
// ================================================================

// --- State ---
let mediaFile = null;
let consistencyImage = null; // { base64, mime }

// --- Helpers ---
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 8000);
}

function hideError(id) {
  document.getElementById(id).classList.remove('show');
}

// ================================================================
//  TOOL 1 — AI Media Detector
// ================================================================

const mediaInput = document.getElementById('media-input');
const mediaDropzone = document.getElementById('media-dropzone');

mediaInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadMedia(e.target.files[0]);
});

mediaDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  mediaDropzone.classList.add('dragover');
});

mediaDropzone.addEventListener('dragleave', () => {
  mediaDropzone.classList.remove('dragover');
});

mediaDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  mediaDropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) loadMedia(e.dataTransfer.files[0]);
});

function loadMedia(file) {
  if (file.size > 25 * 1024 * 1024) {
    showError('media-error', 'الملف كبير برشا — الحد الأقصى 25MB');
    return;
  }
  mediaFile = file;
  document.getElementById('media-filename').textContent = file.name;
  document.getElementById('media-filesize').textContent = formatBytes(file.size);
  document.getElementById('media-btn').disabled = false;
  document.getElementById('media-result').classList.remove('show');
  hideError('media-error');

  // Thumbnail
  const thumb = document.getElementById('media-thumb');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => { thumb.src = e.target.result; };
    reader.readAsDataURL(file);
  } else {
    thumb.src = '';
    thumb.alt = '🎬 Video';
  }

  mediaDropzone.style.display = 'none';
  document.getElementById('media-preview').classList.add('show');
}

function removeMedia() {
  mediaFile = null;
  mediaInput.value = '';
  document.getElementById('media-preview').classList.remove('show');
  mediaDropzone.style.display = '';
  document.getElementById('media-btn').disabled = true;
  document.getElementById('media-result').classList.remove('show');
}

async function detectMedia() {
  if (!mediaFile) return;
  setLoading('media-btn', true);
  hideError('media-error');
  document.getElementById('media-result').classList.remove('show');

  try {
    const formData = new FormData();
    formData.append('file', mediaFile);

    const resp = await fetch('/api/detect-media', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.error) throw new Error(data.error);

    // Render result
    const verdict = document.getElementById('media-verdict');
    if (data.is_ai) {
      verdict.textContent = '🚨 مصنوع بالذكاء الاصطناعي';
      verdict.className = 'verdict-badge danger';
    } else {
      verdict.textContent = '✅ طبيعي / حقيقي';
      verdict.className = 'verdict-badge safe';
    }

    const fill = document.getElementById('media-conf-fill');
    fill.style.width = data.confidence + '%';
    fill.className = 'confidence-fill ' + (data.is_ai ? 'danger' : 'safe');
    document.getElementById('media-conf-label').textContent = data.confidence + '%';
    document.getElementById('media-reason').textContent = data.reason;
    document.getElementById('media-result').classList.add('show');
  } catch (err) {
    showError('media-error', 'خطأ: ' + err.message);
  } finally {
    setLoading('media-btn', false);
  }
}

// ================================================================
//  TOOL 2 — Consistency Checker
// ================================================================

const consistInput = document.getElementById('consist-input');
const consistDropzone = document.getElementById('consist-dropzone');

consistInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadConsistency(e.target.files[0]);
});

consistDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  consistDropzone.classList.add('dragover');
});

consistDropzone.addEventListener('dragleave', () => {
  consistDropzone.classList.remove('dragover');
});

consistDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  consistDropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) loadConsistency(e.dataTransfer.files[0]);
});

function loadConsistency(file) {
  if (!file.type.startsWith('image/')) {
    showError('consist-error', 'لازم صورة فقط');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showError('consist-error', 'الصورة كبيرة برشا — الحد الأقصى 20MB');
    return;
  }

  document.getElementById('consist-filename').textContent = file.name;
  document.getElementById('consist-filesize').textContent = formatBytes(file.size);
  document.getElementById('consist-result').classList.remove('show');
  hideError('consist-error');

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mime = file.type;
    consistencyImage = { base64, mime };
    document.getElementById('consist-thumb').src = dataUrl;
  };
  reader.readAsDataURL(file);

  consistDropzone.style.display = 'none';
  document.getElementById('consist-preview').classList.add('show');
  updateConsistBtn();
}

function removeConsistency() {
  consistencyImage = null;
  consistInput.value = '';
  document.getElementById('consist-preview').classList.remove('show');
  consistDropzone.style.display = '';
  document.getElementById('consist-btn').disabled = true;
  document.getElementById('consist-result').classList.remove('show');
}

function updateConsistBtn() {
  const caption = document.getElementById('consist-caption').value.trim();
  document.getElementById('consist-btn').disabled = !(consistencyImage && caption.length > 0);
}

document.getElementById('consist-caption').addEventListener('input', updateConsistBtn);

async function checkConsistency() {
  if (!consistencyImage) return;
  const caption = document.getElementById('consist-caption').value.trim();
  if (!caption) return;

  setLoading('consist-btn', true);
  hideError('consist-error');
  document.getElementById('consist-result').classList.remove('show');

  try {
    const resp = await fetch('/api/check-consistency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: consistencyImage.base64,
        mime: consistencyImage.mime,
        caption,
        context: document.getElementById('consist-context').value.trim() || null
      })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Verdict
    const verdict = document.getElementById('consist-verdict');
    const v = data.verdict || 'Uncertain';
    const verdictMap = {
      'Consistent': { text: '✅ متطابق', cls: 'safe' },
      'Likely Consistent': { text: '✅ غالبا متطابق', cls: 'safe' },
      'Uncertain': { text: '❓ غير واضح', cls: 'warning' },
      'Likely Misleading': { text: '⚠️ غالبا مضلّل', cls: 'danger' },
      'Misleading': { text: '🚨 مضلّل', cls: 'danger' }
    };
    const vm = verdictMap[v] || verdictMap['Uncertain'];
    verdict.textContent = vm.text;
    verdict.className = 'verdict-badge ' + vm.cls;

    const score = data.confidence_score || 50;
    const fill = document.getElementById('consist-conf-fill');
    fill.style.width = score + '%';
    fill.className = 'confidence-fill ' + (score >= 60 ? 'safe' : score >= 40 ? '' : 'danger');
    document.getElementById('consist-conf-label').textContent = score + '%';
    document.getElementById('consist-summary').textContent = data.summary || '';

    // Findings
    const findingsEl = document.getElementById('consist-findings');
    findingsEl.innerHTML = '';
    if (data.findings && data.findings.length) {
      const typeIcons = { alignment: '🔗', temporal: '⏰', geographic: '🌍', emotional: '💢', reuse: '♻️' };
      data.findings.forEach(f => {
        const div = document.createElement('div');
        div.className = 'finding-item';
        div.innerHTML = `
          <div class="finding-type">${typeIcons[f.type] || '📌'} ${esc(f.type)}</div>
          <div class="finding-detail">${esc(f.detail)}</div>
        `;
        findingsEl.appendChild(div);
      });
    }

    document.getElementById('consist-result').classList.add('show');
  } catch (err) {
    showError('consist-error', 'خطأ: ' + err.message);
  } finally {
    setLoading('consist-btn', false);
  }
}

// ================================================================
//  TOOL 3 — TruthLens Text Detector
// ================================================================

const textInput = document.getElementById('text-input');

textInput.addEventListener('input', () => {
  const val = textInput.value;
  document.getElementById('text-charcount').textContent = val.length + ' حرف';
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  document.getElementById('text-wordcount').textContent = words + ' كلمة';
  document.getElementById('text-btn').disabled = val.length < 20;
});

async function classifyText() {
  const text = textInput.value.trim();
  if (text.length < 20) return;

  setLoading('text-btn', true);
  hideError('text-error');
  document.getElementById('text-result').classList.remove('show');

  try {
    const resp = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Verdict
    const verdict = document.getElementById('text-verdict');
    const labelMap = {
      'Human': { text: '✅ كتبه إنسان', cls: 'safe' },
      'AI': { text: '🤖 مصنوع بالذكاء الاصطناعي', cls: 'ai' },
      'Manipulated': { text: '✏️ نص متلاعب فيه', cls: 'manipulated' }
    };
    const lm = labelMap[data.label] || labelMap['AI'];
    verdict.textContent = lm.text;
    verdict.className = 'verdict-badge ' + lm.cls;

    // Risk
    const riskEl = document.getElementById('text-risk');
    const riskMap = {
      'Low': { text: 'خطر ضعيف', cls: 'low' },
      'Medium': { text: 'خطر متوسط', cls: 'medium' },
      'High': { text: 'خطر عالي', cls: 'high' }
    };
    const rm = riskMap[data.risk_level] || riskMap['Medium'];
    riskEl.textContent = rm.text;
    riskEl.className = 'risk-badge ' + rm.cls;

    // Confidence
    const conf = data.confidence || 50;
    const fill = document.getElementById('text-conf-fill');
    fill.style.width = conf + '%';
    fill.className = 'confidence-fill' + (data.label === 'Human' ? ' safe' : data.label === 'AI' ? ' danger' : '');
    document.getElementById('text-conf-label').textContent = conf + '%';

    // Reasoning
    document.getElementById('text-reasoning').textContent = data.reasoning || '';

    // Signals
    const signalsEl = document.getElementById('text-signals');
    signalsEl.innerHTML = '';
    if (data.signals) {
      const s = data.signals;
      let html = '<div class="signals-title">الإشارات المكتشفة</div><div class="signals-grid">';

      html += '<div class="signal-col ai"><h4>AI Indicators</h4>';
      (s.ai_indicators || []).forEach(sig => { html += `<div class="signal-pill">${esc(sig)}</div>`; });
      if (!(s.ai_indicators || []).length) html += '<div class="signal-pill" style="opacity:0.4">—</div>';
      html += '</div>';

      html += '<div class="signal-col human"><h4>Human Indicators</h4>';
      (s.human_indicators || []).forEach(sig => { html += `<div class="signal-pill">${esc(sig)}</div>`; });
      if (!(s.human_indicators || []).length) html += '<div class="signal-pill" style="opacity:0.4">—</div>';
      html += '</div>';

      html += '<div class="signal-col manip"><h4>Manipulation</h4>';
      (s.manipulation_indicators || []).forEach(sig => { html += `<div class="signal-pill">${esc(sig)}</div>`; });
      if (!(s.manipulation_indicators || []).length) html += '<div class="signal-pill" style="opacity:0.4">—</div>';
      html += '</div>';

      html += '</div>';
      signalsEl.innerHTML = html;
    }

    // Suspicious segments
    const segEl = document.getElementById('text-segments');
    segEl.innerHTML = '';
    if (data.suspicious_segments && data.suspicious_segments.length) {
      let html = '<div class="signals-title" style="margin-top:14px;">مقاطع مشبوهة</div>';
      data.suspicious_segments.forEach(seg => {
        html += `<div class="segment-item">"${esc(seg)}"</div>`;
      });
      segEl.innerHTML = html;
    }

    document.getElementById('text-result').classList.add('show');
  } catch (err) {
    showError('text-error', 'خطأ: ' + err.message);
  } finally {
    setLoading('text-btn', false);
  }
}

// ================================================================
//  TOOL 4 — Melle5er Fact-Checker (Chat UI)
// ================================================================

async function factCheck() {
  const input = document.getElementById('chat-input');
  const claim = input.value.trim();
  if (!claim) return;

  const container = document.getElementById('chat-container');
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.remove();

  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = claim;
  container.appendChild(userMsg);
  input.value = '';

  // Add thinking indicator
  const thinking = document.createElement('div');
  thinking.className = 'chat-msg thinking';
  thinking.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div> مثبّت يبحث...';
  container.appendChild(thinking);
  container.scrollTop = container.scrollHeight;

  // Disable input
  input.disabled = true;
  document.getElementById('chat-send').disabled = true;

  try {
    const resp = await fetch('/api/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim })
    });

    const data = await resp.json();
    thinking.remove();

    // Agent response
    const agentMsg = document.createElement('div');
    agentMsg.className = 'chat-msg agent';

    if (data.status === 'demo') {
      agentMsg.innerHTML = `
        <div style="margin-bottom:8px;">🔍 <strong>مثبّت</strong></div>
        <div style="margin-bottom:10px; color: var(--text2);">
          الـ backend ماهوش مربوط توّا — في العرض الحي نستعملو WhatsApp.
        </div>
        <div style="padding:10px 14px; background:rgba(34,211,238,0.06); border-radius:8px; border:1px solid rgba(34,211,238,0.15); font-size:0.82rem;">
          💡 في العرض الحي، مثبّت يبحث في الانترنت، يقارن المصادر، ويعطيك حكم مع مصداقية كل مصدر.
        </div>
      `;
    } else {
      agentMsg.textContent = data.result || JSON.stringify(data);
    }

    container.appendChild(agentMsg);
  } catch (err) {
    thinking.remove();
    const errMsg = document.createElement('div');
    errMsg.className = 'chat-msg agent';
    errMsg.textContent = 'خطأ في الاتصال: ' + err.message;
    container.appendChild(errMsg);
  } finally {
    input.disabled = false;
    document.getElementById('chat-send').disabled = false;
    input.focus();
    container.scrollTop = container.scrollHeight;
  }
}
