import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import useConfirmationDialog from "../components/useConfirmationDialog";
import {
    createTrackerLog,
    deleteUserLogType,
    deleteTrackerLog,
    getTracker,
    listTrackerLogs,
    listUserLogTypes,
    updateTracker,
    updateUserLogType,
    updateTrackerLog
} from "../services/firestore";

const FIELD_TYPE_OPTIONS = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "time", label: "Time" },
    { value: "textarea", label: "Long text" },
    { value: "select", label: "Select" },
    { value: "checkbox", label: "Checkbox" }
];

const createFieldDraft = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    type: "text",
    required: false,
    unitLabel: "",
    placeholder: "",
    optionsText: ""
});

const createLogTypeDraft = () => ({
    name: "",
    fields: [createFieldDraft()]
});

const createTrackerDraft = (tracker) => ({
    name: tracker?.name || ""
});

const normalizeFieldKey = (value) => {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
};

const createLogTypeDraftFromExisting = (logType) => ({
    id: logType.id,
    name: logType.name || "",
    fields: (logType.fields || []).map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label || "",
        type: field.type || "text",
        required: Boolean(field.required),
        unitLabel: field.unitLabel || "",
        placeholder: field.placeholder || "",
        optionsText: Array.isArray(field.options) ? field.options.join(", ") : ""
    }))
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
    const [logTypeOwnerId, setLogTypeOwnerId] = useState("");
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
    const [isLogTypeModalOpen, setIsLogTypeModalOpen] = useState(false);
    const [isSavingLogType, setIsSavingLogType] = useState(false);
    const [logTypeDraft, setLogTypeDraft] = useState(createLogTypeDraft());
    const [logTypeError, setLogTypeError] = useState("");
    const [deletingLogId, setDeletingLogId] = useState("");
    const [activeLogType, setActiveLogType] = useState(null);
    const [deletingLogTypeId, setDeletingLogTypeId] = useState("");
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
                setLogTypeOwnerId(trackerResult.ownerId || "");
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

    const openEditLogTypeModal = (logType) => {
        setActiveLogType(logType);
        setLogTypeDraft(createLogTypeDraftFromExisting(logType));
        setLogTypeError("");
        setIsLogTypeModalOpen(true);
    };

    const closeLogTypeModal = () => {
        if (isSavingLogType) {
            return;
        }

        setIsLogTypeModalOpen(false);
        setActiveLogType(null);
        setLogTypeError("");
        setLogTypeDraft(createLogTypeDraft());
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

    const updateLogTypeDraftField = (field, value) => {
        setLogTypeDraft((currentDraft) => ({
            ...currentDraft,
            [field]: value
        }));
    };

    const addLogTypeFieldDraft = () => {
        setLogTypeDraft((currentDraft) => ({
            ...currentDraft,
            fields: [...currentDraft.fields, createFieldDraft()]
        }));
    };

    const updateLogTypeFieldDraft = (fieldId, field, value) => {
        setLogTypeDraft((currentDraft) => ({
            ...currentDraft,
            fields: currentDraft.fields.map((currentField) =>
                currentField.id === fieldId ? { ...currentField, [field]: value } : currentField
            )
        }));
    };

    const removeLogTypeFieldDraft = (fieldId) => {
        setLogTypeDraft((currentDraft) => ({
            ...currentDraft,
            fields:
                currentDraft.fields.length === 1
                    ? currentDraft.fields
                    : currentDraft.fields.filter((field) => field.id !== fieldId)
        }));
    };

    const handleSaveLogType = async (event) => {
        event.preventDefault();

        if (!logTypeOwnerId) {
            setLogTypeError("Unable to determine which account owns this tracker.");
            return;
        }

        const name = logTypeDraft.name.trim();
        const fields = logTypeDraft.fields
            .map((field) => ({
                ...field,
                key: field.key,
                label: field.label.trim(),
                unitLabel: field.unitLabel.trim(),
                placeholder: field.placeholder.trim(),
                options: field.type === "select"
                    ? field.optionsText
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean)
                    : []
            }))
            .filter((field) => field.label);

        if (!name) {
            setLogTypeError("Log type name is required.");
            return;
        }

        if (fields.length === 0) {
            setLogTypeError("Add at least one field for the log type.");
            return;
        }

        setIsSavingLogType(true);
        setLogTypeError("");

        try {
            if (!activeLogType) {
                throw new Error("Choose an existing log type to edit.");
            }

            const payload = {
                name,
                fields: fields.map((field) => ({
                    id: field.id,
                    key: field.key || normalizeFieldKey(field.label),
                    label: field.label,
                    type: field.type,
                    required: field.required,
                    unitLabel: field.unitLabel || undefined,
                    placeholder: field.placeholder || undefined,
                    options: field.options.length > 0 ? field.options : undefined
                }))
            };

            await updateUserLogType(activeLogType.id, payload);

            setLogTypes((currentLogTypes) =>
                sortLogTypesByName(
                    currentLogTypes.map((logType) =>
                        logType.id === activeLogType.id
                            ? { ...logType, ...payload, id: activeLogType.id }
                            : logType
                    )
                )
            );

            closeLogTypeModal();
        } catch (submitError) {
            setLogTypeError(submitError.message || "Unable to create the log type.");
        } finally {
            setIsSavingLogType(false);
        }
    };

    const handleDeleteLogType = async (logType) => {
        if (!logTypeOwnerId) {
            setError("Unable to determine which account owns this tracker.");
            return;
        }

        const shouldDelete = await confirm({
            title: "Delete this shared log type?",
            message: "Any logs using it across your trackers will also be deleted. This cannot be undone.",
            confirmLabel: "Delete log type",
            cancelLabel: "Keep log type",
            variant: "danger"
        });

        if (!shouldDelete) {
            return;
        }

        setDeletingLogTypeId(logType.id);
        setError("");

        try {
            await deleteUserLogType(logTypeOwnerId, logType.id, {
                deleteAssociatedLogs: true
            });

            const remainingLogTypes = logTypes.filter((currentLogType) => currentLogType.id !== logType.id);

            setLogTypes(sortLogTypesByName(remainingLogTypes));
            setLogs((currentLogs) => currentLogs.filter((log) => log.logTypeId !== logType.id));

            if (selectedLogTypeId === logType.id) {
                setSelectedLogTypeId(remainingLogTypes[0]?.id || "");
            }
        } catch (deleteError) {
            setError(deleteError.message || "Unable to delete the log type.");
        } finally {
            setDeletingLogTypeId("");
        }
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
                                <p className="section-label">Log types</p>
                                <h3>Shared log type library</h3>
                            </div>
                            <button className="button button--secondary" onClick={openCreateLogTypePage} type="button">
                                Add shared log type
                            </button>
                        </div>

                        {logTypes.length === 0 && (
                            <div className="empty-state">
                                <h4>No log types configured</h4>
                                <p>
                                    Create a shared log type here or on the home page before adding logs.
                                </p>
                            </div>
                        )}

                        {logTypes.length > 0 && (
                            <div className="builder-stack builder-stack--dense">
                                {logTypes.map((logType) => (
                                    <article className="builder-card" key={logType.id}>
                                        <div className="builder-card__header">
                                            <div>
                                                <p className="section-label">Shared log type</p>
                                                <h4>{logType.name}</h4>
                                            </div>
                                            <div className="card-actions">
                                                <span className="tracker-card__badge">
                                                    {(logType.fields || []).length} fields
                                                </span>
                                                <button
                                                    className="button button--ghost"
                                                    onClick={() => openEditLogTypeModal(logType)}
                                                    type="button"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="button button--ghost-danger"
                                                    disabled={deletingLogTypeId === logType.id}
                                                    onClick={() => handleDeleteLogType(logType)}
                                                    type="button"
                                                >
                                                    {deletingLogTypeId === logType.id ? "Deleting..." : "Delete"}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="pill-row">
                                            {(logType.fields || []).map((field) => (
                                                <span className="info-pill" key={field.id}>
                                                    {field.label}
                                                    {field.unitLabel ? ` (${field.unitLabel})` : ""}
                                                </span>
                                            ))}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
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
                            <div className="log-list">
                                {logs.map((log) => {
                                    const logType = logTypesById[log.logTypeId];

                                    return (
                                        <article className="log-card" key={log.id}>
                                            <div className="log-card__header">
                                                <div>
                                                    <span className="tracker-card__badge">
                                                        {logType?.name || "Custom log"}
                                                    </span>
                                                    <h4>{log.title || logType?.name || "Log entry"}</h4>
                                                </div>
                                                <div className="log-card__header-actions">
                                                    <span className="log-card__timestamp">
                                                        {formatDateTime(
                                                            log.loggedAt || log.eventDate || log.dateCreated
                                                        )}
                                                    </span>
                                                    <div className="card-actions">
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
                                                </div>
                                            </div>

                                            <dl className="log-card__fields">
                                                {(logType?.fields || []).map((field) => (
                                                    <div className="log-card__field" key={field.id}>
                                                        <dt>{field.label}</dt>
                                                        <dd>{formatFieldValue(log.values?.[field.key], field)}</dd>
                                                    </div>
                                                ))}
                                            </dl>

                                            {log.notes && <p className="log-card__notes">{log.notes}</p>}
                                        </article>
                                    );
                                })}
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

            {isLogTypeModalOpen && (
                <div className="modal-backdrop" role="presentation" onClick={closeLogTypeModal}>
                    <div
                        aria-modal="true"
                        className="modal modal--wide"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">{activeLogType ? "Edit log type" : "New log type"}</p>
                                <h3>
                                    {activeLogType
                                        ? "Update this shared schema"
                                        : "Define a shared schema for your trackers"}
                                </h3>
                            </div>
                            <button
                                aria-label="Close log type form"
                                className="modal__close"
                                onClick={closeLogTypeModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleSaveLogType}>
                            <section className="builder-section">
                                <div className="builder-grid">
                                    <label className="field-group">
                                        <span>Log type name</span>
                                        <input
                                            placeholder="Fertilizer treatment"
                                            required
                                            value={logTypeDraft.name}
                                            onChange={(event) =>
                                                updateLogTypeDraftField("name", event.target.value)
                                            }
                                        />
                                    </label>
                                </div>
                            </section>

                            <section className="builder-section">
                                <div className="builder-section__header">
                                    <div>
                                        <p className="section-label">Fields</p>
                                        <h4>Shape the log entry form</h4>
                                    </div>
                                    <button className="button button--secondary" onClick={addLogTypeFieldDraft} type="button">
                                        Add field
                                    </button>
                                </div>

                                <div className="builder-stack">
                                    {logTypeDraft.fields.map((field, index) => (
                                        <div className="field-builder" key={field.id}>
                                            <div className="field-builder__header">
                                                <strong>Field {index + 1}</strong>
                                                <button
                                                    className="button button--ghost"
                                                    disabled={logTypeDraft.fields.length === 1}
                                                    onClick={() => removeLogTypeFieldDraft(field.id)}
                                                    type="button"
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <div className="builder-grid builder-grid--three-columns">
                                                <label className="field-group">
                                                    <span>Label</span>
                                                    <input
                                                        placeholder="Product brand"
                                                        value={field.label}
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(field.id, "label", event.target.value)
                                                        }
                                                    />
                                                </label>

                                                <label className="field-group">
                                                    <span>Type</span>
                                                    <select
                                                        value={field.type}
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(field.id, "type", event.target.value)
                                                        }
                                                    >
                                                        {FIELD_TYPE_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="field-group">
                                                    <span>Unit</span>
                                                    <input
                                                        placeholder="lbs, oz, mL"
                                                        value={field.unitLabel}
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(
                                                                field.id,
                                                                "unitLabel",
                                                                event.target.value
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>

                                            <div className="builder-grid builder-grid--three-columns">
                                                <label className="field-group">
                                                    <span>Placeholder</span>
                                                    <input
                                                        placeholder="Optional helper text"
                                                        value={field.placeholder}
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(
                                                                field.id,
                                                                "placeholder",
                                                                event.target.value
                                                            )
                                                        }
                                                    />
                                                </label>

                                                <label className="field-group">
                                                    <span>Options</span>
                                                    <input
                                                        disabled={field.type !== "select"}
                                                        placeholder="Option A, Option B"
                                                        value={field.optionsText}
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(
                                                                field.id,
                                                                "optionsText",
                                                                event.target.value
                                                            )
                                                        }
                                                    />
                                                </label>

                                                <label className="field-group field-group--checkbox field-group--checkbox-card">
                                                    <input
                                                        checked={field.required}
                                                        type="checkbox"
                                                        onChange={(event) =>
                                                            updateLogTypeFieldDraft(
                                                                field.id,
                                                                "required",
                                                                event.target.checked
                                                            )
                                                        }
                                                    />
                                                    <span>Required field</span>
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {logTypeError && (
                                <p className="status-message status-message--error">{logTypeError}</p>
                            )}

                            <div className="modal__actions">
                                <button className="button button--secondary" onClick={closeLogTypeModal} type="button">
                                    Cancel
                                </button>
                                <button className="button button--primary" disabled={isSavingLogType} type="submit">
                                    {isSavingLogType
                                        ? "Saving..."
                                        : activeLogType
                                            ? "Save log type"
                                            : "Create log type"}
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