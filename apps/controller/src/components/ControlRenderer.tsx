import type { ControllerContext, ControllerManifest, SecondaryAction } from '@foomerang/protocol';
import type { Point } from '@foomerang/controller-sdk';
import { ActionButton } from './ActionButton';
import { meaningOf } from '../labels';
import { Joystick } from './Joystick';

export interface ControlRendererProps {
  readonly manifest: ControllerManifest;
  /** What the controls mean right now (the host's say). Default: the game itself. */
  readonly context?: ControllerContext;
  readonly secondaryAction?: SecondaryAction;
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
  context = 'GAMEPLAY',
  secondaryAction = null,
  onControlChange,
  onButtonChange,
}: ControlRendererProps) {
  const sticks = manifest.controls.flatMap((control) =>
    control.type === 'joystick'
      ? [
          <Joystick
            key={control.id}
            controlId={control.id}
            label={meaningOf(control, context, secondaryAction) ?? null}
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
            label={meaningOf(control, context, secondaryAction) ?? null}
            onChange={(pressed) => onButtonChange(control.id, pressed)}
          />,
        ]
      : [],
  );
  // Three action buttons need a different arrangement of the same thumb area. A fact about the actions
  // the manifest asks for, never about which game asked.
  const hasTertiary = manifest.controls.some(
    (control) => control.type === 'button' && control.action === 'TERTIARY',
  );
  return (
    <div className="controls" data-context={context}>
      {sticks}
      {buttons.length > 0 && (
        <div className="button-cluster" data-layout={hasTertiary ? 'tertiary' : undefined}>
          {buttons}
        </div>
      )}
    </div>
  );
}
