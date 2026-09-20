# The relay server is no longer required

As of **BETA 0.3** multiplayer runs peer-to-peer over WebRTC using PeerJS.
One player hosts a room and gets a five-character code; everyone else types
it in. The host's browser runs the room logic itself (`src/net/room.js`),
so there is nothing to install and nothing to deploy.

This folder is the old WebSocket relay, kept because the protocol is
identical and it is still a reasonable option if you would rather run a
dedicated server — for a persistent world, or for players behind a NAT
strict enough that WebRTC cannot get through.

Nothing in the game points at it any more. If you want it back, wire a
`WebSocket` into `NetClient` in place of `PeerLink`; `src/net/room.js` is
the same room logic this server runs, so the two are interchangeable.

```bash
npm install && npm start      # listens on :3496
```
