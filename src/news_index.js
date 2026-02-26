import { NewsEngine } from './NewsEngine.js';

// ═══════════════════════════════════════════════════════════════
// GOLD NEWS BIAS AGENT
// Runs daily at 06:00 UTC Mon-Fri
// Fetches Forex Factory news → analyzes gold direction
// Sends Discord message: BUY / SELL / NEUTRAL bias
// ═══════════════════════════════════════════════════════════════

const DISCORD = process.env.NEWS_WEBHOOK_URL;
const engine  = new NewsEngine();

async function notify(msg) {
  if (!DISCORD) {
    console.log('⚠️ No Discord webhook set (NEWS_WEBHOOK_URL)');
    return;
  }
  try {
    await fetch(DISCORD, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: msg }),
    });
  } catch (err) {
    console.error('Discord error:', err.message);
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         GOLD NEWS BIAS AGENT — Daily Analysis               ║');
  console.log('║  Fetches Forex Factory → Analyzes USD news → Gold bias      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const now  = new Date();
  const date = now.toUTCString().split(' ').slice(0, 4).join(' ');

  console.log(`📅 Date: ${date}`);
  console.log(`🔍 Fetching today's news...\n`);

  // ── Fetch and analyze ──
  const events   = await engine.fetchTodayNews();
  const analysis = engine.analyzeGoldBias(events);

  console.log(`📊 Events found: ${events.length}`);
  console.log(`🎯 Gold Bias: ${analysis.bias}`);
  console.log(`📈 Confidence: ${analysis.confidence}`);
  console.log(`💹 USD Bullish: ${analysis.bullishUSDScore} | USD Bearish: ${analysis.bearishUSDScore}\n`);

  if (analysis.events.length) {
    console.log('📋 Events analyzed:');
    for (const e of analysis.events) {
      console.log(`   ${e.impact === 'High' ? '🔴' : '🟠'} ${e.time} — ${e.title} → ${e.goldBias || 'UNKNOWN'}`);
    }
  }

  // ── Send Discord message ──
  const msg = engine.formatDiscordMessage(analysis, date);
  console.log('\n📨 Sending to Discord...');
  await notify(msg);
  console.log('✅ Done!\n');

  // ── Log summary ──
  console.log('════════════════════════════════');
  console.log(`GOLD BIAS TODAY: ${analysis.bias}`);
  console.log(`CONFIDENCE: ${analysis.confidence}`);
  console.log('════════════════════════════════');

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});