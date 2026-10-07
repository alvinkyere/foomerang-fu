import type { ControlDescriptor, ControllerContext, SecondaryAction } from '@foomerang/protocol';

/**
 * What a physical control is CALLED right now. A pure rule by the control's generic ACTION and the
 * host's context: it never looks at which game the manifest came from or which screen the host is
 * showing. In GAMEPLAY a control keeps the game's own name; everywhere else the same thumbs mean
 * navigate / select / back / secondary.
 *
 * `undefined` means "nothing to say": the control is still there (muscle memory) but unlabelled.
 */
export function meaningOf(
  control: ControlDescriptor,
  context: ControllerContext,
  secondaryAction: SecondaryAction,
): string | undefined {
  if (context === 'GAMEPLAY') return control.id;
  if (control.type === 'joystick') return 'NAVIGATE';
  switch (control.action) {
    case 'PRIMARY':
      return 'SELECT';
    case 'SECONDARY':
      return 'BACK';
    case 'TERTIARY':
      return secondaryAction?.label;
  }
}

/** The short badge in the header: GAMEPLAY needs none. */
export const CONTEXT_BADGE: Readonly<Record<ControllerContext, string | undefined>> = {
  GAMEPLAY: undefined,
  CONSOLE: 'MENU',
  PAUSED: 'PAUSED',
  RESULTS: 'RESULTS',
};
