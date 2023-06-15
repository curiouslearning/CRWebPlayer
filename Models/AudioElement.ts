// AudioElement type that describes the audio element model

import { AudioTimestamps } from "./AudioTimestamps";

export type AudioElement = {
    domID: string;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    audioSrc: string;
    audioTimestamps: AudioTimestamps;
    glowColor: string;
    styles: string;
};
