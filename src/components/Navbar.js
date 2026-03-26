import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider } from "../firebase";

const getUserInitials = (user) => {
    const nameSource = user?.displayName?.trim();

    if (nameSource) {
        const initials = nameSource
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((namePart) => namePart[0]?.toUpperCase() || "")
            .join("");

        if (initials) {
            return initials;
        }
    }

    const emailSource = user?.email?.trim();

    if (emailSource) {
        return emailSource.slice(0, 2).toUpperCase();
    }

    return "GU";
};

const Navbar = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userLabel, setUserLabel] = useState("Guest");
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState("");
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                setCurrentUser(null);
                setUserLabel("Guest");
                setIsAccountModalOpen(false);
                return;
            }

            setCurrentUser(user);
            setUserLabel(user.displayName || user.email || "Signed In");
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!isAccountModalOpen) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsAccountModalOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isAccountModalOpen]);

    const handleSignIn = async () => {
        setIsAuthenticating(true);
        setAuthError("");

        try {
            googleProvider.setCustomParameters({ prompt: "select_account" });
            await signInWithPopup(auth, googleProvider);
        } catch (signInError) {
            setAuthError(signInError.message || "Unable to sign in with Google.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSignOut = async () => {
        setIsAuthenticating(true);
        setAuthError("");

        try {
            await signOut(auth);
            setIsAccountModalOpen(false);
        } catch (signOutError) {
            setAuthError(signOutError.message || "Unable to sign out right now.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const userEmail = currentUser?.email || "Google account";
    const userInitials = getUserInitials(currentUser);

    const renderAvatar = (sizeClassName = "") => {
        if (currentUser?.photoURL) {
            return (
                <img
                    alt={currentUser.displayName ? `${currentUser.displayName} profile` : "User profile"}
                    className={`topbar__avatar ${sizeClassName}`.trim()}
                    referrerPolicy="no-referrer"
                    src={currentUser.photoURL}
                />
            );
        }

        return (
            <span className={`topbar__avatar topbar__avatar--initials ${sizeClassName}`.trim()}>
                {userInitials}
            </span>
        );
    };

    return (
        <>
            <header className="topbar">
                <div className="topbar__content">
                    <Link className="topbar__brand" to="/">
                        <span className="topbar__brand-mark">TR</span>
                        <div>
                            <p className="topbar__eyebrow">Life tracking</p>
                            <h1>Tracker</h1>
                        </div>
                    </Link>

                    <nav className="topbar__nav" aria-label="Primary">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                                isActive ? "topbar__link topbar__link--active" : "topbar__link"
                            }
                        >
                            Home
                        </NavLink>
                        <NavLink
                            to="/trackers"
                            className={({ isActive }) =>
                                isActive ? "topbar__link topbar__link--active" : "topbar__link"
                            }
                        >
                            Trackers
                        </NavLink>
                        <NavLink
                            to="/log-types"
                            className={({ isActive }) =>
                                isActive ? "topbar__link topbar__link--active" : "topbar__link"
                            }
                        >
                            Log Types
                        </NavLink>
                    </nav>

                    <div className="topbar__session">
                        <div className="topbar__session-panel">
                            {currentUser ? (
                                <button
                                    aria-expanded={isAccountModalOpen}
                                    aria-haspopup="dialog"
                                    aria-label={`Open account details for ${userLabel}`}
                                    className="topbar__profile-button"
                                    disabled={isAuthenticating}
                                    onClick={() => setIsAccountModalOpen(true)}
                                    type="button"
                                >
                                    {renderAvatar()}
                                </button>
                            ) : (
                                <button
                                    className="button button--primary"
                                    disabled={isAuthenticating}
                                    onClick={handleSignIn}
                                    type="button"
                                >
                                    {isAuthenticating ? "Signing in..." : "Sign in with Google"}
                                </button>
                            )}

                            {authError && (
                                <span className="topbar__status topbar__status--error">{authError}</span>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {currentUser && isAccountModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsAccountModalOpen(false)} role="presentation">
                    <div
                        aria-labelledby="account-dialog-title"
                        aria-modal="true"
                        className="modal topbar__account-modal"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                    >
                        <div className="modal__header">
                            <div>
                                <p className="section-label">Account</p>
                                <h3 id="account-dialog-title">Signed in as {userLabel}</h3>
                            </div>
                            <button
                                aria-label="Close account dialog"
                                className="modal__close"
                                onClick={() => setIsAccountModalOpen(false)}
                                type="button"
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal__form topbar__account-body">
                            <div className="topbar__account-summary">
                                {renderAvatar("topbar__avatar--large")}

                                <div className="topbar__account-copy">
                                    <strong className="topbar__account-name">{userLabel}</strong>
                                    <span className="topbar__account-email">{userEmail}</span>
                                </div>
                            </div>

                            {authError && (
                                <p className="topbar__account-error">{authError}</p>
                            )}

                            <div className="modal__actions">
                                <button
                                    className="button button--secondary"
                                    disabled={isAuthenticating}
                                    onClick={handleSignOut}
                                    type="button"
                                >
                                    {isAuthenticating ? "Signing out..." : "Sign out"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default Navbar;