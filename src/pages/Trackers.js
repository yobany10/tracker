import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import { createTracker, listUserTrackers } from "../services/firestore";

const createTrackerDraft = () => ({
    name: ""
});

const sortTrackersByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const Trackers = () => {
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
            const trackerId = await createTracker({
                ownerId: userId,
                name: trimmedName
            });

            const trackerRecord = {
                id: trackerId,
                ownerId: userId,
                name: trimmedName,
                isArchived: false,
                defaultLogTypeId: null
            };

            setTrackers((currentTrackers) => sortTrackersByName([...currentTrackers, trackerRecord]));
            resetCreateTrackerModalState();
        } catch (submitError) {
            setCreateTrackerError(submitError.message || "Unable to create the tracker.");
        } finally {
            setIsCreatingTracker(false);
        }
    };

    return (
        <main className="page page--trackers">
            <section className="page-header">
                <div>
                    <p className="section-label">Trackers</p>
                    <h2>All trackers in one place</h2>
                    <p>Review your full tracker library and create a new tracker without returning home.</p>
                </div>

                <div className="page-header__actions">
                    {authResolved && userId && (
                        <div className="page-header__meta">
                            <span className="page-header__meta-count">{trackers.length} trackers</span>
                        </div>
                    )}

                    <button
                        className="button button--primary"
                        disabled={!userId}
                        onClick={openCreateTrackerModal}
                        type="button"
                    >
                        Create tracker
                    </button>
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
                    <p>Sign in first so the app can load and create trackers tied to your account.</p>
                </section>
            )}

            {authResolved && userId && (
                <section className="panel">
                    <div className="panel__header">
                        <div>
                            <p className="section-label">Library</p>
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
                            <p>Create your first tracker to start organizing logs in dedicated spaces.</p>
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
                                        {tracker.isArchived && (
                                            <span className="tracker-card__badge tracker-card__badge--muted">
                                                Archived
                                            </span>
                                        )}
                                    </div>
                                    <h4>{tracker.name}</h4>
                                    <p>Open this tracker to view logs and manage how you record activity.</p>
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

export default Trackers;