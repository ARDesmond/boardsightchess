'use strict';
(() => {
  const panel = document.createElement('section');
  panel.id = 'online-panel'; panel.className = 'card hidden'; panel.setAttribute('aria-label', 'Online play');
  panel.setAttribute('data-clarity-mask', 'true');
  panel.innerHTML = `
    <h2>Play together</h2>
    <p class="tip">Guest games · Casual · Untimed</p>
    <p id="online-connection" class="online-connection" role="status">Connect to play with a friend or find an opponent.</p>
    <p id="online-error" class="online-error hidden" role="alert"></p>
    <div id="online-lobby">
      <div class="control-group"><label for="online-name">Your nickname</label><input id="online-name" maxlength="24" placeholder="Guest" autocomplete="off"></div>
      <div class="control-group"><label for="online-sight">Boardsight for both players</label><select id="online-sight"><option value="on">Allowed</option><option value="off">Off · Classic chess</option></select></div>
      <div class="online-choice"><h3>Invite a friend</h3>
        <div class="control-group"><label for="online-color">Your color</label><select id="online-color"><option value="random">Random</option><option value="w">White</option><option value="b">Black</option></select></div>
        <button id="online-create" class="primary-button">Create room</button>
      </div>
      <div class="online-choice"><h3>Have a room code?</h3>
        <div class="control-group"><label for="online-code">Room code</label><input id="online-code" maxlength="6" placeholder="ABC234" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
        <button id="online-join">Join room</button>
      </div>
      <div class="online-choice"><h3>Find someone to play</h3><button id="online-quick" class="primary-button">Quickplay</button><p class="tip">Matches another person using the same Boardsight setting. Keep this tab open while searching.</p></div>
    </div>
    <div id="online-search" class="hidden"><p class="online-searching">Looking for an opponent…</p><p class="tip">Your game starts when another player joins Quickplay. You can invite a friend with a room code instead.</p><button id="online-cancel">Cancel search</button></div>
    <div id="online-room" class="hidden">
      <div class="online-invite"><span>Room code</span><strong id="online-room-code"></strong><div class="button-pair"><button id="online-copy-code">Copy code</button><button id="online-copy-link">Copy invite</button></div></div>
      <p id="online-seats"></p><p id="online-rules" class="tip"></p><p id="online-presence" role="status"></p>
      <div id="online-game-actions" class="button-pair"><button id="online-draw">Offer draw</button><button id="online-resign">Resign</button></div>
      <dialog id="online-resign-confirm" aria-labelledby="online-resign-title"><h2 id="online-resign-title">Resign this game?</h2><p>Your opponent will win.</p><div class="button-pair"><button id="online-resign-yes">Yes, resign</button><button id="online-resign-no">Keep playing</button></div></dialog>
      <dialog id="online-draw-response" aria-labelledby="online-draw-title"><h2 id="online-draw-title">Your opponent offered a draw</h2><p>Play is paused. Accept to end this game in a draw, or decline to continue playing.</p><div class="button-pair"><button id="online-draw-yes" class="primary-button">Accept draw</button><button id="online-draw-no">Decline</button></div><p id="online-draw-connection" class="tip" role="status"></p></dialog>
      <p id="online-draw-pending" class="tip hidden">Draw offered. Play is paused until your opponent accepts or declines.</p>
      <div id="online-rematch-controls" class="hidden"><button id="online-rematch" class="primary-button">Rematch</button><p id="online-rematch-status" role="status"></p></div><dialog id="online-rematch-response" aria-labelledby="online-rematch-title"><h2 id="online-rematch-title">Play again?</h2><p>Your opponent requested a rematch. You will swap colors and keep the same room and Boardsight setting.</p><div class="button-pair"><button id="online-rematch-yes" class="primary-button">Accept rematch</button><button id="online-rematch-no">Decline rematch</button></div></dialog><button id="online-leave">Back to lobby</button>
      <p class="tip">Refresh this tab to reconnect. Closing it may lose your guest seat. Replays and tips unlock after the game ends.</p>
    </div>`;
  $('.side-panel').prepend(panel);
  const boardControls = document.createElement('section');
  boardControls.id = 'online-board-controls'; boardControls.className = 'card hidden';
  boardControls.setAttribute('aria-label', 'Online game controls');
  boardControls.setAttribute('data-clarity-mask', 'true');
  boardControls.innerHTML = '<p id="online-board-summary" role="status"></p>';
  for (const id of ['online-game-actions', 'online-draw-pending', 'online-rematch-controls', 'online-leave']) boardControls.append($('#' + id));
  $('.board-stage').after(boardControls);
  let token = null;
  try { token = sessionStorage.getItem('boardsight-guest'); $('#online-name').value = sessionStorage.getItem('boardsight-nickname') || ''; } catch {}
  let started = false, connected = false, busy = false, state = { room: null, queued: false }, displayKey = null;
  let stateEpoch = 0, refreshing = false;
  const setError = message => { $('#online-error').textContent = message || ''; $('#online-error').classList.toggle('hidden', !message); };
  function accept(next) {
    if (next.room && state.room?.code === next.room.code && next.room.version < state.room.version) return;
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    ++stateEpoch;
    if (mode === 'online' && !reviewSession) restoreBoard();
    else render();
  }
  function restoreBoard() {
    const room = state.room, key = room ? room.code + ':' + (room.round || 1) + ':' + room.moves.join(' ') : 'lobby';
    if (displayKey !== key || (room && game.fen() !== room.fen)) {
      invalidate(); clearSelection();
      game = new Chess(); gameRootFen = game.fen(); gameStartTurn = 'w'; customPosition = false; lastMove = null;
      if (room) for (const move of room.moves) lastMove = game.move(move);
      if (room && game.fen() !== room.fen) throw new Error('The board could not synchronize. Refresh to reconnect.');
      const newRoom = !displayKey || !room || !displayKey.startsWith(room.code + ':' + (room.round || 1) + ':');
      playerColor = room?.yourColor || 'w'; computerColor = opposite(playerColor); if(newRoom)orientation = playerColor;
      checkmateShownFen = null; displayKey = key;
    }
    renderBoard();
  }
  function canMove() { return connected && !busy && state.room?.status === 'playing' && !state.room.drawOffer && game.turn() === state.room.yourColor; }
  function statusText() {
    const room = state.room;
    if (room?.status === 'finished') return room.result.winner ? colorName(room.result.winner) + ' wins by ' + room.result.reason + '.' : 'Draw by ' + room.result.reason + '.';
    if (!connected) return 'Reconnecting to online play…';
    if (state.queued) return 'Quickplay · Looking for an opponent';
    if (!room) return 'Online play · Create a room, join, or find an opponent';
    if (room.status === 'waiting') return 'Room ' + room.code + ' · Waiting for a friend';
    if (room.drawOffer) return 'Play paused · Waiting for the draw decision';
    return colorName(game.turn()) + ' to move' + (game.inCheck() ? ' — check!' : '') + (game.turn() === room.yourColor ? ' · Your turn' : ' · Opponent’s turn');
  }
  function render() {
    panel.classList.toggle('hidden', mode !== 'online' || !!reviewSession);
    const room = state.room;
    const activeOnline = mode === 'online' && !reviewSession && !!room;
    boardControls.classList.toggle('hidden', !activeOnline);
    $('.app-shell').classList.toggle('online-active', activeOnline);
    $('#online-board-summary').textContent = room ? 'You play ' + colorName(room.yourColor) + ' · ' + (room.status === 'waiting' ? 'Waiting for a friend' : room.status === 'finished' ? statusText() : room.drawOffer ? 'Play paused for draw decision' : room.opponentConnected ? 'Opponent connected' : 'Opponent reconnecting') : '';
    const finished = activeOnline && room.status === 'finished';
    const pending = finished && !!room.rematchOffer;
    const ownRequest = pending && room.rematchOffer === room.yourColor;
    const rematchText = !room?.opponentAvailable ? 'Your opponent has left the room.' : ownRequest ? 'Rematch requested. Waiting for your opponent.' : pending ? 'Your opponent requested a rematch.' : 'Play again with colors swapped.';
    $('#online-rematch-controls').classList.toggle('hidden', !finished);
    for (const selector of ['#online-rematch', '#checkmate-rematch']) {
      const button = $(selector); button.classList.toggle('hidden', !finished);
      button.textContent = ownRequest ? 'Cancel rematch request' : pending ? 'Respond to rematch' : 'Rematch';
      button.disabled = busy || !connected || !room?.opponentAvailable;
    }
    for (const selector of ['#online-rematch-status', '#checkmate-rematch-status']) { $(selector).textContent = rematchText; $(selector).classList.toggle('hidden', !finished); }
    const rematchDialog = $('#online-rematch-response');
    if (pending && !ownRequest) { hideCheckmateResult(); if (!rematchDialog.open) rematchDialog.showModal(); }
    else if (rematchDialog.open) rematchDialog.close();
    const drawDialog = $('#online-draw-response');
    const incomingDraw = mode === 'online' && !reviewSession && room?.status === 'playing' && room.drawOffer && room.drawOffer !== room.yourColor;
    if (incomingDraw && !drawDialog.open) drawDialog.showModal();
    else if (!incomingDraw && drawDialog.open) drawDialog.close();
    $('#online-draw-connection').textContent = connected ? '' : 'Reconnecting… Your decision will be available when connected.';
    $('#online-connection').textContent = connected ? 'Connected · Moves stay in sync automatically' : 'Connecting… Your game will resume here.';
    $('#online-connection').classList.toggle('is-connected', connected);
    $('#online-lobby').classList.toggle('hidden', !!room || state.queued);
    $('#online-search').classList.toggle('hidden', !state.queued);
    $('#online-room').classList.toggle('hidden', !room);
    const noSight = mode === 'online' && !room?.sight;
    $('#sight-toggle').disabled = noSight; mapModeEl.disabled = noSight; $('#inspect-toggle').disabled = noSight;
    if (noSight) $('#inspect-toggle').setAttribute('aria-pressed', 'false');
    $('#square-details').closest('.card')?.classList.toggle('hidden', noSight);
    $('.legend').closest('.card')?.classList.toggle('hidden', noSight);
    if (room) {
      $('#online-room-code').textContent = room.code;
      $('#online-seats').textContent = 'White: ' + (room.white || 'Waiting for opponent') + ' · Black: ' + (room.black || 'Waiting for opponent') + '\nYou play ' + colorName(room.yourColor) + '.';
      $('#online-rules').textContent = (room.sight ? 'Boardsight allowed for both players' : 'Classic chess · Boardsight off') + ' · Untimed · No rating changes';
      $('#online-presence').textContent = room.status === 'waiting' ? 'Share this code or invite link with your friend.' : room.status === 'finished' ? statusText() : room.opponentConnected ? 'Opponent connected' : 'Opponent disconnected. Their seat stays reserved so they can reconnect.';
      $('#online-game-actions').classList.toggle('hidden', room.status !== 'playing');
      $('#online-leave').classList.toggle('hidden', room.status === 'playing');
      $('#online-leave').textContent = room.status === 'waiting' ? 'Cancel room' : 'Back to lobby';
      $('#online-draw-pending').classList.toggle('hidden', room.drawOffer !== room.yourColor);
      $('#online-draw').disabled = !!room.drawOffer || busy || !connected;
    }
    if ($('#online-resign-confirm').open && (!activeOnline || room.status !== 'playing')) $('#online-resign-confirm').close();
    for (const id of ['create', 'join', 'quick', 'cancel', 'resign', 'resign-yes', 'draw-yes', 'draw-no', 'leave', 'rematch-yes', 'rematch-no']) $('#online-' + id).disabled = busy || !connected;
  }
  async function api(route, input) {
    const response = await fetch('/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(input || {}), cache: 'no-store' });
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error || 'Unable to connect. Try again shortly.'); error.status = response.status; throw error; }
    return value;
  }
  async function command(route, input = {}) {
    if (busy || !connected) return;
    busy = true; setError(''); clearSelection(); renderBoard();
    try { accept(await api(route, input)); }
    catch (error) {
      setError(error.message);
      try { const response = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }); if (response.ok) accept(await response.json()); } catch {}
    } finally { busy = false; if (mode === 'online' && !reviewSession) renderBoard(); else render(); }
  }
  // SSE remains the primary transport. A bounded independent read catches an
  // update held by an intermediary or a backgrounded browser stream.
  async function refreshState() {
    if (!started || !token || refreshing || busy || mode !== 'online' || reviewSession || (!state.queued && !['waiting', 'playing', 'finished'].includes(state.room?.status))) return;
    refreshing = true;
    const epoch = stateEpoch, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        const next = await response.json();
        // Never let a read begun before a command/event undo that newer state.
        if (epoch === stateEpoch && !busy) accept(next);
      }
    } catch {} finally { clearTimeout(timeout); refreshing = false; }
  }
  setInterval(refreshState, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshState(); });
  async function streamLoop() {
    let delay = 1000;
    while (started) {
      const controller = new AbortController(); let lastReceived = Date.now();
      const watchdog = setInterval(() => { if (Date.now() - lastReceived > 45000) controller.abort(); }, 15000);
      try {
        const response = await fetch('/api/events', { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) { const message = await response.json(); throw new Error(message.error || 'Unable to reconnect.'); }
        connected = true; delay = 1000; setError(''); render(); if (mode === 'online' && !reviewSession) renderStatus();
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const chunk = await reader.read(); if (chunk.done) throw new Error('Connection interrupted.');
          lastReceived = Date.now(); buffer += decoder.decode(chunk.value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const line = event.split('\n').find(value => value.startsWith('data: '));
            if (line) accept(JSON.parse(line.slice(6)));
          }
          if (buffer.length > 1048576) throw new Error('Connection interrupted.');
        }
      } catch (error) {
        connected = false; clearSelection(); if (mode === 'online' && !reviewSession) renderBoard(); else render();
      } finally { clearInterval(watchdog); controller.abort(); }
      await new Promise(resolve => setTimeout(resolve, delay)); delay = Math.min(delay * 2, 8000);
    }
  }
  async function ensureConnected() {
    if (started) return;
    started = true; render();
    try {
      if (token) {
        const check = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        if (check.status === 401) token = null;
        else if (!check.ok) throw new Error('Online play is unavailable. Try Online play again shortly.');
        else accept(await check.json());
      }
      if (!token) { token = (await api('session')).token; try { sessionStorage.setItem('boardsight-guest', token); } catch {} }
      streamLoop();
    } catch (error) { started = false; setError(error.message); render(); }
  }
  function enter() {
    displayKey = null; evalEnabled = false; guideEnabled = false; stopEvaluation();
    $('#eval-toggle').textContent = 'Evaluation OFF'; $('#eval-toggle').setAttribute('aria-pressed', 'false');
    $('#guide-toggle').textContent = 'Opening guidance OFF'; $('#guide-toggle').setAttribute('aria-pressed', 'false');
    restoreBoard(); ensureConnected();
  }
  const nickname = () => { const name = $('#online-name').value.trim(); try { sessionStorage.setItem('boardsight-nickname', name); } catch {} return name; };
  const preferences = () => ({ name: nickname(), sight: $('#online-sight').value === 'on' });
  $('#online-create').onclick = () => command('create', { ...preferences(), color: $('#online-color').value });
  $('#online-join').onclick = () => command('join', { code: $('#online-code').value, name: nickname() });
  $('#online-code').addEventListener('keydown', event => { if (event.key === 'Enter') $('#online-join').click(); });
  $('#online-quick').onclick = () => command('quickplay', preferences());
  $('#online-cancel').onclick = () => command('cancel'); $('#online-leave').onclick = () => command('leave');
  const action = value => command('action', { action: value, version: state.room?.version });
  $('#online-draw').onclick = () => action('offer-draw'); $('#online-draw-yes').onclick = () => action('accept-draw'); $('#online-draw-no').onclick = () => action('decline-draw');
  $('#online-draw-response').addEventListener('cancel', event => event.preventDefault());
  $('#online-resign').onclick = () => $('#online-resign-confirm').showModal();
  $('#online-resign-no').onclick = () => $('#online-resign-confirm').close();
  $('#online-resign-yes').onclick = () => { $('#online-resign-confirm').close(); action('resign'); };
  function requestRematch() {
    hideCheckmateResult();
    if (state.room?.rematchOffer && state.room.rematchOffer !== state.room.yourColor) { render(); return; }
    command('rematch', { action: state.room?.rematchOffer ? 'cancel' : 'offer', version: state.room?.version });
  }
  $('#online-rematch').onclick = requestRematch;
  $('#online-rematch-yes').onclick = () => command('rematch', { action: 'accept', version: state.room?.version });
  $('#online-rematch-no').onclick = () => command('rematch', { action: 'decline', version: state.room?.version });
  $('#online-rematch-response').addEventListener('cancel', event => event.preventDefault());
  async function copy(value, button) {
    try { await navigator.clipboard.writeText(value); const old = button.textContent; button.textContent = 'Copied!'; setTimeout(() => button.textContent = old, 1800); }
    catch { setError('Copy this code to invite your friend: ' + state.room.code); }
  }
  $('#online-copy-code').onclick = event => copy(state.room.code, event.currentTarget);
  $('#online-copy-link').onclick = event => { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', state.room.code); copy(url.href, event.currentTarget); };
  onlineController = { get state() { return state; }, canMove, statusText, render, enter, command, requestRematch,
    submitMove: move => command('move', { move, version: state.room?.version }) };
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
    try { sessionStorage.setItem('boardsight-last-mode', button.dataset.mode); } catch {}
  });
  const invited = new URL(location.href).searchParams.get('room');
  if (invited && /^[A-Za-z2-9]{6}$/.test(invited)) { $('#online-code').value = invited.toUpperCase(); $('[data-mode="online"]').click(); }
  else if (token) {
    try { if (sessionStorage.getItem('boardsight-last-mode') === 'online') $('[data-mode="online"]').click(); } catch {}
  }
})();
