import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  readonly id: string;
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** Destructive confirms start on Cancel, so a stray press never destroys anything. */
  readonly destructive?: boolean;
  readonly loading?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  id,
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      id={id}
      open={open}
      title={title}
      onClose={onCancel}
      initialFocus={destructive ? `${id}-cancel` : `${id}-confirm`}
      footer={
        <>
          <Button id={`${id}-cancel`} variant="secondary" onPress={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            id={`${id}-confirm`}
            variant={destructive ? 'danger' : 'primary'}
            loading={loading}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="modal__message">{message}</p>
    </Modal>
  );
}
