import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onAuthStateChanged } from "firebase/auth";

import Navbar from "./components/Navbar";

const mockSignInWithPopup = jest.fn();
const mockSignOut = jest.fn();

let mockAuthUser = null;

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(mockAuthUser);
    return jest.fn();
  }),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  signOut: (...args) => mockSignOut(...args)
}));

jest.mock("./firebase", () => ({
  auth: {},
  googleProvider: {
    setCustomParameters: jest.fn()
  }
}));

jest.mock("react-router-dom", () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  NavLink: ({ children, className, ...props }) => {
    const resolvedClassName = typeof className === "function" ? className({ isActive: false }) : className;
    return <a className={resolvedClassName} {...props}>{children}</a>;
  }
}), { virtual: true });

const renderNavbar = () => {
  return render(<Navbar />);
};

beforeEach(() => {
  mockAuthUser = null;
  mockSignInWithPopup.mockReset();
  mockSignOut.mockReset();
  mockSignInWithPopup.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  onAuthStateChanged.mockImplementation((auth, callback) => {
    callback(mockAuthUser);
    return jest.fn();
  });
});

test("renders a Google sign-in button when no user is signed in", () => {
  renderNavbar();

  expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
});

test("opens the account modal from the avatar button and signs the user out", async () => {
  mockAuthUser = {
    displayName: "Yobany Perez",
    email: "yobany@example.com",
    photoURL: null
  };

  onAuthStateChanged.mockImplementation((auth, callback) => {
    callback(mockAuthUser);
    return jest.fn();
  });

  renderNavbar();

  const avatarButton = screen.getByRole("button", { name: /open account details for yobany perez/i });
  expect(avatarButton).toHaveTextContent("YP");

  await userEvent.click(avatarButton);

  expect(screen.getByRole("dialog", { name: /signed in as yobany perez/i })).toBeInTheDocument();
  expect(screen.getByText("yobany@example.com")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

  await waitFor(() => {
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
