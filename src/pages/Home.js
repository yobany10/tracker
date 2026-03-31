import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import LogFieldsEditor from "../components/LogFieldsEditor";
import { auth } from "../firebase";
import { createTracker, listUserTrackers } from "../services/firestore";

const cloneLogFields = (fields = []) => {
    return fields.map((field) => ({
        ...field,
        options: Array.isArray(field.options) ? [...field.options] : []
    }));
};

const createTrackerDraft = () => ({
    name: "",
    logFields: []
});

const sortTrackersByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const getTotalFieldCount = (trackers) => {
    return trackers.reduce((total, tracker) => total + (tracker.logFields || []).length, 0);
};

const Home = () => {
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [trackers, setTrackers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isCreateTrackerModalOpen, setIsCreateTrackerModalOpen] = useState(false);
    const [isCreatingTracker, setIsCreatingTracker] = useState(false);
    const [createTrackerError, setCreateTrackerError] = useState("");
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

        const loadHomeData = async () => {
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

    const resetCreateTrackerModalState = () => {
        setIsCreateTrackerModalOpen(false);
        setCreateTrackerError("");
        setTrackerDraft(createTrackerDraft());
    };

    const closeCreateTrackerModal = () => {
        if (isCreatingTracker) {
            return;
        }

        resetCreateTrackerModalState();
    };

    const updateTrackerDraft = (field, value) => {
        setTrackerDraft((currentDraft) => ({
            ...currentDraft,
            [field]: value
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
            const payload = {
                ownerId: userId,
                name: trimmedName,
                logFields: cloneLogFields(trackerDraft.logFields)
            };
            const trackerId = await createTracker(payload);

            setTrackers((currentTrackers) =>
                sortTrackersByName([
                    ...currentTrackers,
                    {
                        ...payload,
                        id: trackerId,
                        isArchived: false
                    }
                ])
            );
            resetCreateTrackerModalState();
        } catch (submitError) {
            setCreateTrackerError(submitError.message || "Unable to create the tracker.");
        } finally {
            setIsCreatingTracker(false);
        }
    };

    return (
        <main className="page page--home">
            <section className="hero-panel">
                <div>
                    <p className="hero-panel__eyebrow">Welcome!</p>
                    <h2 className="hero-panel__title">Track anything you want. One tracker, one log form.</h2>
                    <p className="hero-panel__body">
                        Each tracker now defines its own log fields, so your running tracker, budget tracker,
                        and maintenance tracker can all capture different information.
                    </p>
                </div>

                <div className="hero-panel__stats">
                    <div className="hero-panel__stat-card">
                        <span className="hero-panel__stat-value">{trackers.length}</span>
                        <span className="hero-panel__stat-label">Active trackers</span>
                    </div>
                    <div className="hero-panel__stat-card">
                        <span className="hero-panel__stat-value">{getTotalFieldCount(trackers)}</span>
                        <span className="hero-panel__stat-label">Total log fields across trackers</span>
                    </div>
                    <div className="hero-panel__stat-card hero-panel__stat-card--action">
                        <span className="hero-panel__stat-value">Build</span>
                        <span className="hero-panel__stat-label">
                            Create a tracker and define the log fields it should collect.
                        </span>
                        <div className="tracker-toolbar__actions">
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
                    <p>Sign in first so the app can load the trackers tied to your account.</p>
                </section>
            )}

            {authResolved && userId && (
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
                    {error && <p className="status-message status-message--error">{error}</p>}

                    {!isLoading && !error && trackers.length === 0 && (
                        <div className="empty-state">
                            <h4>No trackers yet</h4>
                            <p>Create a tracker and define the fields every log entry should include.</p>
                        </div>
                    )}

                    {!isLoading && !error && trackers.length > 0 && (
                        <div className="tracker-grid">
                            {trackers.map((tracker) => (
                                <Link key={tracker.id} className="tracker-card" to={`/trackers/${tracker.id}`}>
                                    <div className="tracker-card__header">
                                        {tracker.isArchived && (
                                            <span className="tracker-card__badge tracker-card__badge--muted">
                                                Archived
                                            </span>
                                        )}
                                        <span className="tracker-card__badge">
                                            {(tracker.logFields || []).length} fields
                                        </span>
                                    </div>
                                    <h4>{tracker.name}</h4>
                                    <p>Open this tracker to manage its fields and log activity.</p>
                                    <span className="tracker-card__cta">Open tracker</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {isCreateTrackerModalOpen && (
                <div className="modal-backdrop" onClick={closeCreateTrackerModal} role="presentation">
                    <div
                        aria-modal="true"
                        className="modal modal--wide"
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

                            <LogFieldsEditor
                                description="Add the fields this tracker should ask for whenever you save a log entry."
                                emptyDescription="Add one or more fields now, or create the tracker first and configure them later."
                                fields={trackerDraft.logFields}
                                onChange={(nextFields) => updateTrackerDraft("logFields", nextFields)}
                                title="Choose this tracker's log fields"
                            />

                            {createTrackerError && (
                                <p className="status-message status-message--error">{createTrackerError}</p>
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
        </main>
    );
};

export default Home;