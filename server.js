require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ================================================================
//  TOOL 1 — AI Media Detector (Gemini)
//  Detects AI-generated images and videos
// ================================================================
app.post('/api/detect-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;

    const body = {
      contents: [{
        parts: [
          {
            text: `You are an AI-generated media detection expert. Analyze this media file carefully for signs of AI generation.

Look for:
- Unnatural textures, lighting, or shadows
- Artifacts typical of diffusion models or GANs
- Inconsistent details (hands, text, reflections, backgrounds)
- Too-perfect symmetry or smoothness
- Unusual patterns in noise or compression

Respond EXACTLY in this format:
VERDICT: [AI-GENERATED or NATURAL]
CONFIDENCE: [X]%
REASON: [2-3 sentence explanation of the specific indicators you found]`
          },
          { inline_data: { mime_type: mime, data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const isAI = text.toUpperCase().includes('AI-GENERATED');
    const confMatch = text.match(/(\d+)%/);
    const confidence = confMatch ? parseInt(confMatch[1]) : 50;
    const reason = text.includes('REASON:') ? text.split('REASON:').pop().trim() : text;

    res.json({ is_ai: isAI, confidence, reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
//  TOOL 2 — Consistency Checker (Groq / Llama 4 Scout Vision)
//  Checks if an image matches its caption/context
// ================================================================
app.post('/api/check-consistency', async (req, res) => {
  try {
    const { image, mime, caption, context } = req.body;
    if (!image || !caption) return res.status(400).json({ error: 'Image and caption are required' });

    const prompt = `You are an expert image-context consistency analyzer specializing in misinformation detection.

Analyze this image against the provided caption and determine if the image is being used in a truthful, accurate context or if it's misleading.

Caption: "${caption}"
${context ? `Additional context/narrative: "${context}"` : ''}

Analyze across these 5 dimensions:
1. **Visual-textual alignment** — Does the image depict what the caption claims?
2. **Temporal consistency** — Any anachronisms, date mismatches, or timeline issues?
3. **Geographic/cultural consistency** — Do visual cues (signs, architecture, clothing, landscape) match the claimed location/event?
4. **Emotional manipulation** — Is the image used to evoke emotions unrelated to the actual content?
5. **Reuse detection** — Does this appear to be a photo recycled from a different event or context?

You MUST respond in this exact JSON format (no markdown, no extra text):
{
  "confidence_score": <number 0-100>,
  "verdict": "<one of: Consistent | Likely Consistent | Uncertain | Likely Misleading | Misleading>",
  "summary": "<2-3 sentence explanation>",
  "findings": [
    { "type": "<alignment|temporal|geographic|emotional|reuse>", "detail": "<specific finding>" }
  ]
}`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.15,
        max_tokens: 1024
      })
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
//  TOOL 3 — TruthLens Text Detector (Groq / LLaMA 3.3 70B)
//  Detects AI-generated, human-written, or manipulated text
// ================================================================
const TRUTHLENS_PROMPT = `You are TruthLens — a forensic text authenticity engine. Your job is to determine if a given text was written by a human, generated by AI, or is a human text that has been manipulated/paraphrased by AI.

Analyze across 4 dimensions:

1. LINGUISTIC FINGERPRINTING
- Sentence rhythm variation (AI tends toward uniform length)
- Transition patterns (AI overuses "Furthermore", "Moreover", "In conclusion")
- Grammar imperfections (humans make natural errors; AI is too clean)
- Contraction usage (humans contract; AI often doesn't)
- Vocabulary diversity and word choice naturalness

2. SEMANTIC & FACTUAL CONSISTENCY
- Internal contradictions or vague assertions
- Hedging language ("It is important to note that...")
- Emotional authenticity vs. performative empathy
- Specificity of claims and examples

3. STRUCTURAL ANOMALY DETECTION
- Tone shifts within the text
- AI paraphrasing artifacts (unnatural synonyms, awkward restructuring)
- Missing narrative arc or personal voice
- List-heavy or overly organized structure

4. TRUST & MANIPULATION RISK
- Persuasion tactics or loaded language
- Fear-mongering or urgency signals
- Attribution gaps (claims without sources)
- Clickbait patterns

You MUST respond in this exact JSON format:
{
  "label": "AI" | "Human" | "Manipulated",
  "verdict": "Authentic" | "Suspicious" | "Likely AI" | "Likely Manipulated",
  "confidence": <integer 0-100>,
  "risk_level": "Low" | "Medium" | "High",
  "reasoning": "<3-5 sentences citing specific patterns you detected>",
  "signals": {
    "ai_indicators": ["<specific signal found>"],
    "human_indicators": ["<specific signal found>"],
    "manipulation_indicators": ["<specific signal found>"]
  },
  "suspicious_segments": ["<verbatim short excerpt that triggered detection>"]
}`;

app.post('/api/classify', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 20) return res.status(400).json({ error: 'Text must be at least 20 characters' });

    const inputText = text.length > 8000 ? text.substring(0, 8000) : text;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: TRUTHLENS_PROMPT },
          { role: 'user', content: `Analyze the following text and determine its authenticity:\n\n---\n${inputText}\n---` }
        ],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: 'json_object' }
      })
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const result = JSON.parse(content);

    // Normalize
    const validLabels = ['AI', 'Human', 'Manipulated'];
    if (!validLabels.includes(result.label)) result.label = 'AI';
    result.confidence = Math.max(0, Math.min(100, parseInt(result.confidence) || 50));
    const validRisk = ['Low', 'Medium', 'High'];
    if (!validRisk.includes(result.risk_level)) result.risk_level = 'Medium';

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
//  TOOL 4 — Melle5er Fact-Checker (placeholder — backend added later)
// ================================================================
app.post('/api/fact-check', async (req, res) => {
  const { claim } = req.body;
  if (!claim) return res.status(400).json({ error: 'No claim provided' });

  // Placeholder response — will be wired to OpenClaw/Claude agent
  res.json({
    status: 'demo',
    message: 'Agent backend will be connected — use WhatsApp demo for live fact-checking',
    claim
  });
});

// ================================================================
//  Health check
// ================================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tools: ['media-detector', 'consistency-checker', 'truthlens', 'melle5er'] });
});

// ================================================================
//  Start
// ================================================================
app.listen(PORT, () => {
  console.log(`\n  ⚡ ZvenDenLabs Verification Suite`);
  console.log(`  → http://localhost:${PORT}\n`);
});
