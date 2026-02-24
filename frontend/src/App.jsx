import React from 'react'
import { Route, Routes } from "react-router-dom"
import Call from './pages/Call'

const App = () => {
  return (
  <Routes>
    <Route path="/" element={<h1>Home</h1>} />
    <Route path='/call' element={<Call/>} />
  </Routes>
  )
}

export default App