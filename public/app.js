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
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mime = file.type;
    consistencyImage = { base64, mime };
    document.getElementById('consist-thumb').src = dataUrl;

    // Auto-extract text from image
    const captionInput = document.getElementById('consist-caption');
    captionInput.placeholder = 'يقرا النص من الصورة...';
    try {
      const resp = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mime })
      });
      const data = await resp.json();
      if (data.text && data.text.length > 0) {
        captionInput.value = data.text;
        updateConsistBtn();
      }
    } catch (err) {
      console.warn('Auto-extract failed:', err);
    }
    captionInput.placeholder = 'مثلا: فيضانات تونس 2026...';
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
      function getTypeLabel(type) {
        const t = (type || '').toLowerCase();
        if (t.includes('alignment') || t.includes('visual') || t.includes('textual')) return { icon: '🔗', label: 'تطابق الصورة والنص' };
        if (t.includes('temporal') || t.includes('time') || t.includes('date')) return { icon: '⏰', label: 'التسلسل الزمني' };
        if (t.includes('geo') || t.includes('cultural') || t.includes('location')) return { icon: '🌍', label: 'التطابق الجغرافي' };
        if (t.includes('emotion') || t.includes('manipul')) return { icon: '💢', label: 'التلاعب العاطفي' };
        if (t.includes('reuse') || t.includes('recycle') || t.includes('context')) return { icon: '♻️', label: 'إعادة استخدام الصورة' };
        return { icon: '📌', label: 'ملاحظة' };
      }
      data.findings.forEach(f => {
        const { icon, label } = getTypeLabel(f.type);
        const div = document.createElement('div');
        div.className = 'finding-item';
        div.innerHTML = `
          <div class="finding-type">${icon} ${label}</div>
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

let chatImage = null; // { base64, mime, name }

// Image paste handler (Ctrl+V)
document.addEventListener('paste', (e) => {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput || document.activeElement !== chatInput) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) loadChatImage(file);
      return;
    }
  }
});

// Image file input handler
function triggerChatImageUpload() {
  document.getElementById('chat-image-input').click();
}

function handleChatImageSelect(e) {
  if (e.target.files[0]) loadChatImage(e.target.files[0]);
}

function loadChatImage(file) {
  if (!file.type.startsWith('image/')) return;
  if (file.size > 20 * 1024 * 1024) {
    alert('الصورة كبيرة برشا — الحد الأقصى 20MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    chatImage = {
      base64: dataUrl.split(',')[1],
      mime: file.type,
      name: file.name || 'pasted-image'
    };
    // Show preview
    const preview = document.getElementById('chat-image-preview');
    preview.innerHTML = `
      <img src="${dataUrl}" style="max-height:60px; border-radius:8px; border:1px solid var(--border);" />
      <span style="font-size:0.75rem; color:var(--text-muted);">${esc(chatImage.name)}</span>
      <button onclick="removeChatImage()" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:1rem;">✕</button>
    `;
    preview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function removeChatImage() {
  chatImage = null;
  const input = document.getElementById('chat-image-input');
  if (input) input.value = '';
  const preview = document.getElementById('chat-image-preview');
  preview.innerHTML = '';
  preview.style.display = 'none';
}

// Format verdict text as rich HTML
function formatVerdict(text) {
  let html = esc(text);
  // Bold: *text*
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--cyan); text-decoration:none; border-bottom:1px solid rgba(34,211,238,0.3);">$1</a>');
  // Separator lines
  html = html.replace(/━+/g, '<hr style="border:none; border-top:1px solid var(--border); margin:8px 0;" />');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function factCheck() {
  const input = document.getElementById('chat-input');
  const claim = input.value.trim();
  if (!claim && !chatImage) return;

  const container = document.getElementById('chat-container');
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.remove();

  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  let userContent = '';
  if (chatImage) {
    userContent += `<img src="data:${chatImage.mime};base64,${chatImage.base64}" style="max-width:200px; max-height:150px; border-radius:8px; display:block; margin-bottom:6px;" />`;
  }
  if (claim) {
    userContent += esc(claim);
  }
  userMsg.innerHTML = userContent;
  container.appendChild(userMsg);
  input.value = '';

  // Build request body
  const body = {};
  if (claim) body.claim = claim;
  if (chatImage) {
    body.image = chatImage.base64;
    body.mime = chatImage.mime;
  }

  // Clear image after sending
  removeChatImage();

  // Add thinking indicator
  const thinking = document.createElement('div');
  thinking.className = 'chat-msg thinking';
  thinking.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div> يلا نتثبّتوا 🔍';
  container.appendChild(thinking);
  container.scrollTop = container.scrollHeight;

  // Disable input
  input.disabled = true;
  document.getElementById('chat-send').disabled = true;

  try {
    const resp = await fetch('/api/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    thinking.remove();

    if (data.error) throw new Error(data.error);

    // Agent response
    const agentMsg = document.createElement('div');
    agentMsg.className = 'chat-msg agent';

    let responseHtml = '';

    // Main verdict
    responseHtml += `<div class="verdict-content">${formatVerdict(data.result)}</div>`;

    // Sources count
    if (data.sources_found !== undefined) {
      responseHtml += `<div style="margin-top:8px; font-size:0.72rem; color:var(--text-muted);">📊 ${data.sources_found} مصدر تم تحليلهم</div>`;
    }

    agentMsg.innerHTML = responseHtml;
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
