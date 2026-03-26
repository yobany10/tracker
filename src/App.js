import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";

import Home from './pages/Home';
import LogTypes from './pages/LogTypes';
import LogTypeBuilder from './pages/LogTypeBuilder';
import Trackers from './pages/Trackers';
import Tracker from './pages/Tracker';
import Navbar from './components/Navbar';
import './App.css';

const AppLayout = () => {
  return (
    <div className="app-shell">
      <Navbar/>
      <Outlet />
    </div>
  );
};

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/trackers", element: <Trackers /> },
      { path: "/log-types", element: <LogTypes /> },
      { path: "/log-types/new", element: <LogTypeBuilder /> },
      { path: "/trackers/:trackerId", element: <Tracker /> },
      { path: "/trackers/:trackerId/log-types/new", element: <LogTypeBuilder /> }
    ]
  }
]);

const App = () => {
  return (
    <RouterProvider router={router} />
  )
}

export default App;