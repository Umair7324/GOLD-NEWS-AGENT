import 'dotenv/config';
import { NewsEngine } from './NewsEngine.js';

// ═══════════════════════════════════════════════════════════════
// GOLD NEWS BIAS AGENT v2
// Modes:
//   morning  → 06:00 UTC daily (pre-release bias)
//   update   → after each major release (post-release actual)
//   weekly   → Monday 06:00 UTC (full week preview)
// ═══════════════════════════════════════════════════════════════

const DISCORD = process.env.NEWS_WEBHOOK_URL;
const engine  = new NewsEngine();

// Get mode from args or auto-detect
const MODE = process.argv[2] || 'auto';

async function notify(msg) {
  if (!DISCORD) {
    console.log('⚠️ No webhook (NEWS_WEBHOOK_URL not set)');
    console.log('\n--- MESSAGE PREVIEW ---\n');
    console.log(msg);
    console.log('\n--- END PREVIEW ---\n');
    return;
  }
  try {
    // Discord has 2000 char limit per message — split if needed
    const chunks = splitMessage(msg, 1900);
    for (const chunk of chunks) {
      await fetch(DISCORD, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: chunk }),
      });
      await new Promise(r => setTimeout(r, 500)); // small delay between chunks
    }
    console.log('✅ Sent to Discord');
  } catch (err) {
    console.error('❌ Discord error:', err.message);
  }
}

function splitMessage(msg, maxLen) {
  if (msg.length <= maxLen) return [msg];
  const chunks = [];
  const lines  = msg.split('\n');
  let current  = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function runMorning() {
  console.log('🌅 Mode: MORNING BRIEF\n');
  const now     = new Date();
  const dateStr = now.toUTCString().split(' ').slice(0, 4).join(' ');
  const isMonday = now.getUTCDay() === 1;

  // Monday: send weekly preview first
  if (isMonday || MODE === 'weekly') {
    console.log('📆 Monday detected — sending weekly preview first...');
    const allEvents      = await engine.fetchThisWeekNews();
    const weeklyMsg      = engine.formatWeeklyPreview(allEvents, dateStr);
    await notify(weeklyMsg);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Then send today's morning brief
  const todayEvents = await engine.fetchTodayNews();
  const analysis    = engine.analyzeGoldBias(todayEvents, 'pre');

  console.log(`🎯 Bias: ${analysis.bias} | Confidence: ${analysis.confidence}`);
  console.log(`📈 USD Bullish: ${analysis.bullishUSDScore} | USD Bearish: ${analysis.bearishUSDScore}`);

  const msg = engine.formatMorningMessage(analysis, dateStr);
  await notify(msg);
}

async function runUpdate() {
  console.log('📊 Mode: POST-RELEASE UPDATE\n');
  const now     = new Date();
  const dateStr = now.toUTCString().split(' ').slice(0, 4).join(' ');

  const todayEvents = await engine.fetchTodayNews();

  if (!engine.hasReleasedEvents(todayEvents)) {
    console.log('⏳ No actual data released yet — skipping update');
    process.exit(0);
  }

  const analysis = engine.analyzeGoldBias(todayEvents, 'post');
  console.log(`🎯 Updated Bias: ${analysis.bias} | Confidence: ${analysis.confidence}`);

  const msg = engine.formatPostReleaseMessage(analysis, dateStr);
  await notify(msg);
}

async function runWeekly() {
  console.log('📆 Mode: WEEKLY PREVIEW\n');
  const now        = new Date();
  const dateStr    = now.toUTCString().split(' ').slice(0, 4).join(' ');
  const allEvents  = await engine.fetchThisWeekNews();
  const weeklyMsg  = engine.formatWeeklyPreview(allEvents, dateStr);
  await notify(weeklyMsg);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       GOLD NEWS BIAS AGENT v2                               ║');
  console.log('║  Morning Brief | Post-Release Update | Weekly Preview       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const now  = new Date();
  const hour = now.getUTCHours();

  let mode = MODE;
  if (mode === 'auto') {
    // Auto-detect based on time
    if (hour >= 6 && hour < 8)   mode = 'morning';
    else if (hour >= 13 && hour < 16) mode = 'update'; // after most US releases
    else mode = 'morning'; // default
  }

  if (mode === 'morning' || mode === 'auto') await runMorning();
  else if (mode === 'update')                await runUpdate();
  else if (mode === 'weekly')                await runWeekly();
  else {
    console.log(`Unknown mode: ${mode}`);
    console.log('Usage: node src/news_index.js [morning|update|weekly]');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});