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
      <div id="online-resign-confirm" class="hidden online-choice"><p>Resign this game? Your opponent will win.</p><div class="button-pair"><button id="online-resign-yes">Yes, resign</button><button id="online-resign-no">Keep playing</button></div></div>
      <div id="online-draw-response" class="hidden online-choice"><p>Your opponent offered a draw.</p><div class="button-pair"><button id="online-draw-yes">Accept draw</button><button id="online-draw-no">Decline</button></div></div>
      <p id="online-draw-pending" class="tip hidden">Draw offered. Waiting for your opponent.</p>
      <button id="online-leave">Back to lobby</button>
      <p class="tip">Refresh this tab to reconnect. Closing it may lose your guest seat. Replays and tips unlock after the game ends.</p>
    </div>`;
  $('.side-panel').prepend(panel);
  let token = null;
  try { token = sessionStorage.getItem('boardsight-guest'); $('#online-name').value = sessionStorage.getItem('boardsight-nickname') || ''; } catch {}
  let started = false, connected = false, busy = false, state = { room: null, queued: false }, displayKey = null;
  const setError = message => { $('#online-error').textContent = message || ''; $('#online-error').classList.toggle('hidden', !message); };
  function accept(next) {
    if (next.room && state.room?.code === next.room.code && next.room.version < state.room.version) return;
    state = next;
    if (mode === 'online' && !reviewSession) restoreBoard();
    else render();
  }
  function restoreBoard() {
    const room = state.room, key = room ? room.code + ':' + room.moves.join(' ') : 'lobby';
    if (displayKey !== key || (room && game.fen() !== room.fen)) {
      invalidate(); clearSelection();
      game = new Chess(); gameRootFen = game.fen(); gameStartTurn = 'w'; customPosition = false; lastMove = null;
      if (room) for (const move of room.moves) lastMove = game.move(move);
      if (room && game.fen() !== room.fen) throw new Error('The board could not synchronize. Refresh to reconnect.');
      const newRoom = !displayKey || !room || !displayKey.startsWith(room.code + ':');
      playerColor = room?.yourColor || 'w'; computerColor = opposite(playerColor); if(newRoom)orientation = playerColor;
      checkmateShownFen = null; displayKey = key;
    }
    renderBoard();
  }
  function canMove() { return connected && !busy && state.room?.status === 'playing' && game.turn() === state.room.yourColor; }
  function statusText() {
    const room = state.room;
    if (room?.status === 'finished') return room.result.winner ? colorName(room.result.winner) + ' wins by ' + room.result.reason + '.' : 'Draw by ' + room.result.reason + '.';
    if (!connected) return 'Reconnecting to online play…';
    if (state.queued) return 'Quickplay · Looking for an opponent';
    if (!room) return 'Online play · Create a room, join, or find an opponent';
    if (room.status === 'waiting') return 'Room ' + room.code + ' · Waiting for a friend';
    return colorName(game.turn()) + ' to move' + (game.inCheck() ? ' — check!' : '') + (game.turn() === room.yourColor ? ' · Your turn' : ' · Opponent’s turn');
  }
  function render() {
    panel.classList.toggle('hidden', mode !== 'online' || !!reviewSession);
    const room = state.room;
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
      $('#online-draw-response').classList.toggle('hidden', room.status !== 'playing' || !room.drawOffer || room.drawOffer === room.yourColor);
      $('#online-draw-pending').classList.toggle('hidden', room.drawOffer !== room.yourColor);
      $('#online-draw').disabled = !!room.drawOffer || busy || !connected;
      if (room.status !== 'playing') $('#online-resign-confirm').classList.add('hidden');
    }
    for (const id of ['create', 'join', 'quick', 'cancel', 'resign', 'resign-yes', 'draw-yes', 'draw-no', 'leave']) $('#online-' + id).disabled = busy || !connected;
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
  $('#online-resign').onclick = () => $('#online-resign-confirm').classList.remove('hidden');
  $('#online-resign-no').onclick = () => $('#online-resign-confirm').classList.add('hidden');
  $('#online-resign-yes').onclick = () => { $('#online-resign-confirm').classList.add('hidden'); action('resign'); };
  async function copy(value, button) {
    try { await navigator.clipboard.writeText(value); const old = button.textContent; button.textContent = 'Copied!'; setTimeout(() => button.textContent = old, 1800); }
    catch { setError('Copy this code to invite your friend: ' + state.room.code); }
  }
  $('#online-copy-code').onclick = event => copy(state.room.code, event.currentTarget);
  $('#online-copy-link').onclick = event => { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', state.room.code); copy(url.href, event.currentTarget); };
  onlineController = { get state() { return state; }, canMove, statusText, render, enter, command,
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
