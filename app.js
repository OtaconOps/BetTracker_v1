/* ============================================
   LEDGER — application logic
   ============================================ */

(() => {
  'use strict';

  let bets = [];              // all bets, freshest last after sort by date/createdAt
  let historyFilter = 'all';
  let chartRange = 'all';
  let searchTerm = '';

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const fmtMoney = (n) => {
    const sign = n < 0 ? '-' : '';
    return `${sign}€${Math.abs(n).toFixed(2)}`;
  };
  const fmtMoneySigned = (n) => (n >= 0 ? '+' : '-') + `€${Math.abs(n).toFixed(2)}`;
  const profitOf = (bet) => bet.result === 'win' ? (bet.returnAmount - bet.stake) : -bet.stake;
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function sortedByDate(list) {
    return [...list].sort((a, b) => {
      if (a.date === b.date) return a.createdAt - b.createdAt;
      return a.date < b.date ? -1 : 1;
    });
  }

  // ---------- data load ----------
  async function loadBets() {
    bets = await LedgerDB.getAll();
    renderAll();
  }

  function renderAll() {
    renderLedgerTape();
    renderDashboard();
    renderHistory();
  }

  // ---------- LEDGER TAPE (signature element) ----------
  function renderLedgerTape() {
    const track = $('#ledgerTapeTrack');
    track.innerHTML = '';
    const recent = sortedByDate(bets).slice(-40);
    if (recent.length === 0) {
      for (let i = 0; i < 30; i++) {
        const tick = document.createElement('div');
        tick.className = 'tape-tick';
        tick.style.height = '4px';
        track.appendChild(tick);
      }
      return;
    }
    const maxAbs = Math.max(...recent.map(b => Math.abs(profitOf(b))), 1);
    recent.forEach((bet) => {
      const p = profitOf(bet);
      const h = Math.max(4, Math.round((Math.abs(p) / maxAbs) * 26));
      const tick = document.createElement('div');
      tick.className = 'tape-tick ' + (p >= 0 ? 'win' : 'loss');
      tick.style.height = h + 'px';
      track.appendChild(tick);
    });
    // auto-scroll to the end (most recent)
    requestAnimationFrame(() => {
      const tape = $('#ledgerTape');
      tape.scrollLeft = tape.scrollWidth;
    });
  }

  // ---------- DASHBOARD ----------
  function computeStats(list) {
    const totalBets = list.length;
    const totalWagered = list.reduce((s, b) => s + b.stake, 0);
    const totalReturned = list.reduce((s, b) => s + (b.result === 'win' ? b.returnAmount : 0), 0);
    const netProfit = list.reduce((s, b) => s + profitOf(b), 0);
    const wins = list.filter(b => b.result === 'win').length;
    const winRate = totalBets ? (wins / totalBets) * 100 : null;
    const avgProfit = totalBets ? netProfit / totalBets : 0;

    let biggestWin = null, biggestLoss = null;
    list.forEach(b => {
      const p = profitOf(b);
      if (p > 0 && (!biggestWin || p > profitOf(biggestWin))) biggestWin = b;
      if (p < 0 && (!biggestLoss || p < profitOf(biggestLoss))) biggestLoss = b;
    });

    // streaks (chronological order)
    const chrono = sortedByDate(list);
    let curStreak = 0, curType = null;
    let longestWin = 0, longestLoss = 0, runWin = 0, runLoss = 0;
    chrono.forEach(b => {
      if (b.result === 'win') {
        runWin++; runLoss = 0;
        longestWin = Math.max(longestWin, runWin);
      } else {
        runLoss++; runWin = 0;
        longestLoss = Math.max(longestLoss, runLoss);
      }
    });
    if (chrono.length) {
      const last = chrono[chrono.length - 1].result;
      curType = last;
      for (let i = chrono.length - 1; i >= 0; i--) {
        if (chrono[i].result === last) curStreak++;
        else break;
      }
    }

    return {
      totalBets, totalWagered, totalReturned, netProfit, winRate, avgProfit,
      biggestWin, biggestLoss, longestWin, longestLoss, curStreak, curType
    };
  }

  function renderDashboard() {
    const stats = computeStats(bets);

    const heroEl = $('#heroProfit');
    heroEl.textContent = fmtMoney(stats.netProfit);
    heroEl.classList.remove('positive', 'negative');
    heroEl.classList.add(stats.netProfit >= 0 ? 'positive' : 'negative');
    $('#heroSub').textContent = stats.totalBets
      ? `Across ${stats.totalBets} bet${stats.totalBets === 1 ? '' : 's'}`
      : 'No bets yet';

    $('#statTotalBets').textContent = stats.totalBets;
    $('#statWinRate').textContent = stats.winRate === null ? '—' : `${stats.winRate.toFixed(1)}%`;
    $('#statWagered').textContent = fmtMoney(stats.totalWagered);
    $('#statReturned').textContent = fmtMoney(stats.totalReturned);
    $('#statAvgProfit').textContent = fmtMoneySigned(stats.avgProfit);
    $('#statStreak').textContent = stats.curType
      ? `${stats.curStreak} ${stats.curType === 'win' ? 'win' : 'loss'}${stats.curStreak === 1 ? '' : 'es'}`
      : '—';

    const winEl = $('#recBiggestWin');
    winEl.textContent = stats.biggestWin ? fmtMoneySigned(profitOf(stats.biggestWin)) : '—';
    const lossEl = $('#recBiggestLoss');
    lossEl.textContent = stats.biggestLoss ? fmtMoneySigned(profitOf(stats.biggestLoss)) : '—';
    $('#recWinStreak').textContent = stats.longestWin || '—';
    $('#recLossStreak').textContent = stats.longestLoss || '—';

    renderChart();
  }

  // ---------- CHART ----------
  function filterByRange(list, range) {
    if (range === 'all') return list;
    const now = new Date();
    const cutoff = new Date();
    if (range === 'week') cutoff.setDate(now.getDate() - 7);
    if (range === 'month') cutoff.setDate(now.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return list.filter(b => b.date >= cutoffStr);
  }

  function renderChart() {
    const svg = $('#profitChart');
    const empty = $('#chartEmpty');
    const chrono = sortedByDate(filterByRange(bets, chartRange));

    if (chrono.length === 0) {
      svg.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    // build cumulative series
    let running = 0;
    const points = chrono.map(b => {
      running += profitOf(b);
      return running;
    });

    const W = 600, H = 220, PAD = 12;
    const minV = Math.min(0, ...points);
    const maxV = Math.max(0, ...points);
    const range = (maxV - minV) || 1;

    const xStep = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
    const yOf = (v) => H - PAD - ((v - minV) / range) * (H - PAD * 2);
    const xOf = (i) => PAD + i * xStep;

    const coords = points.map((v, i) => [xOf(i), yOf(v)]);
    const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');

    const zeroY = yOf(0).toFixed(1);
    const lastPoint = coords[coords.length - 1];
    const isUp = points[points.length - 1] >= 0;
    const strokeColor = isUp ? '#3DDC84' : '#FF5D5D';

    const areaD = pathD + ` L${lastPoint[0].toFixed(1)},${zeroY} L${coords[0][0].toFixed(1)},${zeroY} Z`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#262B36" stroke-width="1" stroke-dasharray="4 4"/>
      <path d="${areaD}" fill="url(#areaGrad)" stroke="none"/>
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastPoint[0].toFixed(1)}" cy="${lastPoint[1].toFixed(1)}" r="4.5" fill="${strokeColor}"/>
    `;
  }

  // ---------- HISTORY ----------
  function filterHistory() {
    let list = sortedByDate(bets).reverse();

    if (historyFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (historyFilter === 'today') {
        const t = todayStr();
        list = list.filter(b => b.date === t);
      } else {
        if (historyFilter === 'week') cutoff.setDate(now.getDate() - 7);
        if (historyFilter === 'month') cutoff.setDate(now.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        list = list.filter(b => b.date >= cutoffStr);
      }
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(b => (b.notes || '').toLowerCase().includes(q));
    }

    return list;
  }

  function renderHistory() {
    const list = filterHistory();
    const container = $('#historyList');
    const emptyState = $('#historyEmpty');

    if (list.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    container.innerHTML = list.map(bet => {
      const p = profitOf(bet);
      const dateLabel = formatDateLabel(bet.date);
      const notes = bet.notes ? escapeHtml(bet.notes) : (bet.result === 'win' ? 'Win' : 'Loss');
      return `
        <div class="bet-row" data-id="${bet.id}">
          <div class="result-chip ${bet.result}"></div>
          <div class="bet-row-main">
            <div class="bet-row-notes">${notes}</div>
            <div class="bet-row-meta">${dateLabel} · staked ${fmtMoney(bet.stake)}</div>
          </div>
          <div class="bet-row-profit ${p >= 0 ? 'up' : 'down'}">${fmtMoneySigned(p)}</div>
        </div>
      `;
    }).join('');
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- SHEET (add/edit bet) ----------
  const sheetOverlay = $('#sheetOverlay');
  const betForm = $('#betForm');
  let currentEditId = null;

  function openSheet(bet = null) {
    currentEditId = bet ? bet.id : null;
    $('#sheetTitle').textContent = bet ? 'Edit bet' : 'New bet';
    $('#deleteBetBtn').classList.toggle('hidden', !bet);
    $('#editIdInput').value = bet ? bet.id : '';

    setResultToggle(bet ? bet.result : 'win');
    $('#stakeInput').value = bet ? bet.stake : '';
    $('#returnInput').value = bet ? bet.returnAmount : '';
    $('#dateInput').value = bet ? bet.date : todayStr();
    $('#notesInput').value = bet ? bet.notes : '';
    updateProfitPreview();

    sheetOverlay.classList.add('open');
  }

  function closeSheet() {
    sheetOverlay.classList.remove('open');
    currentEditId = null;
    betForm.reset();
  }

  function setResultToggle(result) {
    $('#resultInput').value = result;
    $$('.toggle-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.result === result);
    });
    // When it's a loss, return is implicitly 0 (stake lost) but we let user edit if partial cashout etc.
    updateProfitPreview();
  }

  function updateProfitPreview() {
    const stake = parseFloat($('#stakeInput').value) || 0;
    const ret = parseFloat($('#returnInput').value) || 0;
    const result = $('#resultInput').value;
    const profit = result === 'win' ? (ret - stake) : -stake;
    const el = $('#profitPreview');
    el.textContent = fmtMoneySigned(profit);
    el.classList.remove('up', 'down');
    el.classList.add(profit >= 0 ? 'up' : 'down');
  }

  $$('.toggle-opt').forEach(btn => {
    btn.addEventListener('click', () => setResultToggle(btn.dataset.result));
  });
  $('#stakeInput').addEventListener('input', updateProfitPreview);
  $('#returnInput').addEventListener('input', updateProfitPreview);

  $('#fabAdd').addEventListener('click', () => openSheet());
  $('#cancelSheetBtn').addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', (e) => {
    if (e.target === sheetOverlay) closeSheet();
  });

  betForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const stake = parseFloat($('#stakeInput').value);
    if (isNaN(stake) || stake < 0) {
      toast('Enter a valid stake');
      return;
    }
    const result = $('#resultInput').value;
    let returnAmount = parseFloat($('#returnInput').value);
    if (isNaN(returnAmount)) returnAmount = result === 'win' ? stake : 0;
    if (result === 'loss') returnAmount = returnAmount || 0;

    const payload = {
      stake,
      returnAmount,
      result,
      notes: $('#notesInput').value.trim(),
      date: $('#dateInput').value || todayStr()
    };

    if (currentEditId) {
      await LedgerDB.update(currentEditId, payload);
      toast('Bet updated');
    } else {
      await LedgerDB.add(payload);
      toast('Bet saved');
    }
    closeSheet();
    await loadBets();
  });

  $('#deleteBetBtn').addEventListener('click', async () => {
    if (!currentEditId) return;
    if (!confirm('Delete this bet? This cannot be undone.')) return;
    await LedgerDB.remove(currentEditId);
    toast('Bet deleted');
    closeSheet();
    await loadBets();
  });

  // tap a history row to edit
  $('#historyList').addEventListener('click', (e) => {
    const row = e.target.closest('.bet-row');
    if (!row) return;
    const bet = bets.find(b => b.id === row.dataset.id);
    if (bet) openSheet(bet);
  });

  // ---------- NAVIGATION ----------
  function switchView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + name).classList.add('active');
    $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    window.scrollTo({ top: 0 });
  }
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $('#menuBtn').addEventListener('click', () => switchView('settings'));

  // ---------- FILTER PILLS ----------
  $('#chartRangePills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    chartRange = btn.dataset.range;
    $$('#chartRangePills .pill').forEach(p => p.classList.toggle('active', p === btn));
    renderChart();
  });

  $('#historyFilterPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    historyFilter = btn.dataset.filter;
    $$('#historyFilterPills .pill').forEach(p => p.classList.toggle('active', p === btn));
    renderHistory();
  });

  $('#searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderHistory();
  });

  // ---------- BACKUP / EXPORT / IMPORT ----------
  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  $('#exportJsonBtn').addEventListener('click', () => {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), bets }, null, 2);
    downloadBlob(data, `ledger-backup-${todayStr()}.json`, 'application/json');
    toast('Backup exported');
  });

  $('#exportCsvBtn').addEventListener('click', () => {
    const header = 'date,stake,return,result,profit,notes';
    const rows = sortedByDate(bets).map(b => {
      const p = profitOf(b);
      const notes = (b.notes || '').replace(/"/g, '""');
      return `${b.date},${b.stake},${b.returnAmount},${b.result},${p.toFixed(2)},"${notes}"`;
    });
    downloadBlob([header, ...rows].join('\n'), `ledger-export-${todayStr()}.csv`, 'text/csv');
    toast('CSV exported');
  });

  $('#importJsonInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.bets;
      if (!Array.isArray(list)) throw new Error('Invalid file format');
      await LedgerDB.bulkImport(list);
      toast(`Restored ${list.length} bets`);
      await loadBets();
    } catch (err) {
      toast('Could not read that backup file');
      console.error(err);
    } finally {
      e.target.value = '';
    }
  });

  $('#wipeBtn').addEventListener('click', async () => {
    if (!confirm('This will permanently delete every bet. Continue?')) return;
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
    await LedgerDB.clearAll();
    toast('All data deleted');
    await loadBets();
  });

  // ---------- INIT ----------
  $('#dateInput').value = todayStr();
  loadBets();

  // ---------- SERVICE WORKER ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
