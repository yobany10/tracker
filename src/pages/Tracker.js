import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import LogFieldsEditor from "../components/LogFieldsEditor";
import useConfirmationDialog from "../components/useConfirmationDialog";
import {
    createTrackerLog,
    deleteTrackerLog,
    getTracker,
    listTrackerLogs,
    updateTracker,
    updateTrackerLog
} from "../services/firestore";

const cloneLogFields = (fields = []) => {
    return fields.map((field) => ({
        ...field,
        options: Array.isArray(field.options) ? [...field.options] : []
    }));
};

const createTrackerDraft = (tracker) => ({
    name: tracker?.name || "",
    logFields: cloneLogFields(tracker?.logFields || [])
});

const parseDateValue = (value) => {
    if (typeof value !== "string") {
        return new Date(value);
    }

    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    return new Date(value);
};

const formatDateTime = (value) => {
    if (!value) {
        return "Not set";
    }

    if (typeof value?.toDate === "function") {
        return new Intl.DateTimeFormat("en-US", {
            month: "numeric",
            day: "numeric",
            year: "2-digit",
            hour: "numeric",
            minute: "2-digit"
        }).format(value.toDate());
    }

    const parsedDate = parseDateValue(value);

    if (Number.isNaN(parsedDate.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit"
    }).format(parsedDate);
};

const formatTimeValue = (value) => {
    if (typeof value !== "string") {
        return String(value);
    }

    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

    if (!match) {
        return value;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
        return value;
    }

    const parsedDate = new Date(2000, 0, 1, hours, minutes);

    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).format(parsedDate).toLowerCase();
};

const formatDateValue = (value) => {
    if (!value) {
        return "Not provided";
    }

    if (typeof value?.toDate === "function") {
        return new Intl.DateTimeFormat("en-US", {
            month: "numeric",
            day: "numeric",
            year: "2-digit"
        }).format(value.toDate());
    }

    const parsedDate = parseDateValue(value);

    if (Number.isNaN(parsedDate.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit"
    }).format(parsedDate);
};

const formatFieldValue = (value, field) => {
    if (value === null || value === undefined || value === "") {
        return "Not provided";
    }

    if (field?.type === "checkbox") {
        return value ? "Yes" : "No";
    }

    if (field?.type === "time") {
        return formatTimeValue(value);
    }

    if (field?.type === "date") {
        return formatDateValue(value);
    }

    if (typeof value?.toDate === "function") {
        return formatDateTime(value);
    }

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    return String(value);
};

const getDefaultValue = (field) => {
    if (field.type === "checkbox") {
        return false;
    }

    return "";
};

const sortLogsByNewest = (items) => {
    return [...items].sort((left, right) => {
        const leftTime =
            typeof left.loggedAt?.toDate === "function"
                ? left.loggedAt.toDate().getTime()
                : new Date(left.loggedAt || left.dateCreated || 0).getTime();
        const rightTime =
            typeof right.loggedAt?.toDate === "function"
                ? right.loggedAt.toDate().getTime()
                : new Date(right.loggedAt || right.dateCreated || 0).getTime();

        return rightTime - leftTime;
    });
};

const buildInitialFormState = (tracker, log) => {
    return (tracker?.logFields || []).reduce((values, field) => {
        values[field.key] = log?.values?.[field.key] ?? getDefaultValue(field);
        return values;
    }, {});
};

const getFieldInputValue = (field, event) => {
    if (field.type === "checkbox") {
        return event.target.checked;
    }

    if (field.type === "number") {
        return Number.isNaN(event.target.valueAsNumber)
            ? ""
            : event.target.valueAsNumber;
    }

    return event.target.value;
};

