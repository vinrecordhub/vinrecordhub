import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { LandingScene } from "./scenes/LandingScene";
import { VINEntryScene } from "./scenes/VINEntryScene";
import { CheckoutScene } from "./scenes/CheckoutScene";
import { SuccessScene } from "./scenes/SuccessScene";

const SCENE_FRAMES = 240;
const TRANSITION_FRAMES = 30;

export const Walkthrough: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
        <LandingScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        presentation={fade()}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
        <VINEntryScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        presentation={slide({ direction: "from-right" })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
        <CheckoutScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        presentation={fade()}
      />

      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
        <SuccessScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
