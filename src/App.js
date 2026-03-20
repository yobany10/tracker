import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from './pages/Home';
import Navbar from './components/Navbar';

const App = () => {
  return (
    <BrowserRouter>
      <div>
        <Navbar/>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App;