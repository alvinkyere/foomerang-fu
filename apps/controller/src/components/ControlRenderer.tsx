import type { ControllerManifest } from '@foomerang/protocol';
import type { Point } from '@foomerang/controller-sdk';
import { ActionButton } from './ActionButton';
import { Joystick } from './Joystick';

export interface ControlRendererProps {
  readonly manifest: ControllerManifest;
  readonly onControlChange: (controlId: string, value: Point) => void;
  readonly onButtonChange: (controlId: string, pressed: boolean) => void;
}

/**
 * Renders the controller a game ASKED for. There is deliberately no `if (gameId === ...)` here:
 * a different game sends a different manifest and gets a different controller with no change to
 * this code. A control type this build does not know how to draw is skipped, never fatal.
 */
export function ControlRenderer({
  manifest,
  onControlChange,
  onButtonChange,
}: ControlRendererProps) {
  return (
    <div className="controls">
      {manifest.controls.map((control) => {
        if (control.type === 'joystick') {
          return (
            <Joystick
              key={control.id}
              controlId={control.id}
              onChange={(value) => onControlChange(control.id, value)}
            />
          );
        }
        if (control.type === 'button') {
          return (
            <ActionButton
              key={control.id}
              controlId={control.id}
              onChange={(pressed) => onButtonChange(control.id, pressed)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
