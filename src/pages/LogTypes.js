import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import { listUserLogTypes } from "../services/firestore";

const sortLogTypesByName = (items) => {
    return [...items].sort((left, right) => left.name.localeCompare(right.name));
};

const LogTypes = () => {
    const navigate = useNavigate();
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [logTypes, setLogTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

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
            setLogTypes([]);
            setIsLoading(false);
            setError("");
            return;
        }

        let isMounted = true;

        const loadLogTypes = async () => {
            setIsLoading(true);
            setError("");

            try {
                const logTypeResults = await listUserLogTypes(userId);

                if (!isMounted) {
                    return;
                }

                setLogTypes(sortLogTypesByName(logTypeResults));
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message || "Unable to load your log types right now.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadLogTypes();

        return () => {
            isMounted = false;
        };
    }, [authResolved, userId]);

    const openCreateLogTypePage = () => {
        navigate("/log-types/new", {
            state: {
                returnTo: "/log-types"
            }
        });
    };

    return (
        <main className="page page--log-types">
            <section className="page-header">
                <div>
                    <p className="section-label">Log types</p>
                    <h2>All custom log types in one place</h2>
                    <p>Review your reusable schemas and create a new log type from the library page.</p>
                </div>

                <div className="page-header__actions">
                    {authResolved && userId && (
                        <div className="page-header__meta">
                            <span className="page-header__meta-count">{logTypes.length} log types</span>
                        </div>
                    )}

                    <button
                        className="button button--primary"
                        disabled={!userId}
                        onClick={openCreateLogTypePage}
                        type="button"
                    >
                        Create log type
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
                    <p>Sign in first so the app can load and create custom log types for your account.</p>
                </section>
            )}

            {authResolved && userId && (
                <section className="panel">
                    <div className="panel__header">
                        <div>
                            <p className="section-label">Library</p>
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
                            <p>Create a shared log type once, then reuse it across any tracker.</p>
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
                                    <p>
                                        Reuse this structure anywhere you want to capture the same kind of event.
                                    </p>
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
            )}
        </main>
    );
};

export default LogTypes;