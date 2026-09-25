# Motion Dino v2

Browser Dino runner controlled by the body (MediaPipe pose, jump or squat).
Part of the Stellar Dino app: it is built here and served by the app at `/game/`
(the app's `/play` page embeds it).

## One global game

There are no rooms. The laptop opens `/play` (password-protected) and shows a QR
to `/play?g=CODE`. People scan it, type a name and join; the laptop lists players live.
Everyone shares one Supabase Realtime channel (`dino-game`):

- presence: who is connected
- broadcast `state`: each client's dinos (score, alive, jump height) about 5 times a second
- broadcast `start`: anyone's first jump (or two squats) starts a round for everyone
- broadcast `reset`: sent by the app's control panel; the code changes and players are removed

The app provides `/api/game/host` (current code) and `/api/game/join?g=CODE` (validates the code).

## Build

From the app root, `npm run build:game` installs, builds (`vite build`, base `/game/`) and copies
`dist/` to `public/game/`. Here, `npm run build` copies MediaPipe's wasm from
`@mediapipe/tasks-vision` into `public/mediapipe/wasm/` and builds to `dist/`.
`npm test` checks pose classification, player identity and gesture-based starting.
