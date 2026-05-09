import React from "react";
import { Composition } from "remotion";
import { Walkthrough } from "./Walkthrough";

// 4 scenes × 240 frames − 3 transitions × 30 frames = 870 frames = 29s @30fps
const DURATION = 870;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VINRecordHubWalkthrough"
      component={Walkthrough}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
