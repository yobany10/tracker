import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider } from "../firebase";

const MOBILE_NAV_MEDIA_QUERY = "(max-width: 820px)";
const NAV_LINKS = [
    { to: "/", label: "Home", end: true },
    { to: "/trackers", label: "Trackers" }
];

const getIsMobileViewport = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }

    return window.matchMedia(MOBILE_NAV_MEDIA_QUERY)?.matches ?? false;
};

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
    const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
        if (!window.matchMedia) {
            return undefined;
        }

        const mediaQueryList = window.matchMedia(MOBILE_NAV_MEDIA_QUERY);

        if (!mediaQueryList) {
            return undefined;
        }

        const handleViewportChange = (event) => {
            setIsMobileViewport(event.matches);

            if (!event.matches) {
                setIsMobileNavOpen(false);
            }
        };

        setIsMobileViewport(mediaQueryList.matches);

        if (mediaQueryList.addEventListener) {
            mediaQueryList.addEventListener("change", handleViewportChange);

            return () => {
                mediaQueryList.removeEventListener("change", handleViewportChange);
            };
        }

        mediaQueryList.addListener(handleViewportChange);

        return () => {
            mediaQueryList.removeListener(handleViewportChange);
        };
    }, []);

    useEffect(() => {
        if (!isAccountModalOpen && !isMobileNavOpen) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsAccountModalOpen(false);
                setIsMobileNavOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isAccountModalOpen, isMobileNavOpen]);

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
    const isNavExpanded = !isMobileViewport || isMobileNavOpen;

    const handleNavLinkClick = () => {
        if (isMobileViewport) {
            setIsMobileNavOpen(false);
        }
    };

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
                    <div className="topbar__header-row">
                        <Link className="topbar__brand" to="/">
                            <span className="topbar__brand-mark">TR</span>
                            <div>
                                <p className="topbar__eyebrow">Life tracking</p>
                                <h1>Tracker</h1>
                            </div>
                        </Link>

                        <nav
                            aria-label="Primary"
                            className={`topbar__nav ${isNavExpanded ? "topbar__nav--open" : "topbar__nav--collapsed"}`}
                            hidden={isMobileViewport && !isMobileNavOpen}
                            id="primary-navigation"
                        >
                            {NAV_LINKS.map(({ to, label, end }) => (
                                <NavLink
                                    key={to}
                                    className={({ isActive }) =>
                                        isActive ? "topbar__link topbar__link--active" : "topbar__link"
                                    }
                                    end={end}
                                    onClick={handleNavLinkClick}
                                    to={to}
                                >
                                    {label}
                                </NavLink>
                            ))}
                        </nav>

                        <div className="topbar__session">
                            <div className="topbar__session-panel">
                                <div className="topbar__session-controls">
                                    {isMobileViewport && (
                                        <button
                                            aria-controls="primary-navigation"
                                            aria-expanded={isMobileNavOpen}
                                            aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
                                            className="topbar__menu-button"
                                            onClick={() => setIsMobileNavOpen((previousState) => !previousState)}
                                            type="button"
                                        >
                                            <span className="topbar__menu-label">
                                                {isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
                                            </span>
                                            <span aria-hidden="true" className="topbar__menu-icon" />
                                            <span aria-hidden="true" className="topbar__menu-icon" />
                                            <span aria-hidden="true" className="topbar__menu-icon" />
                                        </button>
                                    )}

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
                                </div>

                                {authError && (
                                    <span className="topbar__status topbar__status--error">{authError}</span>
                                )}
                            </div>
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
    );
};

export default Navbar;