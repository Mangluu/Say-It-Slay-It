// One normalized control state per player. Every InputSource (keyboard, gamepad,
// phone) emits this, so combat code never knows where input came from.
export interface InputState {
  axisX: number; // -1 .. +1
  jump: boolean;
  throw: boolean;
  dash: boolean;
  special: boolean;
}

export interface InputSource {
  readonly id: string;
  sample(playerIndex: number): InputState;
  dispose?(): void;
}

export const NEUTRAL: InputState = {
  axisX: 0, jump: false, throw: false, dash: false, special: false,
};