const Tracker = () => {
    const { trackerId } = useParams();
    const [tracker, setTracker] = useState(null);
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [formValues, setFormValues] = useState({});
    const [logNotes, setLogNotes] = useState("");
    const [activeLog, setActiveLog] = useState(null);
    const [deletingLogId, setDeletingLogId] = useState("");
    const [isTrackerModalOpen, setIsTrackerModalOpen] = useState(false);
    const [trackerDraft, setTrackerDraft] = useState(createTrackerDraft(null));
    const [isSavingTracker, setIsSavingTracker] = useState(false);
    const [trackerError, setTrackerError] = useState("");
    const { confirm, confirmationDialog } = useConfirmationDialog();

    useEffect(() => {
        let isMounted = true;

        const loadTrackerData = async () => {
            setIsLoading(true);
            setError("");

            try {
                const trackerResult = await getTracker(trackerId);

                if (!trackerResult) {
                    throw new Error("Tracker not found.");
                }

                const logResults = await listTrackerLogs(trackerId);

                if (!isMounted) {
                    return;
                }

                setTracker(trackerResult);
                setLogs(sortLogsByNewest(logResults));
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message || "Unable to load this tracker.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadTrackerData();

        return () => {
            isMounted = false;
        };
    }, [trackerId]);

    const logTableColumns = useMemo(() => {
        return (tracker?.logFields || []).map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type
        }));
    }, [tracker]);

    const openCreateLogModal = () => {
        if (!tracker?.logFields?.length) {
            return;
        }

        setActiveLog(null);
        setFormValues(buildInitialFormState(tracker));
        setLogNotes("");
        setIsLogModalOpen(true);
    };

    const openEditLogModal = (log) => {
        if (!tracker?.logFields?.length) {
            setError("Add fields to this tracker before editing logs.");
            return;
        }

        setActiveLog(log);
        setFormValues(buildInitialFormState(tracker, log));
        setLogNotes(log.notes || "");
        setIsLogModalOpen(true);
    };

    const closeLogModal = () => {
        if (isSubmitting) {
            return;
        }

        setIsLogModalOpen(false);
        setActiveLog(null);
        setFormValues({});
        setLogNotes("");
    };

    const handleFieldChange = (fieldKey, value) => {
        setFormValues((currentValues) => ({
            ...currentValues,
            [fieldKey]: value
        }));
    };

    const handleSubmitLog = async (event) => {
        event.preventDefault();

        if (!tracker) {
            return;
        }

        setIsSubmitting(true);
        setError("");

        try {
            const firstDateField = tracker.logFields?.find((field) => field.type === "date");
            const firstTimeField = tracker.logFields?.find((field) => field.type === "time");
            const payload = {
                title: `${tracker.name} log`,
                notes: logNotes,
                values: formValues,
                eventDate: firstDateField ? formValues[firstDateField.key] || null : null,
                eventTime: firstTimeField ? formValues[firstTimeField.key] || null : null,
                loggedAt: activeLog?.loggedAt || new Date().toISOString()
            };

            if (activeLog) {
                await updateTrackerLog(trackerId, activeLog.id, payload);

                setLogs((currentLogs) =>
                    sortLogsByNewest(
                        currentLogs.map((log) =>
                            log.id === activeLog.id ? { ...log, ...payload, id: activeLog.id } : log
                        )
                    )
                );
            } else {
                const logId = await createTrackerLog(trackerId, payload);
                setLogs((currentLogs) =>
                    sortLogsByNewest([{ ...payload, id: logId }, ...currentLogs])
                );
            }

            closeLogModal();
        } catch (submitError) {
            setError(submitError.message || "Unable to save the log.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLog = async (logId) => {
        const shouldDelete = await confirm({
            title: "Delete this log entry?",
            message: "This log entry will be permanently removed and cannot be undone.",
            confirmLabel: "Delete log",
            cancelLabel: "Keep log",
            variant: "danger"
        });

        if (!shouldDelete) {
            return;
        }

        setDeletingLogId(logId);
        setError("");

        try {
            await deleteTrackerLog(trackerId, logId);
            setLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
        } catch (deleteError) {
            setError(deleteError.message || "Unable to delete the log.");
        } finally {
            setDeletingLogId("");
        }
    };

    const openTrackerModal = () => {
        setTrackerDraft(createTrackerDraft(tracker));
        setTrackerError("");
        setIsTrackerModalOpen(true);
    };

    const closeTrackerModal = () => {
        if (isSavingTracker) {
            return;
        }

        setIsTrackerModalOpen(false);
        setTrackerError("");
        setTrackerDraft(createTrackerDraft(tracker));
    };

    const handleTrackerDraftChange = (field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            [field]: value
        }));
    };

    const handleSaveTracker = async (event) => {
        event.preventDefault();

        const name = trackerDraft.name.trim();

        if (!name) {
            setTrackerError("Tracker name is required.");
            return;
        }

        setIsSavingTracker(true);
        setTrackerError("");

        try {
            const payload = {
                name,
                logFields: cloneLogFields(trackerDraft.logFields)
            };

            await updateTracker(trackerId, payload);
            setTracker((currentTracker) => ({
                ...currentTracker,
                ...payload
            }));
            closeTrackerModal();
        } catch (submitError) {
            setTrackerError(submitError.message || "Unable to update the tracker.");
        } finally {
            setIsSavingTracker(false);
        }
    };

    return (
        <main className="page page--tracker">
            <section className="page-header">
                <div>
                    <Link className="page-header__back-link" to="/trackers">
                        Back to trackers
                    </Link>
                    <h2>{tracker?.name || "Tracker"}</h2>
                    <p>Define the fields this tracker uses, then log activity against that schema.</p>
                </div>
                <div className="page-header__actions">
                    <div className="page-header__meta">
                        <span className="page-header__meta-count">{logs.length} logs</span>
                    </div>
                    <button className="button button--secondary" onClick={openTrackerModal} type="button">
                        Edit tracker
                    </button>
                </div>
            </section>

            {isLoading && (
                <section className="panel panel--centered">
                    <p>Loading tracker details...</p>
                </section>
            )}

            {!isLoading && error && (
                <section className="panel panel--centered">
                    <p className="status-message status-message--error">{error}</p>
                </section>
            )}

            {!isLoading && !error && tracker && (
                <>
                    <section className="panel tracker-toolbar">
                        <div>
                            <p className="section-label">Log entry</p>
                            <h3>
                                {tracker.logFields?.length
                                    ? "Add a new log using this tracker's fields"
                                    : "Set up log fields before adding entries"}
                            </h3>
                        </div>

                        <div className="tracker-toolbar__actions">
                            <span className="tracker-card__badge">{tracker.logFields?.length || 0} fields</span>
                            <button className="button button--secondary" onClick={openTrackerModal} type="button">
                                Manage fields
                            </button>

                            <button
                                className="button button--primary"
                                disabled={!tracker.logFields?.length}
                                onClick={openCreateLogModal}
                                type="button"
                            >
                                Add log
                            </button>
                        </div>
                    </section>

                    <section className="panel">
                        <div className="panel__header">
                            <div>
                                <p className="section-label">Saved logs</p>
                                <h3>Recent tracker activity</h3>
                            </div>
                        </div>

                        {!tracker.logFields?.length && (
                            <div className="empty-state">
                                <h4>No log fields configured</h4>
                                <p>Open the tracker editor and add the fields this tracker should use for each log entry.</p>
                            </div>
                        )}

                        {tracker.logFields?.length > 0 && logs.length === 0 && (
                            <div className="empty-state">
                                <h4>No logs yet</h4>
                                <p>Use the current tracker fields above and save the first entry.</p>
                            </div>
                        )}

                        {logs.length > 0 && (
                            <div className="log-table-wrapper">
                                <table className="log-table">
                                    <thead>
                                        <tr>
                                            {logTableColumns.map((column) => (
                                                <th key={column.key} scope="col">
                                                    {column.label}
                                                </th>
                                            ))}
                                            <th scope="col">Notes</th>
                                            <th scope="col">Created</th>
                                            <th scope="col" className="log-table__actions-header">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => {
                                            const createdAt = formatDateTime(
                                                log.loggedAt || log.eventDate || log.dateCreated
                                            );

                                            return (
                                                <tr key={log.id}>
                                                    {logTableColumns.map((column) => {
                                                        const matchingField = tracker.logFields.find(
                                                            (field) => field.key === column.key
                                                        );

                                                        return (
                                                            <td
                                                                className="log-table__field-cell"
                                                                key={`${log.id}-${column.key}`}
                                                            >
                                                                {matchingField ? (
                                                                    formatFieldValue(
                                                                        log.values?.[column.key],
                                                                        matchingField
                                                                    )
                                                                ) : (
                                                                    <span className="log-table__empty">-</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="log-table__cell log-table__cell--notes">
                                                        {log.notes ? (
                                                            <p className="log-table__notes">{log.notes}</p>
                                                        ) : (
                                                            <span className="log-table__empty">No notes</span>
                                                        )}
                                                    </td>
                                                    <td className="log-table__timestamp">{createdAt}</td>
                                                    <td className="log-table__actions-cell">
                                                        <div className="log-table__actions">
                                                            <button
                                                                className="button button--ghost"
                                                                onClick={() => openEditLogModal(log)}
                                                                type="button"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="button button--ghost-danger"
                                                                disabled={deletingLogId === log.id}
                                                                onClick={() => handleDeleteLog(log.id)}
                                                                type="button"
                                                            >
                                                                {deletingLogId === log.id ? "Deleting..." : "Delete"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}

            {isLogModalOpen && tracker && tracker.logFields?.length > 0 && (
                <div className="modal-backdrop" role="presentation" onClick={closeLogModal}>
                    <div
                        aria-modal="true"
                        className="modal"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">{activeLog ? "Edit log" : "New log"}</p>
                                <h3>{tracker.name}</h3>
                            </div>
                            <button
                                aria-label="Close log form"
                                className="modal__close"
                                onClick={closeLogModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleSubmitLog}>
                            {(tracker.logFields || []).map((field) => {
                                if (field.type === "textarea") {
                                    return (
                                        <label className="field-group" key={field.id}>
                                            <span>{field.label}</span>
                                            <textarea
                                                placeholder={field.placeholder || ""}
                                                required={field.required}
                                                rows={4}
                                                value={formValues[field.key] ?? ""}
                                                onChange={(event) =>
                                                    handleFieldChange(field.key, event.target.value)
                                                }
                                            />
                                        </label>
                                    );
                                }

                                if (field.type === "select") {
                                    return (
                                        <label className="field-group" key={field.id}>
                                            <span>{field.label}</span>
                                            <select
                                                required={field.required}
                                                value={formValues[field.key] ?? ""}
                                                onChange={(event) =>
                                                    handleFieldChange(field.key, event.target.value)
                                                }
                                            >
                                                <option value="">Select an option</option>
                                                {(field.options || []).map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    );
                                }

                                if (field.type === "checkbox") {
                                    return (
                                        <label className="field-group field-group--checkbox" key={field.id}>
                                            <input
                                                checked={Boolean(formValues[field.key])}
                                                type="checkbox"
                                                onChange={(event) =>
                                                    handleFieldChange(field.key, event.target.checked)
                                                }
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    );
                                }

                                return (
                                    <label className="field-group" key={field.id}>
                                        <span>{field.label}</span>
                                        <input
                                            min={field.type === "number" ? "0" : undefined}
                                            placeholder={field.placeholder || ""}
                                            required={field.required}
                                            step={field.type === "number" ? "any" : undefined}
                                            type={field.type || "text"}
                                            value={formValues[field.key] ?? ""}
                                            onChange={(event) =>
                                                handleFieldChange(field.key, getFieldInputValue(field, event))
                                            }
                                        />
                                    </label>
                                );
                            })}

                            <label className="field-group">
                                <span>Notes</span>
                                <textarea
                                    placeholder="Add any extra details for this log entry"
                                    rows={4}
                                    value={logNotes}
                                    onChange={(event) => setLogNotes(event.target.value)}
                                />
                            </label>

                            <div className="modal__actions">
                                <button className="button button--secondary" onClick={closeLogModal} type="button">
                                    Cancel
                                </button>
                                <button className="button button--primary" disabled={isSubmitting} type="submit">
                                    {isSubmitting ? "Saving..." : activeLog ? "Save changes" : "Save log"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTrackerModalOpen && (
                <div className="modal-backdrop" role="presentation" onClick={closeTrackerModal}>
                    <div
                        aria-modal="true"
                        className="modal modal--wide"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">Edit tracker</p>
                                <h3>Update tracker details</h3>
                            </div>
                            <button
                                aria-label="Close tracker form"
                                className="modal__close"
                                onClick={closeTrackerModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleSaveTracker}>
                            <label className="field-group">
                                <span>Tracker name</span>
                                <input
                                    placeholder="Car maintenance"
                                    required
                                    value={trackerDraft.name}
                                    onChange={(event) => handleTrackerDraftChange("name", event.target.value)}
                                />
                            </label>

                            <LogFieldsEditor
                                description="These fields define the structure of every log entry in this tracker."
                                emptyDescription="Add one or more fields so this tracker knows what each log should collect."
                                fields={trackerDraft.logFields}
                                onChange={(nextFields) => handleTrackerDraftChange("logFields", nextFields)}
                                title="Manage this tracker's log fields"
                            />

                            {trackerError && (
                                <p className="status-message status-message--error">{trackerError}</p>
                            )}

                            <div className="modal__actions">
                                <button className="button button--secondary" onClick={closeTrackerModal} type="button">
                                    Cancel
                                </button>
                                <button className="button button--primary" disabled={isSavingTracker} type="submit">
                                    {isSavingTracker ? "Saving..." : "Save tracker"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmationDialog}
        </main>
    );
};

export default Tracker;