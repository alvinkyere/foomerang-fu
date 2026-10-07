import { useState } from 'react';
import { Button, ConfirmDialog, ControlHintBar, Modal } from '../components';

export interface PauseMenuProps {
  readonly open: boolean;
  /** Carry on where the match stood. Back does this too: there is always a way out. */
  readonly onResume: () => void;
  /** End the match for everyone and take the room back to its lobby (confirmed on the TV first). */
  readonly onLeave: () => void;
}

/**
 * The match is frozen and somebody — any phone, or the TV itself — opened this. It is one shared
 * menu on the TV: every device moves the same focus. Leaving ends the match for EVERYONE, so it is
 * confirmed here and the confirmation starts on Cancel: a stray press never ends a match.
 */
export function PauseMenu({ open, onResume, onLeave }: PauseMenuProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Modal id="pause" open={open} title="Paused" onClose={onResume} initialFocus="pause-resume">
        <div className="pause-menu__actions">
          <Button id="pause-resume" variant="primary" onPress={onResume}>
            Resume
          </Button>
          <Button id="pause-leave" variant="secondary" onPress={() => setConfirming(true)}>
            Return to Lobby
          </Button>
        </div>
        <ControlHintBar
          hints={[
            { action: 'move-v', label: 'Move' },
            { action: 'select', label: 'Choose' },
            { action: 'back', label: 'Resume' },
          ]}
        />
      </Modal>
      <ConfirmDialog
        id="leave-match"
        open={open && confirming}
        destructive
        title="Leave this match?"
        message="The match ends for everyone and the room goes back to its lobby."
        confirmLabel="Return to Lobby"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onLeave();
        }}
      />
    </>
  );
}
