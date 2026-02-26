// ═══════════════════════════════════════════════════════════════
// NewsEngine.js — Gold Bias from Daily News
// Fetches Forex Factory calendar, analyzes USD news
// Outputs: BUY / SELL / NEUTRAL bias for gold
// ═══════════════════════════════════════════════════════════════

// ── News events and their impact on GOLD ──
// Positive for USD = Negative for Gold (SELL bias)
// Negative for USD = Positive for Gold (BUY bias)

const NEWS_IMPACT_MAP = {
    // INFLATION DATA
    'CPI':              { goodForUSD: true,  weight: 3, desc: 'Inflation data' },
    'Core CPI':         { goodForUSD: true,  weight: 3, desc: 'Core inflation' },
    'PPI':              { goodForUSD: true,  weight: 2, desc: 'Producer prices' },
    'PCE':              { goodForUSD: true,  weight: 3, desc: 'Fed preferred inflation' },
    'Core PCE':         { goodForUSD: true,  weight: 3, desc: 'Core PCE' },
  
    // JOBS DATA
    'NFP':              { goodForUSD: true,  weight: 3, desc: 'Non-Farm Payrolls' },
    'Non-Farm':         { goodForUSD: true,  weight: 3, desc: 'Non-Farm Payrolls' },
    'Unemployment':     { goodForUSD: false, weight: 2, desc: 'Unemployment rate' },
    'ADP':              { goodForUSD: true,  weight: 2, desc: 'ADP employment' },
    'Jobless Claims':   { goodForUSD: false, weight: 2, desc: 'Weekly jobless claims' },
  
    // GROWTH DATA
    'GDP':              { goodForUSD: true,  weight: 3, desc: 'Economic growth' },
    'Retail Sales':     { goodForUSD: true,  weight: 2, desc: 'Consumer spending' },
    'ISM':              { goodForUSD: true,  weight: 2, desc: 'Business activity' },
    'PMI':              { goodForUSD: true,  weight: 2, desc: 'Business activity' },
  
    // FED / RATES
    'FOMC':             { goodForUSD: true,  weight: 3, desc: 'Fed rate decision' },
    'Fed':              { goodForUSD: true,  weight: 2, desc: 'Fed speech/statement' },
    'Powell':           { goodForUSD: true,  weight: 2, desc: 'Fed Chair speech' },
    'Interest Rate':    { goodForUSD: true,  weight: 3, desc: 'Rate decision' },
  
    // HOUSING
    'Housing':          { goodForUSD: true,  weight: 1, desc: 'Housing data' },
    'Building Permits': { goodForUSD: true,  weight: 1, desc: 'Building activity' },
  
    // TRADE
    'Trade Balance':    { goodForUSD: false, weight: 2, desc: 'Trade deficit/surplus' },
    'Current Account':  { goodForUSD: false, weight: 1, desc: 'Current account' },
  };
  
  export class NewsEngine {
  
    // ── Parse Forex Factory RSS XML ──
    parseRSS(xmlText) {
      const events = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
  
      while ((match = itemRegex.exec(xmlText)) !== null) {
        const item = match[1];
  
        const title    = this._extractTag(item, 'title');
        const date     = this._extractTag(item, 'date');
        const time     = this._extractTag(item, 'time');
        const impact   = this._extractTag(item, 'impact');
        const currency = this._extractTag(item, 'currency');
        const forecast = this._extractTag(item, 'forecast');
        const previous = this._extractTag(item, 'previous');
  
        if (currency === 'USD' && (impact === 'High' || impact === 'Medium')) {
          events.push({ title, date, time, impact, currency, forecast, previous });
        }
      }
  
      return events;
    }
  
    _extractTag(xml, tag) {
      const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!match) return '';
      return (match[1] || match[2] || '').trim();
    }
  
    // ── Fetch today's news from Forex Factory RSS ──
    async fetchTodayNews() {
      try {
        const res  = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml', {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const xml  = await res.text();
        const all  = this.parseRSS(xml);
  
        // Filter today's events
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  
        return all.filter(e => {
          if (!e.date) return false;
          // FF date format: "Friday February 27, 2026"
          const d = new Date(e.date);
          return d.toISOString().split('T')[0] === todayStr;
        });
      } catch (err) {
        console.error('❌ Failed to fetch news:', err.message);
        return [];
      }
    }
  
    // ── Determine gold bias from today's events ──
    analyzeGoldBias(events) {
      if (!events.length) {
        return {
          bias: 'NEUTRAL',
          score: 0,
          events: [],
          reason: 'No high-impact USD news today',
        };
      }
  
      let bullishScore = 0; // bullish for USD = bearish for gold
      let bearishScore = 0; // bearish for USD = bullish for gold
      const analyzed  = [];
  
      for (const event of events) {
        const title = event.title || '';
  
        // Find matching news type
        let matched = null;
        for (const [key, info] of Object.entries(NEWS_IMPACT_MAP)) {
          if (title.toLowerCase().includes(key.toLowerCase())) {
            matched = { key, ...info };
            break;
          }
        }
  
        if (!matched) {
          analyzed.push({
            title,
            time: event.time,
            impact: event.impact,
            goldEffect: 'UNKNOWN',
            weight: 1,
          });
          continue;
        }
  
        const highImpact = event.impact === 'High';
        const weight = matched.weight * (highImpact ? 1.5 : 1);
  
        // Logic:
        // If data comes in STRONG (actual > forecast) AND goodForUSD = true
        // = bullish USD = bearish gold (SELL gold)
        // We don't know actual yet (pre-release), so we analyze EXPECTED direction
  
        // For pre-release bias: strong economic data expected = USD bullish = gold bearish
        // We use forecast vs previous to determine expected direction
        let goldEffect = 'NEUTRAL';
        let goldBias   = 'NEUTRAL';
  
        if (matched.goodForUSD) {
          // Strong data = USD up = Gold down = SELL gold
          goldEffect = 'BEARISH FOR GOLD (data favors USD)';
          goldBias   = 'SELL';
          bullishScore += weight; // bullish USD score
        } else {
          // High unemployment, trade deficit etc = USD down = Gold up = BUY gold
          goldEffect = 'BULLISH FOR GOLD (data weakens USD)';
          goldBias   = 'BUY';
          bearishScore += weight; // bearish USD score
        }
  
        analyzed.push({
          title,
          time: event.time,
          impact: event.impact,
          goldEffect,
          goldBias,
          weight: Math.round(weight),
          forecast: event.forecast,
          previous: event.previous,
        });
      }
  
      // Calculate net bias
      const netScore  = bullishScore - bearishScore; // positive = USD bullish = gold bearish
      const absScore  = Math.abs(netScore);
      let bias        = 'NEUTRAL';
      let confidence  = 'LOW';
  
      if (netScore > 3) {
        bias = 'SELL'; // USD strong expected = sell gold
      } else if (netScore < -3) {
        bias = 'BUY'; // USD weak expected = buy gold
      } else if (netScore > 1.5) {
        bias = 'SLIGHT SELL';
      } else if (netScore < -1.5) {
        bias = 'SLIGHT BUY';
      }
  
      if (absScore > 5)      confidence = 'HIGH';
      else if (absScore > 2) confidence = 'MEDIUM';
      else                   confidence = 'LOW';
  
      return {
        bias,
        confidence,
        bullishUSDScore: Math.round(bullishScore * 10) / 10,
        bearishUSDScore: Math.round(bearishScore * 10) / 10,
        netScore:        Math.round(netScore * 10) / 10,
        events: analyzed,
      };
    }
  
    // ── Format Discord message ──
    formatDiscordMessage(analysis, date) {
      const { bias, confidence, events, bullishUSDScore, bearishUSDScore } = analysis;
  
      const biasEmoji = {
        'BUY':          '🟢',
        'SLIGHT BUY':   '🟡',
        'NEUTRAL':      '⚪',
        'SLIGHT SELL':  '🟡',
        'SELL':         '🔴',
      }[bias] || '⚪';
  
      const biasLine = bias === 'NEUTRAL'
        ? '⚪ **NEUTRAL** — No clear direction from news today'
        : `${biasEmoji} **${bias} GOLD** — News favors ${bias === 'BUY' || bias === 'SLIGHT BUY' ? 'weakness in USD' : 'strength in USD'}`;
  
      const lines = [
        `📰 **GOLD NEWS BIAS — ${date}**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        biasLine,
        `📊 Confidence: **${confidence}**`,
        `📈 USD Bullish Score: ${bullishUSDScore} | USD Bearish Score: ${bearishUSDScore}`,
        ``,
        `🗓️ **Today's Key Events (UTC):**`,
      ];
  
      if (!events.length) {
        lines.push('   No high-impact USD news today');
      } else {
        for (const e of events) {
          const impactIcon = e.impact === 'High' ? '🔴' : '🟠';
          const arrow = e.goldBias === 'BUY' ? '⬆️ Gold' : e.goldBias === 'SELL' ? '⬇️ Gold' : '➡️ Gold';
          lines.push(`   ${impactIcon} **${e.time}** — ${e.title}`);
          if (e.forecast) lines.push(`      Forecast: ${e.forecast} | Prev: ${e.previous} | ${arrow}`);
        }
      }
  
      lines.push(``);
      lines.push(`⚠️ *Bias is pre-release estimate. Always wait for actual data before trading.*`);
      lines.push(`🕐 *Check back after releases for confirmation*`);
  
      return lines.join('\n');
    }
  }