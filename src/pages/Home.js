import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import { createTracker, listUserTrackers } from "../services/firestore";

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
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
    fields: [createFieldDraft()]
});

const createTrackerDraft = () => ({
    name: "",
    category: "",
    description: "",
    logTypes: [createLogTypeDraft()]
});

const sortTrackersByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const Home = () => {
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [trackers, setTrackers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreatingTracker, setIsCreatingTracker] = useState(false);
    const [createError, setCreateError] = useState("");
    const [trackerDraft, setTrackerDraft] = useState(createTrackerDraft());

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUserId(user?.uid || null);
            setAuthResolved(true);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!authResolved) {
            return;
        }

        if (!userId) {
            setTrackers([]);
            setIsLoading(false);
            setError("");
            return;
        }

        let isMounted = true;

        const loadTrackers = async () => {
            setIsLoading(true);
            setError("");

            try {
                const trackerResults = await listUserTrackers(userId);

                if (!isMounted) {
                    return;
                }

                setTrackers(sortTrackersByName(trackerResults));
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message || "Unable to load your trackers right now.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadTrackers();

        return () => {
            isMounted = false;
        };
    }, [authResolved, userId]);

    const openCreateModal = () => {
        setTrackerDraft(createTrackerDraft());
        setCreateError("");
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        if (isCreatingTracker) {
            return;
        }

        setIsCreateModalOpen(false);
        setCreateError("");
        setTrackerDraft(createTrackerDraft());
    };

    const updateTrackerDraft = (field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            [field]: value
        }));
    };

    const addLogTypeDraft = () => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes: [...currentDraft.logTypes, createLogTypeDraft()]
        }));
    };

    const removeLogTypeDraft = (logTypeId) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes:
                currentDraft.logTypes.length === 1
                    ? currentDraft.logTypes
                    : currentDraft.logTypes.filter((logType) => logType.id !== logTypeId)
        }));
    };

    const updateLogTypeDraft = (logTypeId, field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes: currentDraft.logTypes.map((logType) =>
                logType.id === logTypeId ? { ...logType, [field]: value } : logType
            )
        }));
    };

    const addFieldDraft = (logTypeId) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes: currentDraft.logTypes.map((logType) =>
                logType.id === logTypeId
                    ? { ...logType, fields: [...logType.fields, createFieldDraft()] }
                    : logType
            )
        }));
    };

    const removeFieldDraft = (logTypeId, fieldId) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes: currentDraft.logTypes.map((logType) => {
                if (logType.id !== logTypeId) {
                    return logType;
                }

                return {
                    ...logType,
                    fields:
                        logType.fields.length === 1
                            ? logType.fields
                            : logType.fields.filter((field) => field.id !== fieldId)
                };
            })
        }));
    };

    const updateFieldDraft = (logTypeId, fieldId, field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            logTypes: currentDraft.logTypes.map((logType) => {
                if (logType.id !== logTypeId) {
                    return logType;
                }

                return {
                    ...logType,
                    fields: logType.fields.map((currentField) =>
                        currentField.id === fieldId
                            ? { ...currentField, [field]: value }
                            : currentField
                    )
                };
            })
        }));
    };

    const handleCreateTracker = async (event) => {
        event.preventDefault();

        if (!userId) {
            setCreateError("You must be signed in to create a tracker.");
            return;
        }

        const trimmedName = trackerDraft.name.trim();
        const validLogTypes = trackerDraft.logTypes
            .map((logType) => ({
                ...logType,
                name: logType.name.trim(),
                description: logType.description.trim(),
                fields: logType.fields
                    .map((field) => ({
                        ...field,
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
                    .filter((field) => field.label)
            }))
            .filter((logType) => logType.name);

        if (!trimmedName) {
            setCreateError("Tracker name is required.");
            return;
        }

        if (validLogTypes.length === 0) {
            setCreateError("Add at least one custom log type for this tracker.");
            return;
        }

        if (validLogTypes.some((logType) => logType.fields.length === 0)) {
            setCreateError("Each log type needs at least one field.");
            return;
        }

        setIsCreatingTracker(true);
        setCreateError("");

        try {
            const trackerId = await createTracker({
                ownerId: userId,
                name: trimmedName,
                category: trackerDraft.category.trim(),
                description: trackerDraft.description.trim(),
                logTypes: validLogTypes.map((logType) => ({
                    name: logType.name,
                    description: logType.description,
                    fields: logType.fields.map((field) => ({
                        label: field.label,
                        type: field.type,
                        required: field.required,
                        unitLabel: field.unitLabel || undefined,
                        placeholder: field.placeholder || undefined,
                        options: field.options.length > 0 ? field.options : undefined
                    }))
                }))
            });

            const trackerRecord = {
                id: trackerId,
                ownerId: userId,
                name: trimmedName,
                category: trackerDraft.category.trim(),
                description: trackerDraft.description.trim(),
                isArchived: false
            };

            setTrackers((currentTrackers) =>
                sortTrackersByName([...currentTrackers, trackerRecord])
            );
            setIsCreateModalOpen(false);
            setTrackerDraft(createTrackerDraft());
        } catch (submitError) {
            setCreateError(submitError.message || "Unable to create the tracker.");
        } finally {
            setIsCreatingTracker(false);
        }
    };

    return (
        <main className="page page--home">
            <section className="hero-panel">
                <div>
                    <p className="hero-panel__eyebrow">Your trackers</p>
                    <h2 className="hero-panel__title">Keep every routine in one place.</h2>
                    <p className="hero-panel__body">
                        Track recurring tasks like oil changes, lawn care, pumping sessions,
                        or any custom workflow with log types tailored to each tracker.
                    </p>
                </div>

                <div className="hero-panel__stats">
                    <div className="hero-panel__stat-card">
                        <span className="hero-panel__stat-value">{trackers.length}</span>
                        <span className="hero-panel__stat-label">Active trackers</span>
                    </div>
                    <div className="hero-panel__stat-card hero-panel__stat-card--action">
                        <span className="hero-panel__stat-value">Build</span>
                        <span className="hero-panel__stat-label">
                            Trackers with custom log types
                        </span>
                        <button
                            className="button button--primary"
                            disabled={!userId}
                            onClick={openCreateModal}
                            type="button"
                        >
                            Create tracker
                        </button>
                    </div>
                </div>
            </section>

            {!authResolved && (
                <section className="panel panel--centered">
                    <p>Checking your session...</p>
                </section>
            )}

            {authResolved && !userId && (
                <section className="panel panel--centered">
                    <h3>No signed-in user</h3>
                    <p>
                        Sign in first so the app can load the trackers tied to your account.
                    </p>
                </section>
            )}

            {authResolved && userId && (
                <section className="panel">
                    <div className="panel__header">
                        <div>
                            <p className="section-label">Tracker overview</p>
                            <h3>Your tracker library</h3>
                        </div>

                        <button className="button button--secondary" onClick={openCreateModal} type="button">
                            New tracker
                        </button>
                    </div>

                    {isLoading && <p className="status-message">Loading trackers...</p>}
                    {error && <p className="status-message status-message--error">{error}</p>}

                    {!isLoading && !error && trackers.length === 0 && (
                        <div className="empty-state">
                            <h4>No trackers yet</h4>
                            <p>
                                Create a tracker and define custom log types such as pumping,
                                oil changes, or lawn treatment schedules.
                            </p>
                        </div>
                    )}

                    {!isLoading && !error && trackers.length > 0 && (
                        <div className="tracker-grid">
                            {trackers.map((tracker) => (
                                <Link
                                    key={tracker.id}
                                    className="tracker-card"
                                    to={`/trackers/${tracker.id}`}
                                >
                                    <div className="tracker-card__header">
                                        <span className="tracker-card__badge">
                                            {tracker.category || "General"}
                                        </span>
                                        {tracker.isArchived && (
                                            <span className="tracker-card__badge tracker-card__badge--muted">
                                                Archived
                                            </span>
                                        )}
                                    </div>
                                    <h4>{tracker.name}</h4>
                                    <p>
                                        {tracker.description ||
                                            "No description yet. Open this tracker to view logs and log types."}
                                    </p>
                                    <span className="tracker-card__cta">Open tracker</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {isCreateModalOpen && (
                <div className="modal-backdrop" onClick={closeCreateModal} role="presentation">
                    <div
                        aria-modal="true"
                        className="modal modal--wide"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">Create tracker</p>
                                <h3>Build a tracker with custom log types</h3>
                            </div>
                            <button
                                aria-label="Close tracker builder"
                                className="modal__close"
                                onClick={closeCreateModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleCreateTracker}>
                            <section className="builder-section">
                                <div className="builder-section__header">
                                    <div>
                                        <p className="section-label">Tracker details</p>
                                        <h4>Core information</h4>
                                    </div>
                                </div>

                                <div className="builder-grid">
                                    <label className="field-group">
                                        <span>Tracker name</span>
                                        <input
                                            placeholder="Car maintenance"
                                            required
                                            value={trackerDraft.name}
                                            onChange={(event) => updateTrackerDraft("name", event.target.value)}
                                        />
                                    </label>

                                    <label className="field-group">
                                        <span>Category</span>
                                        <input
                                            placeholder="Vehicle, Home, Family"
                                            value={trackerDraft.category}
                                            onChange={(event) => updateTrackerDraft("category", event.target.value)}
                                        />
                                    </label>
                                </div>

                                <label className="field-group">
                                    <span>Description</span>
                                    <textarea
                                        placeholder="Describe what this tracker is for"
                                        rows={3}
                                        value={trackerDraft.description}
                                        onChange={(event) => updateTrackerDraft("description", event.target.value)}
                                    />
                                </label>
                            </section>

                            <section className="builder-section">
                                <div className="builder-section__header">
                                    <div>
                                        <p className="section-label">Custom log types</p>
                                        <h4>Define the data each log should collect</h4>
                                    </div>

                                    <button className="button button--secondary" onClick={addLogTypeDraft} type="button">
                                        Add log type
                                    </button>
                                </div>

                                <div className="builder-stack">
                                    {trackerDraft.logTypes.map((logType, index) => (
                                        <article className="builder-card" key={logType.id}>
                                            <div className="builder-card__header">
                                                <div>
                                                    <p className="section-label">Log type {index + 1}</p>
                                                    <h4>{logType.name || "Untitled log type"}</h4>
                                                </div>
                                                <button
                                                    className="button button--ghost"
                                                    disabled={trackerDraft.logTypes.length === 1}
                                                    onClick={() => removeLogTypeDraft(logType.id)}
                                                    type="button"
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <div className="builder-grid">
                                                <label className="field-group">
                                                    <span>Name</span>
                                                    <input
                                                        placeholder="Oil change"
                                                        value={logType.name}
                                                        onChange={(event) =>
                                                            updateLogTypeDraft(logType.id, "name", event.target.value)
                                                        }
                                                    />
                                                </label>

                                                <label className="field-group">
                                                    <span>Description</span>
                                                    <input
                                                        placeholder="What should this log capture?"
                                                        value={logType.description}
                                                        onChange={(event) =>
                                                            updateLogTypeDraft(
                                                                logType.id,
                                                                "description",
                                                                event.target.value
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>

                                            <div className="builder-section__header builder-section__header--nested">
                                                <div>
                                                    <p className="section-label">Fields</p>
                                                    <h4>Choose the inputs for this log type</h4>
                                                </div>

                                                <button
                                                    className="button button--secondary"
                                                    onClick={() => addFieldDraft(logType.id)}
                                                    type="button"
                                                >
                                                    Add field
                                                </button>
                                            </div>

                                            <div className="builder-stack">
                                                {logType.fields.map((field, fieldIndex) => (
                                                    <div className="field-builder" key={field.id}>
                                                        <div className="field-builder__header">
                                                            <strong>Field {fieldIndex + 1}</strong>
                                                            <button
                                                                className="button button--ghost"
                                                                disabled={logType.fields.length === 1}
                                                                onClick={() => removeFieldDraft(logType.id, field.id)}
                                                                type="button"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>

                                                        <div className="builder-grid builder-grid--three-columns">
                                                            <label className="field-group">
                                                                <span>Label</span>
                                                                <input
                                                                    placeholder="Mileage"
                                                                    value={field.label}
                                                                    onChange={(event) =>
                                                                        updateFieldDraft(
                                                                            logType.id,
                                                                            field.id,
                                                                            "label",
                                                                            event.target.value
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="field-group">
                                                                <span>Type</span>
                                                                <select
                                                                    value={field.type}
                                                                    onChange={(event) =>
                                                                        updateFieldDraft(
                                                                            logType.id,
                                                                            field.id,
                                                                            "type",
                                                                            event.target.value
                                                                        )
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
                                                                    placeholder="mL, miles, oz"
                                                                    value={field.unitLabel}
                                                                    onChange={(event) =>
                                                                        updateFieldDraft(
                                                                            logType.id,
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
                                                                        updateFieldDraft(
                                                                            logType.id,
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
                                                                    placeholder="Brand A, Brand B"
                                                                    value={field.optionsText}
                                                                    onChange={(event) =>
                                                                        updateFieldDraft(
                                                                            logType.id,
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
                                                                        updateFieldDraft(
                                                                            logType.id,
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
                                        </article>
                                    ))}
                                </div>
                            </section>

                            {createError && (
                                <p className="status-message status-message--error">{createError}</p>
                            )}

                            <div className="modal__actions">
                                <button className="button button--secondary" onClick={closeCreateModal} type="button">
                                    Cancel
                                </button>
                                <button className="button button--primary" disabled={isCreatingTracker} type="submit">
                                    {isCreatingTracker ? "Creating..." : "Create tracker"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};

export default Home;