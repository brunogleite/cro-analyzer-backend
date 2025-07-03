import { chromium } from 'playwright';
import OpenAI from 'openai';
import generatePDFfromHTML from './pdf-conversion.js';
import fs from 'fs/promises';
import { encoding_for_model } from 'tiktoken';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const enc = encoding_for_model('gpt-4-turbo');

export async function scrapePage(url: string) {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    locale: 'pt-PT',
    extraHTTPHeaders: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
      'cache-control': 'max-age=0',
      'upgrade-insecure-requests': '1',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
    },
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);

    await page.screenshot({
      path: 'landing-page-snapshot.png',
      fullPage: true,
    });

    console.log('📸 Screenshot saved as landing-page-snapshot.png');

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);

    await fs.writeFile('landing-page.html', html);

    return { html, text };
  } catch (err) {
    console.error('❌ Failed to scrape page:', (err as Error).message);
    return { html: '', text: '' };
  } finally {
    await browser.close();
  }
}

function getTrimmedText(text: string, maxChars = 8000) {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return text.slice(0, half) + '\n...\n' + text.slice(-half);
}

export async function analyzeWithGPT(
  text: string,
  html: string,
  url: string
): Promise<string> {
  const sampledText = getTrimmedText(text);
  const sampledHtml = getTrimmedText(html);

  const prompt = `
Act as a senior CRO (Conversion Rate Optimization) expert with over 20 years of experience optimizing high-converting landing pages.
...
Page URL: ${url}

Page text (sampled): 
${sampledText}

Page HTML (sampled): 
${sampledHtml}
`;

  const promptTokens = enc.encode(prompt).length;
  console.log(`🧮 Prompt tokens: ${promptTokens}`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

  const reply = response.choices[0].message.content ?? '';
  const replyTokens = enc.encode(reply).length;

  console.log(`🧾 Response tokens: ${replyTokens}`);
  console.log(`📊 Total tokens: ${promptTokens + replyTokens}`);

  return reply;
}

export async function generateCROReportPDF(
  analysis: string,
  outputPath: string
) {
  await generatePDFfromHTML(analysis, outputPath);
  console.log(`✅ PDF saved as ${outputPath}`);
}
