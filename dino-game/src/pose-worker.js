import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

let landmarker;
let delegate = "GPU";

async function initialize(origin) {
  const files = await FilesetResolver.forVisionTasks(`${origin}/mediapipe/wasm`, true);
  const modelAssetPath = `${origin}/mediapipe/pose_landmarker_lite.task`;
  const options = {
    runningMode: "VIDEO",
    numPoses: 4,
    outputSegmentationMasks: false,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    landmarker = await PoseLandmarker.createFromOptions(files, {
      ...options, baseOptions: { modelAssetPath, delegate: "GPU" },
    });
  } catch (error) {
    console.warn("GPU tracking unavailable; using a background CPU worker.", error);
    delegate = "CPU";
    // Reload the module factory after a failed graph initialization.
    files.wasmLoaderPath += `?fallback=${Date.now()}`;
    landmarker = await PoseLandmarker.createFromOptions(files, {
      ...options, baseOptions: { modelAssetPath, delegate: "CPU" },
    });
  }
  self.postMessage({ type: "ready", delegate });
}

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try { await initialize(data.origin); }
    catch (error) { self.postMessage({ type: "error", message: error.message || String(error) }); }
    return;
  }
  if (data.type !== "frame") return;
  const { bitmap, timestamp } = data;
  try {
    const begin = performance.now();
    const result = landmarker.detectForVideo(bitmap, timestamp);
    self.postMessage({ type: "result", landmarks: result.landmarks, timestamp, inferenceMs: performance.now() - begin, delegate });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message || String(error) });
  } finally { bitmap.close(); }
};
