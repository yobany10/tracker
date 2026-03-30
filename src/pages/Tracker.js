import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import useConfirmationDialog from "../components/useConfirmationDialog";
import {
    createTrackerLog,
    deleteTrackerLog,
    getTracker,
    listTrackerLogs,
    listUserLogTypes,
    updateTracker,
    updateTrackerLog
} from "../services/firestore";

const createTrackerDraft = (tracker) => ({
    name: tracker?.name || ""
});

const formatDateTime = (value) => {
    if (!value) {
        return "Not set";
    }

    if (typeof value?.toDate === "function") {
        return new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(value.toDate());
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
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

const sortLogTypesByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const buildInitialFormState = (logType, log) => {
    return (logType?.fields || []).reduce((values, field) => {
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
    const location = useLocation();
    const navigate = useNavigate();
    const [tracker, setTracker] = useState(null);
    const [logTypes, setLogTypes] = useState([]);
    const [logs, setLogs] = useState([]);
    const [selectedLogTypeId, setSelectedLogTypeId] = useState("");
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
        const createdLogTypeId = location.state?.createdLogTypeId;

        if (!createdLogTypeId || !logTypes.some((logType) => logType.id === createdLogTypeId)) {
            return;
        }

        setSelectedLogTypeId(createdLogTypeId);
        navigate(location.pathname, {
            replace: true,
            state: {}
        });
    }, [location.pathname, location.state, logTypes, navigate]);

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

                const [logTypeResults, logResults] = await Promise.all([
                    listUserLogTypes(trackerResult.ownerId),
                    listTrackerLogs(trackerId)
                ]);

                if (!isMounted) {
                    return;
                }

                const orderedLogTypes = sortLogTypesByName(logTypeResults);

                setTracker(trackerResult);
                setLogTypes(orderedLogTypes);
                setLogs(sortLogsByNewest(logResults));
                setSelectedLogTypeId(trackerResult?.defaultLogTypeId || orderedLogTypes[0]?.id || "");
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

    const selectedLogType = useMemo(
        () => logTypes.find((logType) => logType.id === selectedLogTypeId) || null,
        [logTypes, selectedLogTypeId]
    );

    const logTypesById = useMemo(() => {
        return logTypes.reduce((lookup, logType) => {
            lookup[logType.id] = logType;
            return lookup;
        }, {});
    }, [logTypes]);

    const logTableColumns = useMemo(() => {
        const columns = [];
        const seenKeys = new Set();

        logs.forEach((log) => {
            const logType = logTypesById[log.logTypeId];

            (logType?.fields || []).forEach((field) => {
                if (seenKeys.has(field.key)) {
                    return;
                }

                seenKeys.add(field.key);
                columns.push({
                    key: field.key,
                    label: field.label
                });
            });
        });

        return columns;
    }, [logs, logTypesById]);

    const openCreateLogModal = () => {
        if (!selectedLogType) {
            return;
        }

        setActiveLog(null);
        setFormValues(buildInitialFormState(selectedLogType));
        setLogNotes("");
        setIsLogModalOpen(true);
    };

    const openEditLogModal = (log) => {
        const logType = logTypesById[log.logTypeId];

        if (!logType) {
            setError("This log uses a log type that could not be loaded.");
            return;
        }

        setSelectedLogTypeId(log.logTypeId);
        setActiveLog(log);
        setFormValues(buildInitialFormState(logType, log));
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

        const currentLogType = activeLog ? logTypesById[activeLog.logTypeId] : selectedLogType;

        if (!currentLogType) {
            return;
        }

        setIsSubmitting(true);
        setError("");

        try {
            const firstDateField = currentLogType.fields?.find((field) => field.type === "date");
            const firstTimeField = currentLogType.fields?.find((field) => field.type === "time");
            const payload = {
                logTypeId: currentLogType.id,
                title: `${currentLogType.name} log`,
                notes: logNotes,
                values: formValues,
                eventDate: firstDateField ? formValues[firstDateField.key] || null : null,
                eventTime: firstTimeField ? formValues[firstTimeField.key] || null : null,
                loggedAt: activeLog?.loggedAt || new Date().toISOString()
            };

            if (activeLog) {
                await updateTrackerLog(trackerId, activeLog.id, payload);

                setLogs((currentLogs) =>
                    currentLogs.map((log) =>
                        log.id === activeLog.id ? { ...log, ...payload, id: activeLog.id } : log
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

    const openCreateLogTypePage = () => {
        navigate(`/trackers/${trackerId}/log-types/new`, {
            state: {
                returnTo: `/trackers/${trackerId}`
            }
        });
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
                name
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
                    <Link className="page-header__back-link" to="/">
                        Back to trackers
                    </Link>
                    <h2>{tracker?.name || "Tracker"}</h2>
                    <p>Use shared log types to record exactly what matters for this tracker.</p>
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

            {!isLoading && !error && (
                <>
                    <section className="panel tracker-toolbar">
                        <div>
                            <p className="section-label">Log entry</p>
                            <h3>Select a log type</h3>
                        </div>

                        <div className="tracker-toolbar__actions">
                            <label className="field-group field-group--compact">
                                <span>Log type</span>
                                <select
                                    value={selectedLogTypeId}
                                    onChange={(event) => setSelectedLogTypeId(event.target.value)}
                                >
                                    {logTypes.length === 0 && <option value="">No log types yet</option>}
                                    {logTypes.map((logType) => (
                                        <option key={logType.id} value={logType.id}>
                                            {logType.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <button
                                className="button button--secondary"
                                onClick={openCreateLogTypePage}
                                type="button"
                            >
                                New log type
                            </button>

                            <button
                                className="button button--primary"
                                disabled={!selectedLogType}
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

                        {logTypes.length > 0 && logs.length === 0 && (
                            <div className="empty-state">
                                <h4>No logs yet</h4>
                                <p>
                                    Select a log type above and add the first entry for this tracker.
                                </p>
                            </div>
                        )}

                        {logs.length > 0 && (
                            <div className="log-table-wrapper">
                                <table className="log-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Log type</th>
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
                                            const logType = logTypesById[log.logTypeId];
                                            const fields = logType?.fields || [];
                                            const createdAt = formatDateTime(
                                                log.loggedAt || log.eventDate || log.dateCreated
                                            );

                                            return (
                                                <tr key={log.id}>
                                                    <td>
                                                        <span className="log-table__cell">
                                                            {logType?.name || "Custom log"}
                                                        </span>
                                                    </td>
                                                    {logTableColumns.map((column) => {
                                                        const matchingField = fields.find(
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

            {isLogModalOpen && (activeLog ? logTypesById[activeLog.logTypeId] : selectedLogType) && (
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
                                <h3>
                                    {(activeLog
                                        ? logTypesById[activeLog.logTypeId]
                                        : selectedLogType
                                    )?.name}
                                </h3>
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
                            {((activeLog ? logTypesById[activeLog.logTypeId] : selectedLogType)?.fields || []).map((field) => {
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
                                    {isSubmitting
                                        ? "Saving..."
                                        : activeLog
                                            ? "Save changes"
                                            : "Save log"}
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
                        className="modal"
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