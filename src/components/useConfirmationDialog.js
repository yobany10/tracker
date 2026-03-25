import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_OPTIONS = {
    title: "Are you sure?",
    message: "Please confirm this action.",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    variant: "default"
};

const useConfirmationDialog = () => {
    const resolverRef = useRef(null);
    const [dialogOptions, setDialogOptions] = useState(null);

    const closeDialog = useCallback((result) => {
        setDialogOptions(null);

        if (resolverRef.current) {
            resolverRef.current(result);
            resolverRef.current = null;
        }
    }, []);

    const confirm = useCallback((options = {}) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialogOptions({
                ...DEFAULT_OPTIONS,
                ...options
            });
        });
    }, []);

    useEffect(() => {
        return () => {
            if (resolverRef.current) {
                resolverRef.current(false);
                resolverRef.current = null;
            }
        };
    }, []);

    const confirmationDialog = dialogOptions ? (
        <div className="modal-backdrop" role="presentation" onClick={() => closeDialog(false)}>
            <div
                aria-labelledby="confirmation-dialog-title"
                aria-modal="true"
                className="modal confirmation-dialog"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
            >
                <div className="modal__header">
                    <div>
                        <p className="section-label">Confirm action</p>
                        <h3 id="confirmation-dialog-title">{dialogOptions.title}</h3>
                    </div>
                    <button
                        aria-label="Close confirmation dialog"
                        className="modal__close"
                        onClick={() => closeDialog(false)}
                        type="button"
                    >
                        ×
                    </button>
                </div>

                <div className="modal__form">
                    <p className="status-message confirmation-dialog__message">{dialogOptions.message}</p>

                    <div className="modal__actions">
                        <button className="button button--secondary" onClick={() => closeDialog(false)} type="button">
                            {dialogOptions.cancelLabel}
                        </button>
                        <button
                            className={dialogOptions.variant === "danger" ? "button button--ghost-danger" : "button button--primary"}
                            onClick={() => closeDialog(true)}
                            type="button"
                        >
                            {dialogOptions.confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    return {
        confirm,
        confirmationDialog
    };
};

export default useConfirmationDialog;