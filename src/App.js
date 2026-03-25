import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from './pages/Home';
import LogTypeBuilder from './pages/LogTypeBuilder';
import Tracker from './pages/Tracker';
import Navbar from './components/Navbar';
import './App.css';

const App = () => {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar/>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/log-types/new" element={<LogTypeBuilder />} />
          <Route path="/trackers/:trackerId" element={<Tracker />} />
          <Route path="/trackers/:trackerId/log-types/new" element={<LogTypeBuilder />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App;