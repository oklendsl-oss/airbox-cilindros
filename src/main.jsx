import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          fontSize: '14px',
          borderRadius: '10px',
          background: '#fff',
          color: '#333'
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#fff'
          }
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff'
          }
        }
      }}
    />
  </React.StrictMode>
)
