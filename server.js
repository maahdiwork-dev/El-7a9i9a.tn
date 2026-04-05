require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    const error = new Error(`Missing required environment variables: ${missing.join(', ')}`);
    error.statusCode = 500;
    throw error;
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ================================================================
//  TOOL 1 — AI Media Detector (Groq / Llama 4 Scout Vision)
//  Detects AI-generated images and videos
// ================================================================
app.post('/api/detect-media', upload.single('file'), async (req, res) => {
  try {
    requireEnv('GROQ_API_KEY');

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;

    if (!mime.startsWith('image/')) {
      return res.status(400).json({ error: 'Video detection requires Gemini API — please upload an image for now.' });
    }

    const prompt = `You are an AI-generated media detection expert. Analyze this image carefully for signs of AI generation.

Look for:
- Unnatural textures, lighting, or shadows
- Artifacts typical of diffusion models or GANs
- Inconsistent details (hands, text, reflections, backgrounds)
- Too-perfect symmetry or smoothness
- Unusual patterns in noise or compression

IMPORTANT: Write the REASON in Arabic script (العربية). Use simple Modern Standard Arabic. Do NOT use English. Do NOT use Latin characters.

Respond EXACTLY in this format:
VERDICT: [AI-GENERATED or NATURAL]
CONFIDENCE: [X]%
REASON: [2-3 sentences in Arabic script]`;

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
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.1,
        max_tokens: 1024
      })
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.choices?.[0]?.message?.content || '';
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
    requireEnv('GROQ_API_KEY');

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

You MUST respond in this exact JSON format (no markdown, no extra text).
IMPORTANT: Write "summary" and all "detail" fields in Arabic script (العربية). Use simple Modern Standard Arabic. Do NOT use English or Latin characters in those fields.

{
  "confidence_score": <number 0-100>,
  "verdict": "<one of: Consistent | Likely Consistent | Uncertain | Likely Misleading | Misleading>",
  "summary": "<2-3 sentence explanation in Arabic script>",
  "findings": [
    { "type": "<alignment|temporal|geographic|emotional|reuse>", "detail": "<specific finding in Arabic script>" }
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
    requireEnv('GROQ_API_KEY');

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
//  TOOL 4 — Melle5er Fact-Checker (مثبّت)
//  Tavily search → Firecrawl extraction → Kimi verdict
// ================================================================

const MELLE5ER_SYSTEM = `You are Melle5er (مثبّت) — a Tunisian Arabic fact-checker.

Personality: warm, direct, like a smart Tunisian friend at a café.

Language:
- Default: Tunisian Arabic (Derja)
- If user writes in French: respond in French
- Never switch to English unless the user writes English

You will receive a claim and search results from the web. Analyze the evidence and produce a verdict.

Rules:
- ✅ صحيح = 2+ credible sources confirm the claim
- ❌ خاطئ = credible source directly contradicts, nothing supports
- ❓ ما نجمتش نتأكد = not enough info either way
- Never give ✅ without at least one real URL source
- If nothing found: say "ما لقيت حتى حاجة تأكّد هالكلام"
- Don't make up sources. Only cite URLs from the search results provided.
- Don't lecture about media literacy. Just answer.

Source credibility ratings:
- عالية (HIGH): Reuters, AP, TAP, BBC, Al Jazeera, France 24, Mosaique FM, Shems FM, KUNA
- متوسطة (MEDIUM): established independent media, known regional outlets
- ضعيفة (LOW): blogs, social media, unverified sites, tabloids, Facebook pages

When no sources confirm a claim:
- Reason about ABSENCE of evidence: if this were true, which major outlets SHOULD have covered it? (e.g. "لو كان الخبر صحيح، كان لازم يكون عند KUNA و Reuters")
- Assess the credibility of the original source (a Facebook page is NOT the same as an official news agency)
- Give a clear recommendation about whether to trust the claim

If an image description is provided, use it as part of the claim context. Identify what the image shows, what source published it, and what specific claim is being made.

Analysis should be 3-5 lines: what you found, what's missing, what SHOULD exist if true, and your assessment.

You MUST use this exact output format:

🔍 *[topic — one line summary of the claim]*
━━━━━━━━━━━━━━━
الحكم: [✅ صحيح / ❌ خاطئ / ❓ ما نجمتش نتأكد]
الثقة: [عالية / متوسطة / ضعيفة]
━━━━━━━━━━━━━━━
📋 *التحليل:*
[3-5 lines — what was found, what's missing, credibility assessment of the source, recommendation]

🔗 *المصادر:*
• [Source name](URL) — مصداقية [عالية/متوسطة/ضعيفة]
• [Source name](URL) — مصداقية [عالية/متوسطة/ضعيفة]`;

// Describe image using Groq Vision (same model as Tool 1/2)
async function describeImage(base64, mime) {
  requireEnv('GROQ_API_KEY');

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
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: 'You are a fact-checker. Extract the CLAIM or NEWS CONTENT from this image. Focus on:\n1. What is the factual claim being made? (who, what, when, where)\n2. Any text, headlines, or captions visible — transcribe them exactly\n3. What source/outlet published this? (newspaper name, social media page, etc.)\n\nDo NOT describe colors, layout, or visual design. Focus ONLY on the factual content and claims.\nWrite in the same language as the text in the image. Be concise.' }
        ]
      }],
      temperature: 0.1,
      max_tokens: 512
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error('Image description failed: ' + data.error.message);
  return data.choices?.[0]?.message?.content || '';
}

