import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import {
    createTracker,
    createUserLogType,
    listUserLogTypes,
    listUserTrackers
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

const createTrackerDraft = () => ({
    name: "",
    category: ""
});

const sortTrackersByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const sortLogTypesByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const Home = () => {
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [trackers, setTrackers] = useState([]);
    const [logTypes, setLogTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isCreateTrackerModalOpen, setIsCreateTrackerModalOpen] = useState(false);
    const [isCreateLogTypeModalOpen, setIsCreateLogTypeModalOpen] = useState(false);
    const [isCreatingTracker, setIsCreatingTracker] = useState(false);
    const [isSavingLogType, setIsSavingLogType] = useState(false);
    const [createTrackerError, setCreateTrackerError] = useState("");
    const [logTypeError, setLogTypeError] = useState("");
    const [trackerDraft, setTrackerDraft] = useState(createTrackerDraft());
    const [logTypeDraft, setLogTypeDraft] = useState(createLogTypeDraft());

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
            setLogTypes([]);
            setIsLoading(false);
            setError("");
            return;
        }

        let isMounted = true;

        const loadHomeData = async () => {
            setIsLoading(true);
            setError("");

            try {
                const [trackerResults, logTypeResults] = await Promise.all([
                    listUserTrackers(userId),
                    listUserLogTypes(userId)
                ]);

                if (!isMounted) {
                    return;
                }

                setTrackers(sortTrackersByName(trackerResults));
                setLogTypes(sortLogTypesByName(logTypeResults));
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message || "Unable to load your data right now.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadHomeData();

        return () => {
            isMounted = false;
        };
    }, [authResolved, userId]);

    const openCreateTrackerModal = () => {
        setTrackerDraft(createTrackerDraft());
        setCreateTrackerError("");
        setIsCreateTrackerModalOpen(true);
    };

    const closeCreateTrackerModal = () => {
        if (isCreatingTracker) {
            return;
        }

        setIsCreateTrackerModalOpen(false);
        setCreateTrackerError("");
        setTrackerDraft(createTrackerDraft());
    };

    const openCreateLogTypeModal = () => {
        setLogTypeDraft(createLogTypeDraft());
        setLogTypeError("");
        setIsCreateLogTypeModalOpen(true);
    };

    const closeCreateLogTypeModal = () => {
        if (isSavingLogType) {
            return;
        }

        setIsCreateLogTypeModalOpen(false);
        setLogTypeError("");
        setLogTypeDraft(createLogTypeDraft());
    };

    const updateTrackerDraft = (field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            [field]: value
        }));
    };

    const updateLogTypeDraft = (field, value) => {
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

    const handleCreateTracker = async (event) => {
        event.preventDefault();

        if (!userId) {
            setCreateTrackerError("You must be signed in to create a tracker.");
            return;
        }

        const trimmedName = trackerDraft.name.trim();

        if (!trimmedName) {
            setCreateTrackerError("Tracker name is required.");
            return;
        }

        setIsCreatingTracker(true);
        setCreateTrackerError("");

        try {
            const trackerId = await createTracker({
                ownerId: userId,
                name: trimmedName,
                category: trackerDraft.category.trim()
            });

            const trackerRecord = {
                id: trackerId,
                ownerId: userId,
                name: trimmedName,
                category: trackerDraft.category.trim(),
                isArchived: false,
                defaultLogTypeId: null
            };

            setTrackers((currentTrackers) =>
                sortTrackersByName([...currentTrackers, trackerRecord])
            );
            closeCreateTrackerModal();
        } catch (submitError) {
            setCreateTrackerError(submitError.message || "Unable to create the tracker.");
        } finally {
            setIsCreatingTracker(false);
        }
    };

    const handleCreateLogType = async (event) => {
        event.preventDefault();

        if (!userId) {
            setLogTypeError("You must be signed in to create a log type.");
            return;
        }

        const name = logTypeDraft.name.trim();
        const fields = logTypeDraft.fields
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
            const payload = {
                ownerId: userId,
                name,
                fields: fields.map((field) => ({
                    id: field.id,
                    label: field.label,
                    type: field.type,
                    required: field.required,
                    unitLabel: field.unitLabel || undefined,
                    placeholder: field.placeholder || undefined,
                    options: field.options.length > 0 ? field.options : undefined
                }))
            };
            const logTypeId = await createUserLogType(payload);

            setLogTypes((currentLogTypes) =>
                sortLogTypesByName([...currentLogTypes, { ...payload, id: logTypeId }])
            );
            closeCreateLogTypeModal();
        } catch (submitError) {
            setLogTypeError(submitError.message || "Unable to create the log type.");
        } finally {
            setIsSavingLogType(false);
        }
    };

    return (
        <main className="page page--home">
            <section className="hero-panel">
                <div>
                    <p className="hero-panel__eyebrow">Your trackers</p>
                    <h2 className="hero-panel__title">Keep every routine in one place.</h2>
                    <p className="hero-panel__body">
                        Create trackers for each workflow, then reuse the same custom log types
                        across any tracker that needs them.
                    </p>
                </div>

                <div className="hero-panel__stats">
                    <div className="hero-panel__stat-card">
                        <span className="hero-panel__stat-value">{trackers.length}</span>
                        <span className="hero-panel__stat-label">Active trackers</span>
                    </div>
                    <div className="hero-panel__stat-card">
                        <span className="hero-panel__stat-value">{logTypes.length}</span>
                        <span className="hero-panel__stat-label">Shared log types</span>
                    </div>
                    <div className="hero-panel__stat-card hero-panel__stat-card--action">
                        <span className="hero-panel__stat-value">Build</span>
                        <span className="hero-panel__stat-label">
                            Create trackers and reusable schemas separately
                        </span>
                        <div className="tracker-toolbar__actions">
                            <button
                                className="button button--secondary"
                                disabled={!userId}
                                onClick={openCreateLogTypeModal}
                                type="button"
                            >
                                New log type
                            </button>
                            <button
                                className="button button--primary"
                                disabled={!userId}
                                onClick={openCreateTrackerModal}
                                type="button"
                            >
                                Create tracker
                            </button>
                        </div>
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
                        Sign in first so the app can load the trackers and shared log types tied
                        to your account.
                    </p>
                </section>
            )}

            {authResolved && userId && (
                <>
                    <section className="panel">
                        <div className="panel__header">
                            <div>
                                <p className="section-label">Log types</p>
                                <h3>Your shared log type library</h3>
                            </div>

                            <button
                                className="button button--secondary"
                                onClick={openCreateLogTypeModal}
                                type="button"
                            >
                                New log type
                            </button>
                        </div>

                        {isLoading && <p className="status-message">Loading your library...</p>}
                        {error && <p className="status-message status-message--error">{error}</p>}

                        {!isLoading && !error && logTypes.length === 0 && (
                            <div className="empty-state">
                                <h4>No log types yet</h4>
                                <p>
                                    Create a shared log type once, then select it from any tracker
                                    page when you add logs.
                                </p>
                            </div>
                        )}

                        {!isLoading && !error && logTypes.length > 0 && (
                            <div className="builder-stack builder-stack--dense">
                                {logTypes.map((logType) => (
                                    <article className="builder-card" key={logType.id}>
                                        <div className="builder-card__header">
                                            <div>
                                                <p className="section-label">Shared log type</p>
                                                <h4>{logType.name}</h4>
                                            </div>
                                            <span className="tracker-card__badge">
                                                {(logType.fields || []).length} fields
                                            </span>
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
                                <p className="section-label">Tracker overview</p>
                                <h3>Your tracker library</h3>
                            </div>

                            <button
                                className="button button--secondary"
                                onClick={openCreateTrackerModal}
                                type="button"
                            >
                                New tracker
                            </button>
                        </div>

                        {isLoading && <p className="status-message">Loading trackers...</p>}

                        {!isLoading && !error && trackers.length === 0 && (
                            <div className="empty-state">
                                <h4>No trackers yet</h4>
                                <p>
                                    Create a tracker first, then choose from your shared custom log
                                    types on the tracker page.
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
                                        <p>Open this tracker to view logs and use your shared log types.</p>
                                        <span className="tracker-card__cta">Open tracker</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </>
            )}

            {isCreateTrackerModalOpen && (
                <div className="modal-backdrop" onClick={closeCreateTrackerModal} role="presentation">
                    <div
                        aria-modal="true"
                        className="modal"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">Create tracker</p>
                                <h3>Create a tracker</h3>
                            </div>
                            <button
                                aria-label="Close tracker form"
                                className="modal__close"
                                onClick={closeCreateTrackerModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleCreateTracker}>
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

                            {createTrackerError && (
                                <p className="status-message status-message--error">
                                    {createTrackerError}
                                </p>
                            )}

                            <div className="modal__actions">
                                <button
                                    className="button button--secondary"
                                    onClick={closeCreateTrackerModal}
                                    type="button"
                                >
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

            {isCreateLogTypeModalOpen && (
                <div className="modal-backdrop" role="presentation" onClick={closeCreateLogTypeModal}>
                    <div
                        aria-modal="true"
                        className="modal modal--wide"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">New log type</p>
                                <h3>Define a shared schema</h3>
                            </div>
                            <button
                                aria-label="Close log type form"
                                className="modal__close"
                                onClick={closeCreateLogTypeModal}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <form className="modal__form" onSubmit={handleCreateLogType}>
                            <section className="builder-section">
                                <div className="builder-grid">
                                    <label className="field-group">
                                        <span>Log type name</span>
                                        <input
                                            placeholder="Fertilizer treatment"
                                            required
                                            value={logTypeDraft.name}
                                            onChange={(event) => updateLogTypeDraft("name", event.target.value)}
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
                                <button className="button button--secondary" onClick={closeCreateLogTypeModal} type="button">
                                    Cancel
                                </button>
                                <button className="button button--primary" disabled={isSavingLogType} type="submit">
                                    {isSavingLogType ? "Saving..." : "Create log type"}
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