import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from './pages/Home';
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
          <Route path="/trackers/:trackerId" element={<Tracker />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App;