// Search with Tavily
async function tavilySearch(query, options = {}) {
  requireEnv('TAVILY_API_KEY');

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: options.depth || 'basic',
      include_answer: false,
      max_results: options.max || 5,
      include_domains: options.domains || [],
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error('Search failed: ' + (data.error.message || data.error));
  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
    score: r.score || 0
  }));
}

// Extract full page content with Firecrawl
async function firecrawlExtract(url) {
  requireEnv('FIRECRAWL_API_KEY');

  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
    },
    body: JSON.stringify({ url, formats: ['markdown'] })
  });
  const data = await resp.json();
  if (!data.success) return null;
  const md = data.data?.markdown || '';
  return md.length > 3000 ? md.substring(0, 3000) : md;
}

// Generate verdict with Claude Sonnet 4 (Anthropic API)
async function generateVerdict(systemPrompt, userMessage) {
  requireEnv('ANTHROPIC_API_KEY');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error('Verdict generation failed: ' + (data.error.message || JSON.stringify(data.error)));
  // Anthropic returns content as an array of blocks
  const textBlock = (data.content || []).find(b => b.type === 'text');
  return textBlock?.text || '';
}

// Detect if text is primarily Arabic or French
function detectLang(text) {
  if (!text) return 'ar';
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const fr = (text.match(/[àâéèêëïîôùûüÿçœæ]/gi) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (ar > latin) return 'ar';
  if (fr > 2 || (latin > ar && /\b(le|la|les|du|des|un|une|est|que|dans|pour|avec|sur)\b/i.test(text))) return 'fr';
  return 'ar';
}

app.post('/api/fact-check', async (req, res) => {
  try {
    const { claim, image, mime } = req.body;
    if (!claim && !image) return res.status(400).json({ error: 'No claim provided' });

    // Step 1: Image description (if provided)
    let imageDescription = null;
    if (image && mime) {
      imageDescription = await describeImage(image, mime);
    }

    // Build the full claim text
    const claimText = claim || '';
    const fullContext = claimText + (imageDescription ? '\n' + imageDescription : '');
    const lang = detectLang(fullContext);

    // Step 2: Extract a concise search query from the claim + image description
    // (Tavily chokes on long queries — we need a short, focused search term)
    let searchQuery = claimText;
    if (imageDescription || claimText.length > 150) {
      const extractResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Extract the core factual claim from this text. Return ONLY a short search query (max 15 words) in the same language as the claim. No explanation, no quotes, just the search query.' },
            { role: 'user', content: fullContext }
          ],
          temperature: 0,
          max_tokens: 60
        })
      });
      const extractData = await extractResp.json();
      const extracted = extractData.choices?.[0]?.message?.content?.trim();
      if (extracted && extracted.length > 5) searchQuery = extracted;
    }
    if (!searchQuery) searchQuery = imageDescription?.substring(0, 100) || '';

    console.log('Search query:', searchQuery);

    // Step 3: Tavily searches (up to 4, local first)
    const tunisianDomains = ['mosaiquefm.net', 'shemsfm.net', 'tap.info.tn', 'kapitalis.com', 'leaders.com.tn', 'businessnews.com.tn', 'webmanagercenter.com', 'nawaat.org'];
    let allResults = [];

    // Search 1: Local (Tunisia/MENA)
    const localQuery = lang === 'fr'
      ? searchQuery + ' Tunisie'
      : searchQuery;
    const localResults = await tavilySearch(localQuery, { max: 5, domains: tunisianDomains }).catch(() => []);
    allResults.push(...localResults);

    // Search 2: Broader (same language, no domain filter)
    const broadResults = await tavilySearch(searchQuery, { max: 5 }).catch(() => []);
    allResults.push(...broadResults);

    // Search 3: Other language if needed
    if (allResults.length < 2) {
      const altQuery = lang === 'ar'
        ? searchQuery + ' fact check'
        : searchQuery + ' تحقق';
      const altResults = await tavilySearch(altQuery, { max: 3 }).catch(() => []);
      allResults.push(...altResults);
    }

    // Search 4: Deep search if still thin
    if (allResults.length < 2) {
      const deepResults = await tavilySearch(searchQuery, { max: 5, depth: 'advanced' }).catch(() => []);
      allResults.push(...deepResults);
    }

    // Deduplicate by URL
    const seen = new Set();
    allResults = allResults.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Step 3: Firecrawl top results if snippets are thin
    const topResults = allResults.slice(0, 3);
    for (let i = 0; i < topResults.length; i++) {
      if (topResults[i].snippet.length < 100) {
        const full = await firecrawlExtract(topResults[i].url).catch(() => null);
        if (full) topResults[i].snippet = full;
      }
    }

    // Step 4: Build context for Kimi
    let evidence = '';
    if (allResults.length === 0) {
      evidence = 'لم يتم العثور على أي نتائج بحث متعلقة بهذا الادعاء.';
    } else {
      evidence = allResults.slice(0, 8).map((r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
      ).join('\n\n');
    }

    let userMessage = '';
    if (imageDescription) {
      userMessage += `[وصف الصورة المرفقة]\n${imageDescription}\n\n`;
    }
    userMessage += `[الادّعاء]\n${claimText || '(الادعاء في الصورة أعلاه)'}\n\n`;
    userMessage += `[نتائج البحث]\n${evidence}`;

    // Step 5: Kimi verdict
    const verdict = await generateVerdict(MELLE5ER_SYSTEM, userMessage);

    res.json({
      result: verdict,
      image_description: imageDescription,
      sources_found: allResults.length
    });
  } catch (err) {
    console.error('Fact-check error:', err);
    res.status(500).json({ error: err.message });
  }
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
  const recommendedVars = [
    'GROQ_API_KEY',
    'TAVILY_API_KEY',
    'FIRECRAWL_API_KEY',
    'ANTHROPIC_API_KEY'
  ];
  const missing = recommendedVars.filter((name) => !process.env[name]);
  console.log(`\n  ⚡ ZvenDenLabs Verification Suite`);
  console.log(`  → http://localhost:${PORT}\n`);
  if (missing.length) {
    console.log(`  Missing env vars: ${missing.join(', ')}`);
  }
});
