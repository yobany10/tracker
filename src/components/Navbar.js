import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider } from "../firebase";

const Navbar = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userLabel, setUserLabel] = useState("Guest");
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState("");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                setCurrentUser(null);
                setUserLabel("Guest");
                return;
            }

            setCurrentUser(user);
            setUserLabel(user.displayName || user.email || "Signed In");
        });

        return unsubscribe;
    }, []);

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
        } catch (signOutError) {
            setAuthError(signOutError.message || "Unable to sign out right now.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    return (
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
                        className={({ isActive }) =>
                            isActive ? "topbar__link topbar__link--active" : "topbar__link"
                        }
                    >
                        Home
                    </NavLink>
                </nav>

                <div className="topbar__session">
                    <div className="topbar__user-card">
                        <span className="topbar__user-label">Active user</span>
                        <strong>{userLabel}</strong>
                        {authError && (
                            <span className="topbar__status topbar__status--error">{authError}</span>
                        )}
                    </div>

                    {currentUser ? (
                        <button
                            className="button button--secondary"
                            disabled={isAuthenticating}
                            onClick={handleSignOut}
                            type="button"
                        >
                            {isAuthenticating ? "Signing out..." : "Sign out"}
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
            </div>
        </header>
    )
}

export default Navbar;