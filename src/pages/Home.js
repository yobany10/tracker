import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import {
    createTracker,
    listUserLogTypes,
    listUserTrackers
} from "../services/firestore";

const createTrackerDraft = () => ({
    name: ""
});

const sortTrackersByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const sortLogTypesByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const Home = () => {
    const navigate = useNavigate();
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [trackers, setTrackers] = useState([]);
    const [logTypes, setLogTypes] = useState([]);
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

    const openCreateLogTypePage = () => {
        navigate("/log-types/new", {
            state: {
                returnTo: "/"
            }
        });
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

            setTrackers((currentTrackers) =>
                sortTrackersByName([...currentTrackers, trackerRecord])
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
                    <h2 className="hero-panel__title">Track anything you want. All in one place.</h2>
                    <p className="hero-panel__body">
                        Create trackers for different things, then use custom logs within your trackers.
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
                                onClick={openCreateLogTypePage}
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
                                onClick={openCreateLogTypePage}
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

        </main>
    );
};

export default Home;