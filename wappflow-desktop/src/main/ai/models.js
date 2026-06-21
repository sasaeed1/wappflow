'use strict';

// Vision model registry. Each entry declares the on-disk file, where to fetch it
// (pinned, with fallbacks — URLs drift, so fetch-models also prints manual steps),
// and its I/O so the analyzer's pre/post-processing is correct by construction.
// Models are NOT committed (size/licence); run `npm run fetch-models` to get them.

const FACE_DETECT = {
  key: 'face_detect',
  file: 'ultraface-rfb-320.onnx',
  // UltraFace RFB-320 (Linzaer / ONNX Model Zoo). Input 1x3x240x320 RGB, (px-127)/128.
  // ONNX export bakes in the prior-box decode, so outputs are already-decoded:
  //   scores: [1, N, 2] softmax (bg, face) ; boxes: [1, N, 4] normalized [x1,y1,x2,y2]
  // → just threshold scores[:,1] + NMS. (No manual anchor decode.)
  input: { w: 320, h: 240, mean: 127, scale: 128, channelOrder: 'rgb' },
  scoreThresh: 0.7,
  urls: [
    'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx',
    'https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx',
  ],
  manual: 'ONNX Model Zoo → vision/body_analysis/ultraface → version-RFB-320.onnx. Save as ai/models/ultraface-rfb-320.onnx',
};

const FACE_EXPRESSION = {
  key: 'face_expression',
  file: 'emotion-ferplus.onnx',
  // FER+ (ONNX Model Zoo). Input [1,1,64,64] grayscale, raw 0..255. Output [1,8]
  // logits → softmax over [neutral, happiness, surprise, sadness, anger, disgust,
  // fear, contempt]; smile = happiness (index 1).
  input: { size: 64 },
  emotions: ['neutral', 'happiness', 'surprise', 'sadness', 'anger', 'disgust', 'fear', 'contempt'],
  happyIndex: 1,
  urls: [
    'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx',
    'https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx',
  ],
  manual: 'ONNX Model Zoo → vision/body_analysis/emotion_ferplus → emotion-ferplus-8.onnx. Save as ai/models/emotion-ferplus.onnx',
};

// Bump VISION_MODEL_VERSION when the produced score set changes so re-analysis is
// intentional. Kept at the server registry value by default (additive scoring);
// the desktop offers a force re-analyze to backfill faces onto old assets.
const VISION_MODEL_VERSION = 'vision-v0';

module.exports = { FACE_DETECT, FACE_EXPRESSION, VISION_MODEL_VERSION, ALL: [FACE_DETECT, FACE_EXPRESSION] };
