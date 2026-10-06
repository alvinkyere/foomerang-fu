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
  const sticks = manifest.controls.flatMap((control) =>
    control.type === 'joystick'
      ? [
          <Joystick
            key={control.id}
            controlId={control.id}
            onChange={(value) => onControlChange(control.id, value)}
          />,
        ]
      : [],
  );
  const buttons = manifest.controls.flatMap((control) =>
    control.type === 'button'
      ? [
          <ActionButton
            key={control.id}
            controlId={control.id}
            action={control.action}
            onChange={(pressed) => onButtonChange(control.id, pressed)}
          />,
        ]
      : [],
  );
  return (
    <div className="controls">
      {sticks}
      {buttons.length > 0 && <div className="button-cluster">{buttons}</div>}
    </div>
  );
}
