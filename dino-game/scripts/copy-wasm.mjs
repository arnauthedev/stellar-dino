// MediaPipe's WASM runtime ships with @mediapipe/tasks-vision; copy it next to
// the model instead of committing 32 MB of binaries.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/mediapipe/wasm", { recursive: true });
cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });
console.log("copied MediaPipe wasm -> public/mediapipe/wasm");
