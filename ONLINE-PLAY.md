# Guest online play

Select **Online play** to create a private six-character room code, join an invite, or enter **Quickplay**. Quickplay pairs human guests with the same Boardsight preference. Games are casual and untimed. Both players share the host's Boardsight setting. Engine evaluation, opening guidance and takeback are hidden during online play. Finished games can use the existing coach walkthrough and retry positions against the computer.

Run `npm start` with Node 24 or later. There are no npm dependencies. `npm test` runs server rules, matchmaking and recovery checks. Railway's build runs these checks before deployment.

The Node server replaces static Caddy hosting, preserving the Stockfish worker's scoped WebAssembly CSP. It accepts guest bearer tokens, validates moves and versions on the server, and pushes snapshots with authenticated server-sent events. HTTP mutations require a same-origin request. Only explicit public static paths are served; tokens, storage and source/configuration files are excluded. API request bodies and rates are bounded. Guest bearer tokens are hashed in storage; names and game history are visible only to room members.

Attach a Railway volume at `/data`. The server uses `RAILWAY_VOLUME_MOUNT_PATH` automatically, or `ROOM_DATA_DIR` locally. It writes an atomic JSON snapshot after each state change. One **service replica** is required: room membership, live connections and the Quickplay queue are coordinated in one process. Multiple replicas require a shared database/pubsub first. Quickplay searches are ephemeral across server restarts; active rooms and guest seats recover from the volume.

Guest credentials live in sessionStorage for this tab. Refresh reconnects; closing the tab, clearing browser storage or moving between website domains may lose access to the guest seat. There are no accounts, verified identities, ratings, spectators, chat, permanent game archives or competitive anti-cheat guarantees. Waiting rooms expire after 30 minutes; completed rooms after 24 hours; inactive games and unattached guests after seven days. A disconnected opponent's seat stays reserved. The remaining player can resign or agree a draw after reconnection. Timed games and disconnect forfeits can be added later.

Room codes are invitations, not passwords: anyone with an unused code can fill the other seat. Avoid including personal information in guest nicknames. The online panel is masked for optional Clarity recordings.

While a room is active, an authenticated one-second state refresh supplements live events and recovers delayed streams, including when a mobile tab returns to the foreground. Draw offers pause moves on the server until accepted or declined, with a centered decision dialog. Checkmate, resignation and agreed draws share the centered result screen. Online game controls sit directly beneath the board on mobile.

