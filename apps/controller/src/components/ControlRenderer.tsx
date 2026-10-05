import type { ControllerManifest } from '@foomerang/protocol';
import type { Point } from '@foomerang/controller-sdk';
import { Joystick } from './Joystick';

export interface ControlRendererProps {
  readonly manifest: ControllerManifest;
  readonly onControlChange: (controlId: string, value: Point) => void;
}

/**
 * Renders the controller a game ASKED for. There is deliberately no `if (gameId === ...)` here:
 * a different game sends a different manifest and gets a different controller with no change to
 * this code. A control type this build does not know how to draw is skipped, never fatal.
 */
export function ControlRenderer({ manifest, onControlChange }: ControlRendererProps) {
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
        return null;
      })}
    </div>
  );
}
