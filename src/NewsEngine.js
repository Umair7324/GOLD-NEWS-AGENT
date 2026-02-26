// ═══════════════════════════════════════════════════════════════
// NewsEngine.js — Gold Bias from Daily News v2
// Fetches Forex Factory calendar, analyzes USD news
// Outputs: BUY / SELL / NEUTRAL bias for gold
// Improvements: PKT times, forecast vs prev, post-release updates
// ═══════════════════════════════════════════════════════════════

const NEWS_IMPACT_MAP = {
    // INFLATION — high inflation = Fed keeps rates high = USD up = Gold down
    'CPI':                { goodForUSD: true,  weight: 3, desc: 'Inflation data' },
    'Core CPI':           { goodForUSD: true,  weight: 3, desc: 'Core inflation' },
    'PPI':                { goodForUSD: true,  weight: 2, desc: 'Producer prices' },
    'PCE':                { goodForUSD: true,  weight: 3, desc: 'Fed preferred inflation' },
    'Core PCE':           { goodForUSD: true,  weight: 3, desc: 'Core PCE inflation' },
  
    // JOBS — strong jobs = USD up = Gold down
    'Non-Farm':           { goodForUSD: true,  weight: 3, desc: 'Non-Farm Payrolls (biggest)' },
    'NFP':                { goodForUSD: true,  weight: 3, desc: 'Non-Farm Payrolls (biggest)' },
    'ADP':                { goodForUSD: true,  weight: 2, desc: 'ADP employment change' },
    'Unemployment':       { goodForUSD: false, weight: 2, desc: 'Unemployment rate' },
    'Jobless Claims':     { goodForUSD: false, weight: 2, desc: 'Weekly jobless claims' },
    'Employment':         { goodForUSD: true,  weight: 2, desc: 'Employment change' },
  
    // GROWTH
    'GDP':                { goodForUSD: true,  weight: 3, desc: 'Economic growth' },
    'Retail Sales':       { goodForUSD: true,  weight: 2, desc: 'Consumer spending' },
    'ISM':                { goodForUSD: true,  weight: 2, desc: 'Business activity' },
    'PMI':                { goodForUSD: true,  weight: 2, desc: 'Business activity' },
    'Durable Goods':      { goodForUSD: true,  weight: 2, desc: 'Manufacturing orders' },
    'Consumer Confidence':{ goodForUSD: true,  weight: 2, desc: 'Consumer sentiment' },
  
    // FED / RATES — hawkish = USD up = Gold down
    'FOMC':               { goodForUSD: true,  weight: 3, desc: 'Fed rate decision' },
    'Federal Funds':      { goodForUSD: true,  weight: 3, desc: 'Fed rate decision' },
    'Interest Rate':      { goodForUSD: true,  weight: 3, desc: 'Rate decision' },
    'Powell':             { goodForUSD: true,  weight: 2, desc: 'Fed Chair speech' },
    'Fed Chair':          { goodForUSD: true,  weight: 2, desc: 'Fed Chair speech' },
    'FOMC Minutes':       { goodForUSD: true,  weight: 2, desc: 'Fed meeting minutes' },
  
    // HOUSING
    'Housing':            { goodForUSD: true,  weight: 1, desc: 'Housing data' },
    'Building Permits':   { goodForUSD: true,  weight: 1, desc: 'Building activity' },
    'Existing Home':      { goodForUSD: true,  weight: 1, desc: 'Home sales' },
    'New Home':           { goodForUSD: true,  weight: 1, desc: 'New home sales' },
  
    // TRADE — deficit = USD weak = Gold up
    'Trade Balance':      { goodForUSD: false, weight: 2, desc: 'Trade deficit/surplus' },
    'Current Account':    { goodForUSD: false, weight: 1, desc: 'Current account' },
  };
  
  // Convert UTC time string to PKT (UTC+5)
  function utcToPKT(utcTimeStr) {
    if (!utcTimeStr) return '';
    try {
      const match = utcTimeStr.match(/(\d+):(\d+)(am|pm)/i);
      if (!match) return utcTimeStr;
      let hours  = parseInt(match[1]);
      const mins = match[2];
      const ampm = match[3].toLowerCase();
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      hours += 5; // PKT = UTC+5
      if (hours >= 24) hours -= 24;
      const pktAmpm = hours >= 12 ? 'PM' : 'AM';
      const pktHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      return `${pktHour}:${mins} ${pktAmpm} PKT`;
    } catch { return utcTimeStr; }
  }
  
  // Parse numeric value from "2.9%", "156K", "1.2M" etc
  function parseValue(str) {
    if (!str) return null;
    const clean = str.replace(/[%,\s]/g, '');
    if (clean.endsWith('K')) return parseFloat(clean) * 1000;
    if (clean.endsWith('M')) return parseFloat(clean) * 1000000;
    if (clean.endsWith('B')) return parseFloat(clean) * 1000000000;
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }
  
  export class NewsEngine {
  
    // ── Parse Forex Factory RSS XML ──
    // FF uses <event> tags, <country> for currency, date format MM-DD-YYYY
    parseRSS(xmlText) {
      const events = [];
      const itemRegex = /<event>([\s\S]*?)<\/event>/g;
      let match;
      while ((match = itemRegex.exec(xmlText)) !== null) {
        const item    = match[1];
        const title   = this._extractTag(item, 'title');
        const date    = this._extractTag(item, 'date');   // format: MM-DD-YYYY
        const time    = this._extractTag(item, 'time');
        const impact  = this._extractTag(item, 'impact');
        const country = this._extractTag(item, 'country'); // FF uses country not currency
        const forecast = this._extractTag(item, 'forecast');
        const previous = this._extractTag(item, 'previous');
        const actual   = this._extractTag(item, 'actual');
        if (country === 'USD' && (impact === 'High' || impact === 'Medium')) {
          events.push({ title, date, time, impact, currency: country, forecast, previous, actual });
        }
      }
      return events;
    }
  
    _extractTag(xml, tag) {
      const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!match) return '';
      return (match[1] || match[2] || '').trim();
    }
  
    // ── Fetch all this week's USD news ──
    async fetchThisWeekNews() {
      try {
        const res  = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml');
        const xml  = await res.text(); // confirmed working in test
        // Use matchAll (exec loop breaks with this encoding)
        const allMatches = [...xml.matchAll(/<event>([\s\S]*?)<\/event>/g)];
        console.log(`   📡 Total events in feed: ${allMatches.length}`);
        const events = [];
        for (const match of allMatches) {
          const item     = match[1];
          const title    = this._extractTag(item, 'title');
          const date     = this._extractTag(item, 'date');
          const time     = this._extractTag(item, 'time');
          const impact   = this._extractTag(item, 'impact');
          const country  = this._extractTag(item, 'country');
          const forecast = this._extractTag(item, 'forecast');
          const previous = this._extractTag(item, 'previous');
          const actual   = this._extractTag(item, 'actual');
          if (country === 'USD' && (impact === 'High' || impact === 'Medium')) {
            events.push({ title, date, time, impact, currency: country, forecast, previous, actual });
          }
        }
        console.log(`   💰 USD High/Medium events: ${events.length}`);
        return events;
      } catch (err) {
        console.error('❌ Failed to fetch Forex Factory:', err.message);
        return [];
      }
    }
  
    // ── Fetch today's news only ──
    async fetchTodayNews() {
      const all   = await this.fetchThisWeekNews();
      const today = new Date();
      // FF date format: MM-DD-YYYY e.g. "02-27-2026"
      const mm    = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd    = String(today.getUTCDate()).padStart(2, '0');
      const yyyy  = today.getUTCFullYear();
      const todayStr = `${mm}-${dd}-${yyyy}`;
  
      const filtered = all.filter(e => e.date === todayStr);
      console.log(`   📅 Today (${todayStr}) events: ${filtered.length}`);
      return filtered;
    }
  
    // ── Check if any events have been released (have actual data) ──
    hasReleasedEvents(events) {
      return events.some(e => e.actual && e.actual.trim() !== '');
    }
  
    // ── Analyze gold bias ──
    // mode: 'pre' = before release | 'post' = after release (uses actual data)
    analyzeGoldBias(events, mode = 'pre') {
      if (!events.length) {
        return {
          bias: 'NEUTRAL', confidence: 'LOW',
          bullishUSDScore: 0, bearishUSDScore: 0, netScore: 0,
          events: [],
          reason: 'No high-impact USD news today — trade technicals only',
        };
      }
  
      let bullishScore = 0; // USD strong = gold down = SELL gold
      let bearishScore = 0; // USD weak  = gold up   = BUY gold
      const analyzed   = [];
  
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
            title, time: event.time, pktTime: utcToPKT(event.time),
            impact: event.impact, goldBias: 'UNKNOWN',
            forecast: event.forecast, previous: event.previous, actual: event.actual,
            note: 'Minor/unrecognized event',
          });
          continue;
        }
  
        const highImpact = event.impact === 'High';
        let weight       = matched.weight * (highImpact ? 1.5 : 1);
        let goldBias     = 'NEUTRAL';
        let note         = '';
  
        if (mode === 'post' && event.actual && event.actual.trim()) {
          // POST-RELEASE: use actual vs forecast
          const actualVal   = parseValue(event.actual);
          const forecastVal = parseValue(event.forecast);
  
          if (actualVal !== null && forecastVal !== null) {
            const beat = actualVal > forecastVal;
            const miss = actualVal < forecastVal;
            const diff = Math.abs(((actualVal - forecastVal) / forecastVal) * 100).toFixed(1);
  
            if (matched.goodForUSD) {
              if (beat) {
                goldBias = 'SELL';
                note = `🔥 Beat forecast by ${diff}% → USD bullish → SELL Gold`;
                bullishScore += weight;
              } else if (miss) {
                goldBias = 'BUY';
                note = `💧 Missed forecast by ${diff}% → USD bearish → BUY Gold`;
                bearishScore += weight;
              } else {
                goldBias = 'NEUTRAL';
                note = `➡️ In line with forecast → minimal impact`;
                weight *= 0.3;
              }
            } else {
              // Unemployment, jobless claims etc
              if (beat) {
                goldBias = 'BUY'; // worse = bad for USD = good for gold
                note = `⬆️ Worse than forecast → USD bearish → BUY Gold`;
                bearishScore += weight;
              } else if (miss) {
                goldBias = 'SELL'; // better = good for USD = bad for gold
                note = `⬇️ Better than feared → USD bullish → SELL Gold`;
                bullishScore += weight;
              }
            }
          } else {
            // Fallback to pre-release logic
            if (matched.goodForUSD) {
              goldBias = 'SELL'; bullishScore += weight;
              note = `Released: ${event.actual} (could not compare numerically)`;
            } else {
              goldBias = 'BUY'; bearishScore += weight;
              note = `Released: ${event.actual} (could not compare numerically)`;
            }
          }
        } else {
          // PRE-RELEASE: use forecast vs previous for expected direction
          const forecastVal = parseValue(event.forecast);
          const previousVal = parseValue(event.previous);
  
          if (forecastVal !== null && previousVal !== null) {
            const improving = matched.goodForUSD
              ? forecastVal > previousVal
              : forecastVal < previousVal;
            if (improving) {
              weight *= 1.2;
              note = `Expected to improve (${event.forecast} vs prev ${event.previous})`;
            } else {
              weight *= 0.9;
              note = `Expected to weaken (${event.forecast} vs prev ${event.previous})`;
            }
          } else if (event.forecast) {
            note = `Forecast: ${event.forecast} | Prev: ${event.previous}`;
          }
  
          if (matched.goodForUSD) {
            goldBias = 'SELL'; bullishScore += weight;
          } else {
            goldBias = 'BUY'; bearishScore += weight;
          }
        }
  
        analyzed.push({
          title, time: event.time, pktTime: utcToPKT(event.time),
          impact: event.impact, goldBias,
          weight: Math.round(weight * 10) / 10,
          forecast: event.forecast, previous: event.previous, actual: event.actual,
          note,
        });
      }
  
      // Net score: positive = USD bullish = sell gold
      const netScore = bullishScore - bearishScore;
      const absScore = Math.abs(netScore);
      let bias       = 'NEUTRAL';
      let confidence = 'LOW';
  
      if      (netScore >  4)  bias = 'SELL';
      else if (netScore < -4)  bias = 'BUY';
      else if (netScore >  2)  bias = 'SLIGHT SELL';
      else if (netScore < -2)  bias = 'SLIGHT BUY';
  
      if      (absScore > 6)  confidence = 'HIGH';
      else if (absScore > 3)  confidence = 'MEDIUM';
      else                    confidence = 'LOW';
  
      return {
        bias, confidence, mode,
        bullishUSDScore: Math.round(bullishScore * 10) / 10,
        bearishUSDScore: Math.round(bearishScore * 10) / 10,
        netScore:        Math.round(netScore * 10) / 10,
        events: analyzed,
      };
    }
  
    // ── Format morning message (pre-release) ──
    formatMorningMessage(analysis, dateStr) {
      const { bias, confidence, events, bullishUSDScore, bearishUSDScore } = analysis;
      const biasEmoji = { 'BUY':'🟢','SLIGHT BUY':'🟡','NEUTRAL':'⚪','SLIGHT SELL':'🟡','SELL':'🔴' }[bias] || '⚪';
      const advice    = {
        'BUY':         '📈 Look for BUY setups in gold today',
        'SLIGHT BUY':  '📈 Slight BUY lean — wait for technical confirmation',
        'NEUTRAL':     '↔️ No news bias — follow technical signals only',
        'SLIGHT SELL': '📉 Slight SELL lean — wait for technical confirmation',
        'SELL':        '📉 Look for SELL setups in gold today',
      }[bias] || '↔️ Follow technical signals';
  
      const lines = [
        `🌅 **GOLD MORNING BRIEF — ${dateStr}**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `${biasEmoji} **TODAY'S GOLD BIAS: ${bias}**`,
        `📊 Confidence: **${confidence}**`,
        `💡 ${advice}`,
        ``,
        `📈 USD Strength: ${bullishUSDScore} pts | 📉 USD Weakness: ${bearishUSDScore} pts`,
        ``,
      ];
  
      const validEvents = events.filter(e => e.goldBias !== 'UNKNOWN');
      if (!validEvents.length) {
        lines.push(`📅 **No major USD news today**`);
        lines.push(`   ✅ Free to trade based on technical signals`);
      } else {
        lines.push(`📅 **Today's Key Releases:**`);
        lines.push('');
        for (const e of validEvents) {
          const icon      = e.impact === 'High' ? '🔴' : '🟠';
          const goldArrow = e.goldBias === 'BUY' ? '⬆️ BUY bias' : e.goldBias === 'SELL' ? '⬇️ SELL bias' : '➡️ Neutral';
          lines.push(`${icon} **${e.title}**`);
          lines.push(`   🕐 ${e.time} UTC → **${e.pktTime}**`);
          if (e.forecast) lines.push(`   Forecast: **${e.forecast}** | Previous: ${e.previous}`);
          lines.push(`   ${goldArrow}`);
          if (e.note) lines.push(`   📝 ${e.note}`);
          lines.push('');
        }
      }
  
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`⚠️ *Pre-release estimate. Actual data may differ.*`);
      lines.push(`📲 *Post-release update sent after each major event*`);
      return lines.join('\n');
    }
  
    // ── Format post-release update message ──
    formatPostReleaseMessage(analysis, dateStr) {
      const { bias, confidence, events } = analysis;
      const biasEmoji = { 'BUY':'🟢','SLIGHT BUY':'🟡','NEUTRAL':'⚪','SLIGHT SELL':'🟡','SELL':'🔴' }[bias] || '⚪';
      const releasedEvents = events.filter(e => e.actual && e.actual.trim());
  
      const lines = [
        `📊 **GOLD BIAS UPDATE — ${dateStr}**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `${biasEmoji} **UPDATED BIAS: ${bias}**`,
        `📊 Confidence: **${confidence}** *(actual data)*`,
        ``,
        `📋 **Released:**`,
        '',
      ];
  
      for (const e of releasedEvents) {
        const icon        = e.impact === 'High' ? '🔴' : '🟠';
        const resultEmoji = e.goldBias === 'BUY' ? '🟢' : e.goldBias === 'SELL' ? '🔴' : '⚪';
        lines.push(`${icon} **${e.title}** (${e.pktTime})`);
        lines.push(`   Actual: **${e.actual}** | Forecast: ${e.forecast} | Prev: ${e.previous}`);
        if (e.note) lines.push(`   ${resultEmoji} ${e.note}`);
        lines.push('');
      }
  
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 *Trade in the direction of updated bias + technical confirmation*`);
      return lines.join('\n');
    }
  
    // ── Format weekly preview (Monday only) ──
    formatWeeklyPreview(allEvents, dateStr) {
      const byDay = {};
      for (const e of allEvents) {
        const key = e.date || 'Unknown';
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(e);
      }
  
      const lines = [
        `📆 **GOLD WEEKLY PREVIEW — ${dateStr}**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
      ];
  
      const days = Object.keys(byDay).sort();
      if (!days.length) {
        lines.push('✅ No major USD news this week — clean technical trading week');
      } else {
        for (const day of days) {
          const dayEvents = byDay[day];
          const highCount = dayEvents.filter(e => e.impact === 'High').length;
          const risk      = highCount >= 2 ? '🔴 HIGH RISK' : highCount === 1 ? '🟠 MEDIUM RISK' : '🟢 LOW RISK';
          let dayName = day;
          try {
            // FF date format: MM-DD-YYYY
            const [mm, dd, yyyy] = day.split('-');
            dayName = new Date(`${yyyy}-${mm}-${dd}`).toLocaleDateString('en-US', {
              weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC'
            });
          } catch {}
  
          lines.push(`**${dayName}** — ${risk}`);
          for (const e of dayEvents) {
            const icon = e.impact === 'High' ? '🔴' : '🟠';
            lines.push(`   ${icon} ${e.time} UTC (${utcToPKT(e.time)}) — ${e.title}`);
          }
          lines.push('');
        }
      }
  
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 *High risk days = be more selective, wait for news before trading*`);
      lines.push(`💡 *NFP Friday = most volatile day of the month*`);
      return lines.join('\n');
    }
  }